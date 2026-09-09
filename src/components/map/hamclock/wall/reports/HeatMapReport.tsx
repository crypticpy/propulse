import { Fragment, useMemo } from "react";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { useHeatMapBaseline } from "@/hooks/useHeatMapBaseline";
import { useUTCClock } from "@/hooks/useUTCClock";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { filterClusterAge } from "@/lib/dx/clusterHistory";
import { filterBridgeSpotAge } from "@/lib/hamclock/clusterBridge";
import {
  bucketFor,
  computeHeatmap,
  dxSpotToHeatmapInput,
  formatHeatmapRatio,
  HEATMAP_CONTINENTS,
  LADDER_HUE_PRESET,
  physicsScoreKey,
  PRESETS,
  type HeatmapCell,
  type HeatmapSpotInput,
} from "@/lib/widgets/heatmap";
import { useDXStore } from "@/stores/dxStore";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import {
  clampInsufficientHistory,
  formatBandLabel,
  heatmapAvailableMs,
  heatmapBucketClass,
  heatmapBucketColor,
  heatmapBucketLabel,
  heatmapSpotAgeMinutes,
  heatmapWindowLabel,
} from "../tiles/heatMapBuckets";
import { reportFooter } from "../tokens";
import { WallReport, type WallReportFact, type WallReportTone } from "./WallReport";

/** The tile's bucket classes narrowed to the report's five-tone chrome (the
 * report chrome has no separate "dim" state — a quiet cell reads as the
 * neutral "info" tone same as an inactive tile hero would). */
const CLASS_TO_TONE: Record<string, WallReportTone> = {
  "hc-dim-text": "info",
  "hc-info-text": "info",
  "hc-warn": "warn",
  "hc-good": "good",
  "hc-accent-text": "accent",
  "hc-bad": "bad",
};

/**
 * Centred report for the heat-map tile (workspace #654). Recomputes the same
 * band x continent grid the tile does (see `HeatMapTile`'s doc comment for
 * the data-source contract) rather than reading it back from the tile, since
 * the report can outlive its tile once pinned (`WallReport`'s pin contract).
 */
type HeatMapReportProps = { open: boolean; onClose: () => void };

export function HeatMapReport(props: HeatMapReportProps) {
  const preset = useHamClockDisplayStore((s) => s.heatmapPreset);
  return preset === "ratioDiverging" ? <RegionalHeatMapReport {...props} /> : <HeatMapReportContent {...props} />;
}

function RegionalHeatMapReport(props: HeatMapReportProps) {
  const baselineState = useHeatMapBaseline();
  return <HeatMapReportContent {...props} baselineState={baselineState} />;
}

const NO_BASELINE_BACKGROUND = "repeating-linear-gradient(135deg, var(--hc-bg) 0 3px, var(--hc-dim2) 3px 4px)";

function HeatMapReportContent({
  open,
  onClose,
  baselineState,
}: {
  open: boolean;
  onClose: () => void;
  baselineState?: ReturnType<typeof useHeatMapBaseline>;
}) {
  const now = useUTCClock(10_000);
  const allSpots = useDXStore((s) => s.spots);
  const feedState = useDXStore((s) => s.clusterFeed);
  const source = useDXStore((s) => s.spotSource);
  const maxAge = useDXStore((s) => s.filters.maxAge);
  const { bands } = useBandVerdicts();
  const { regionalCells, available, unavailableLabel, basisLabel, baselineAgeLabel, hourUtc } = baselineState ?? {
    regionalCells: [], available: false, unavailableLabel: null, basisLabel: "", baselineAgeLabel: "", hourUtc: null,
  };
  const heatmapPresetId = useHamClockDisplayStore((s) => s.heatmapPreset);
  const ratioActive = heatmapPresetId === "ratioDiverging" && available;

  // The operator's spot-age setting still governs the DX cluster LIST
  // (ClusterTile etc.) — it must never narrow what feeds the heat map's
  // fixed 20-min ladder window (see `heatmapSpotAgeMinutes`).
  const heatmapAge = heatmapSpotAgeMinutes(maxAge);
  const spots = useMemo(
    () =>
      source === "bridge"
        ? filterBridgeSpotAge(allSpots ?? [], heatmapAge, now.getTime())
        : filterClusterAge(allSpots ?? [], heatmapAge, now.getTime()),
    [allSpots, heatmapAge, now, source],
  );

  const availableMs = useMemo(
    () => heatmapAvailableMs(spots, now.getTime()),
    [spots, now],
  );

  const physicsScores = useMemo(() => {
    const scores: Record<string, number> = {};
    for (const entry of bands) {
      for (const continent of HEATMAP_CONTINENTS) {
        scores[physicsScoreKey(entry.band, continent)] =
          entry.result.inputs.physicsScore;
      }
    }
    return scores;
  }, [bands]);

  const cells = useMemo(() => {
    if (ratioActive) return regionalCells;
    const inputs: HeatmapSpotInput[] = [];
    for (const spot of spots) {
      const input = dxSpotToHeatmapInput(spot);
      if (input) inputs.push(input);
    }
    return computeHeatmap(inputs, { now: now.getTime(), physicsScores }).map((cell) =>
      clampInsufficientHistory(cell, availableMs),
    );
  }, [spots, physicsScores, now, availableMs, ratioActive, regionalCells]);

  const preset = useMemo(
    () => heatmapPresetId === "ratioDiverging" && !available
      ? LADDER_HUE_PRESET
      : PRESETS.find((p) => p.id === heatmapPresetId) ?? LADDER_HUE_PRESET,
    [heatmapPresetId, available],
  );

  const cellMap = useMemo(
    () =>
      new Map(cells.map((cell) => [physicsScoreKey(cell.band, cell.continent), cell])),
    [cells],
  );

  const { hottest, totalCount, activeCells } = useMemo(() => {
    let hottest: HeatmapCell | null = null;
    let bestBucket = -1;
    let total = 0;
    let active = 0;
    for (const cell of cells) {
      total += cell.count;
      if (ratioActive && cell.ratio === null) continue;
      if (cell.count === 0) continue;
      active += 1;
      const bucket = bucketFor(cell, preset.scale);
      if (
        bucket > bestBucket ||
        (bucket === bestBucket && hottest && cell.count > hottest.count)
      ) {
        bestBucket = bucket;
        hottest = cell;
      }
    }
    return { hottest, totalCount: total, activeCells: active };
  }, [cells, preset, ratioActive]);

  const latestSpot = useMemo(() => {
    const times = spots
      .map((spot) => new Date(spot.time).getTime())
      .filter((time) => Number.isFinite(time));
    return feedState.observedAt ?? (times.length ? Math.max(...times) : null);
  }, [spots, feedState.observedAt]);

  const { footer, updated } = reportFooter(
    ratioActive ? basisLabel : `${source === "bridge" ? "CLUSTER BRIDGE" : "DX REST"} · ${feedState.state} · ${preset.label.toUpperCase()}`,
    ratioActive && hourUtc ? Date.parse(hourUtc) : latestSpot,
  );

  const bucket = hottest ? bucketFor(hottest, preset.scale) : -1;
  const toneClass = hottest ? heatmapBucketClass(preset.id, bucket) : "hc-dim-text";
  const tone = CLASS_TO_TONE[toneClass] ?? "info";

  const facts: WallReportFact[] = [
    { label: "HOTTEST BAND", value: hottest ? formatBandLabel(hottest.band) : "—" },
    { label: "HOTTEST CONTINENT", value: hottest ? hottest.continent : "—" },
    { label: "ACTIVE CELLS", value: activeCells },
    { label: ratioActive ? "TOTAL SPOTS" : "TOTAL DX", value: totalCount },
    { label: "WINDOW", value: ratioActive ? "1 COMPLETE UTC HOUR" : heatmapWindowLabel(availableMs) },
    { label: "COLOURS", value: preset.label.toUpperCase() },
    ...(heatmapPresetId === "ratioDiverging" ? [{ label: "BASELINE", value: unavailableLabel ?? baselineAgeLabel }] : []),
  ];

  const bucketCount = preset.scale.thresholds.length + 1;
  const legend = Array.from({ length: bucketCount }, (_, index) => index);

  return (
    <WallReport
      open={open}
      onClose={onClose}
      title="Band heat map report"
      tone={tone}
      hero={hottest ? formatBandLabel(hottest.band).toUpperCase() : "—"}
      verdict={hottest ? hottest.continent : ratioActive && totalCount > 0 ? "NO QUALIFIED ACTIVITY" : "NO SPOTS"}
      facts={facts}
      footer={footer}
      updated={updated}
      pinId="heat-map"
      pinElement={<HeatMapReport open onClose={onClose} />}
    >
      <div
        className="hcr-heatgrid"
        style={{
          gridTemplateColumns: `4vw repeat(${HEATMAP_CONTINENTS.length}, 1fr)`,
        }}
      >
        <span className="hcr-heatgrid-corner" />
        {HEATMAP_CONTINENTS.map((continent) => (
          <span key={continent} className="hcr-heatgrid-head">
            {continent}
          </span>
        ))}
        {BAND_ORDER.map((band) => (
          <Fragment key={band}>
            <span className="hcr-heatgrid-band">{formatBandLabel(band)}</span>
            {HEATMAP_CONTINENTS.map((continent) => {
              const cell = cellMap.get(physicsScoreKey(band, continent));
              const cellBucket = cell ? bucketFor(cell, preset.scale) : 0;
              const noBaseline = ratioActive && cell?.ratio == null;
              return (
                <span
                  key={continent}
                  className="hcr-heatgrid-cell"
                  data-no-baseline={noBaseline || undefined}
                  style={{
                    background: noBaseline ? NO_BASELINE_BACKGROUND : heatmapBucketColor(preset.id, cellBucket),
                    color: noBaseline ? "var(--hc-fg)" : undefined,
                    whiteSpace: "nowrap", minWidth: 0, overflow: "hidden",
                    fontSize: ratioActive ? "1.1vh" : undefined,
                  }}
                  title={`${formatBandLabel(band)} · ${continent} · ${cell?.count ?? 0} ${ratioActive ? `SPOTS · ${formatHeatmapRatio(cell?.ratio ?? null)} LOG2 RATIO` : "DX"}`}
                >
                  {ratioActive ? `${cell?.count ?? 0} / ${formatHeatmapRatio(cell?.ratio ?? null)}` : cell && cell.count > 0 ? cell.count : ""}
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="hcr-heatgrid-legend">
        {ratioActive && <span className="hcr-heatgrid-swatch-row"><span className="hcr-heatgrid-swatch" style={{ background: NO_BASELINE_BACKGROUND }} />NO BASELINE (not measured quiet)</span>}
        {ratioActive && <span>Cells: regional spots / log2 ratio. {"\u2264 / \u2265"} mark the display limits; NO BASELINE means no qualified median.</span>}
        {legend.map((index) => (
          <span key={index} className="hcr-heatgrid-swatch-row">
            <span
              className="hcr-heatgrid-swatch"
              style={{ background: heatmapBucketColor(preset.id, index) }}
            />
            {heatmapBucketLabel(preset.id, index)}
          </span>
        ))}
      </div>
    </WallReport>
  );
}

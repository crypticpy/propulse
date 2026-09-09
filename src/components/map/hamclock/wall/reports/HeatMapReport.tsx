import { Fragment, useMemo } from "react";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { useUTCClock } from "@/hooks/useUTCClock";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { filterClusterAge } from "@/lib/dx/clusterHistory";
import { filterBridgeSpotAge } from "@/lib/hamclock/clusterBridge";
import {
  bucketFor,
  computeHeatmap,
  dxSpotToHeatmapInput,
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
  formatBandLabel,
  heatmapBucketClass,
  heatmapBucketColor,
  heatmapBucketLabel,
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
export function HeatMapReport({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const now = useUTCClock(10_000);
  const allSpots = useDXStore((s) => s.spots);
  const feedState = useDXStore((s) => s.clusterFeed);
  const source = useDXStore((s) => s.spotSource);
  const maxAge = useDXStore((s) => s.filters.maxAge);
  const { bands } = useBandVerdicts();
  const heatmapPresetId = useHamClockDisplayStore((s) => s.heatmapPreset);

  const spots = useMemo(
    () =>
      source === "bridge"
        ? filterBridgeSpotAge(allSpots ?? [], maxAge, now.getTime())
        : filterClusterAge(allSpots ?? [], maxAge, now.getTime()),
    [allSpots, maxAge, now, source],
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
    const inputs: HeatmapSpotInput[] = [];
    for (const spot of spots) {
      const input = dxSpotToHeatmapInput(spot);
      if (input) inputs.push(input);
    }
    return computeHeatmap(inputs, { now: now.getTime(), physicsScores });
  }, [spots, physicsScores, now]);

  const preset = useMemo(
    () => PRESETS.find((p) => p.id === heatmapPresetId) ?? LADDER_HUE_PRESET,
    [heatmapPresetId],
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
  }, [cells, preset]);

  const latestSpot = useMemo(() => {
    const times = spots
      .map((spot) => new Date(spot.time).getTime())
      .filter((time) => Number.isFinite(time));
    return feedState.observedAt ?? (times.length ? Math.max(...times) : null);
  }, [spots, feedState.observedAt]);

  const { footer, updated } = reportFooter(
    `${source === "bridge" ? "CLUSTER BRIDGE" : "DX REST"} · ${feedState.state} · ${preset.label.toUpperCase()}`,
    latestSpot,
  );

  const bucket = hottest ? bucketFor(hottest, preset.scale) : -1;
  const toneClass = hottest ? heatmapBucketClass(preset.id, bucket) : "hc-dim-text";
  const tone = CLASS_TO_TONE[toneClass] ?? "info";

  const facts: WallReportFact[] = [
    { label: "HOTTEST BAND", value: hottest ? formatBandLabel(hottest.band) : "—" },
    { label: "HOTTEST CONTINENT", value: hottest ? hottest.continent : "—" },
    { label: "ACTIVE CELLS", value: activeCells },
    { label: "TOTAL DX", value: totalCount },
    { label: "WINDOW", value: "20 MIN" },
    { label: "COLOURS", value: preset.label.toUpperCase() },
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
      verdict={hottest ? hottest.continent : "NO SPOTS"}
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
              return (
                <span
                  key={continent}
                  className="hcr-heatgrid-cell"
                  style={{ background: heatmapBucketColor(preset.id, cellBucket) }}
                  title={`${formatBandLabel(band)} · ${continent} · ${cell?.count ?? 0} DX`}
                >
                  {cell && cell.count > 0 ? cell.count : ""}
                </span>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="hcr-heatgrid-legend">
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

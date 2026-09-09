import { Fragment, lazy, Suspense, useMemo, useState } from "react";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { useHeatMapBaseline } from "@/hooks/useHeatMapBaseline";
import { useUTCClock } from "@/hooks/useUTCClock";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { filterClusterAge } from "@/lib/dx/clusterHistory";
import { filterBridgeSpotAge } from "@/lib/hamclock/clusterBridge";
import {
  bucketFor,
  computeHeatmap,
  DEFAULT_HEATMAP_WINDOW_MS,
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
import { HamClockTile, TileHero, TileSub, type WallTileProps } from "../HamClockTile";
import {
  clampInsufficientHistory,
  formatBandLabel,
  heatmapAvailableMs,
  heatmapBucketClass,
  heatmapBucketColor,
  heatmapSpotAgeMinutes,
  heatmapWindowLabel,
  NO_BASELINE_BACKGROUND,
} from "./heatMapBuckets";

// The report is only worth its bytes once an operator opens it.
const HeatMapReport = lazy(() =>
  import("../reports/HeatMapReport").then((m) => ({ default: m.HeatMapReport })),
);

/**
 * Band x continent heat-map tile (workspace #654). The grid is always the
 * full `computeHeatmap` matrix — no scroll, no paging inside the tile — at a
 * size the rail already handles for the forecast dot matrix (`ForecastMatrixTile`).
 *
 * Data sources:
 * - Spots: the same live feed `ClusterTile`/`BandActivityTile` read
 *   (`useDXStore`), age-filtered the same way `ClusterTile` filters it. The
 *   map's own `spotFilters` (band/mode) are deliberately NOT applied here —
 *   the grid means to show every band, not whatever the map is filtered to.
 * - Ladder verdict: `useBandVerdicts()` gives one physics score per band
 *   (the Band Health arm has no per-continent forecast); that score is
 *   applied to every continent for its band, per `computeHeatmap`'s own
 *   fallback contract.
 * - Baseline ratio: the last complete regional hour against its qualified
 *   same-UTC-hour regional climatology medians, never client feed counts,
 *   shared with the report and Settings -> Display through React Query.
 */
export function HeatMapTile(props: WallTileProps) {
  const preset = useHamClockDisplayStore((s) => s.heatmapPreset);
  return preset === "ratioDiverging" ? <RegionalHeatMapTile {...props} /> : <HeatMapTileContent {...props} />;
}

function RegionalHeatMapTile(props: WallTileProps) {
  const baselineState = useHeatMapBaseline();
  return <HeatMapTileContent {...props} baselineState={baselineState} />;
}

function HeatMapTileContent({ title = "Band heat map", baselineState }: WallTileProps & { baselineState?: ReturnType<typeof useHeatMapBaseline> }) {
  const now = useUTCClock(10_000);
  const allSpots = useDXStore((s) => s.spots);
  const feedState = useDXStore((s) => s.clusterFeed);
  const source = useDXStore((s) => s.spotSource);
  const maxAge = useDXStore((s) => s.filters.maxAge);
  const { bands } = useBandVerdicts();
  const { regionalCells, available, unavailableLabel, basisLabel, baselineAgeLabel } = baselineState ?? {
    regionalCells: [], available: false, unavailableLabel: null, basisLabel: "", baselineAgeLabel: "",
  };
  const heatmapPresetId = useHamClockDisplayStore((s) => s.heatmapPreset);
  const ratioActive = heatmapPresetId === "ratioDiverging" && available;
  const [reportOpen, setReportOpen] = useState(false);

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

  const { hottest, totalCount } = useMemo(() => {
    let hottest: HeatmapCell | null = null;
    let bestBucket = -1;
    let total = 0;
    for (const cell of cells) {
      total += cell.count;
      if (ratioActive && cell.ratio === null) continue;
      if (cell.count === 0) continue;
      const bucket = bucketFor(cell, preset.scale);
      if (
        bucket > bestBucket ||
        (bucket === bestBucket && hottest && cell.count > hottest.count)
      ) {
        bestBucket = bucket;
        hottest = cell;
      }
    }
    return { hottest, totalCount: total };
  }, [cells, preset, ratioActive]);

  const report = reportOpen ? (
    <Suspense fallback={null}>
      <HeatMapReport open onClose={() => setReportOpen(false)} />
    </Suspense>
  ) : null;

  // Honest empty state (wall spec §7): no activity in the window reads as
  // exactly that, or as the underlying feed's own state when the feed
  // itself is the reason (unavailable, loading, off) — never a fabricated
  // "ALL CLEAR".
  if (!hottest) {
    const idle = ratioActive ? totalCount > 0 ? "NO ACTIVITY WITH A QUALIFIED BASELINE" : "NO SPOTS IN LAST FULL HOUR" : ["UNAVAILABLE", "LOADING", "OFF"].includes(feedState.state)
      ? feedState.state
      : "NO SPOTS IN WINDOW";
    return (
      <>
        <HamClockTile
          title={title}
          source={ratioActive ? basisLabel : undefined}
          onOpen={() => setReportOpen(true)}
          openLabel="Band heat map: no activity in the window. Open the full grid report"
        >
          <TileHero tone="hc-dim-text">—</TileHero>
          <TileSub>
            <span>{idle}</span>
            {ratioActive && <span>{baselineAgeLabel}</span>}
            {heatmapPresetId === "ratioDiverging" && unavailableLabel && <span>{unavailableLabel}</span>}
          </TileSub>
        </HamClockTile>
        {report}
      </>
    );
  }

  const bucket = bucketFor(hottest, preset.scale);
  const toneClass = heatmapBucketClass(preset.id, bucket);
  const sentence = `${formatBandLabel(hottest.band)} → ${hottest.continent} is the hottest cell`;
  const summary = cells
    .filter((cell) => cell.count > 0)
    .map((cell) => ratioActive && cell.ratio === null
      ? `${cell.band} ${cell.continent} no baseline`
      : `${cell.band} ${cell.continent} ${cell.count}`)
    .join(", ");

  return (
    <>
      <HamClockTile
        title={title}
        source={
          ratioActive ? basisLabel : availableMs < DEFAULT_HEATMAP_WINDOW_MS
            ? `${totalCount} DX · ${heatmapWindowLabel(availableMs)}`
            : `${totalCount} DX · ${preset.label.toUpperCase()}`
        }
        state={heatmapBucketColor(preset.id, bucket)}
        onOpen={() => setReportOpen(true)}
        openLabel={`Band heat map: ${sentence}. Open the full grid report`}
      >
        <div className="hc-heroline">
          <TileHero tone={toneClass} flush>
            {hottest.band.toUpperCase()}
          </TileHero>
          <div className={`hc-verdict hc-glow ${toneClass}`}>{hottest.continent}</div>
        </div>
        <TileSub>
          <span>{sentence}</span>
          {ratioActive && <span>{baselineAgeLabel}</span>}
          {ratioActive && <span>HATCHED: NO BASELINE</span>}
          {heatmapPresetId === "ratioDiverging" && unavailableLabel && <span>{unavailableLabel}</span>}
        </TileSub>

        <div
          className="hcf-heatgrid"
          style={{
            gridTemplateColumns: `2.6vw repeat(${HEATMAP_CONTINENTS.length}, 1fr)`,
          }}
          aria-hidden="true"
        >
          <span className="hcf-heatgrid-corner" />
          {HEATMAP_CONTINENTS.map((continent) => (
            <span key={continent} className="hcf-heatgrid-head">
              {continent}
            </span>
          ))}
          {BAND_ORDER.map((band) => (
            <Fragment key={band}>
              <span className="hcf-heatgrid-band">{band}</span>
              {HEATMAP_CONTINENTS.map((continent) => {
                const cell = cellMap.get(physicsScoreKey(band, continent));
                const cellBucket = cell ? bucketFor(cell, preset.scale) : 0;
                const noBaseline = ratioActive && cell?.ratio == null;
                return (
                  <span
                    key={continent}
                    className="hcf-heatgrid-cell"
                    data-no-baseline={noBaseline || undefined}
                    style={{ background: noBaseline ? NO_BASELINE_BACKGROUND : heatmapBucketColor(preset.id, cellBucket) }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
        <p className="sr-only">{summary}</p>
      </HamClockTile>

      {report}
    </>
  );
}

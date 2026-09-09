import { Fragment, useMemo, useState } from "react";
import { useUTCClock } from "@/hooks/useUTCClock";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { filterClusterAge } from "@/lib/dx/clusterHistory";
import { LADDER_RANK } from "@/lib/verdict/ladder";
import {
  bucketFor,
  computeHeatmap,
  dxSpotToHeatmapInput,
  HEATMAP_CONTINENTS,
  LADDER_HUE_PRESET,
  physicsScoreKey,
  PRESETS,
  type HeatmapCell,
  type HeatMapMetric,
  type HeatMapScale,
  type HeatmapSpotInput,
} from "@/lib/widgets/heatmap";
import { useDXStore } from "@/stores/dxStore";
import { useActiveWorkspace } from "@/stores/workspaceStore";

/** Fixed scan window, independent of the DX cluster list's own age filter —
 * matches the heat-map lib's own 20-min ladder window (`DEFAULT_HEATMAP_WINDOW_MS`). */
const HEATMAP_PANEL_AGE_MINUTES = 20;

/**
 * Rank a cell by the workspace's `display.headlineRule` metric (#661). See
 * the identical helper + rationale in `HeatMapStrip.tsx` (kept local to each
 * file rather than shared, to hold the file budget for this PR).
 */
function headlineValue(cell: HeatmapCell, metric: HeatMapMetric): number {
  switch (metric) {
    case "count":
      return cell.count;
    case "reporters":
      return cell.reporters;
    case "ratio":
      return cell.ratio ?? Number.NEGATIVE_INFINITY;
    case "ladder":
      return LADDER_RANK[cell.ladder];
  }
}

export interface HeatMapPanelProps {
  /** Accepted for shape-compatibility with `WallTileProps`/the widget loader map; unused (this widget sources its own headline). */
  title?: string;
}

/**
 * Work-density heat map (#661): the full band x continent grid plus a
 * clickable-cell inspector column, replacing the wall-tile-reuse shim
 * `widgetLoaders.ts` previously had for `heatMap` at "work" density
 * (`HeatMapTile`, sized for the wall's vh-scaled rail). This is the
 * workspace-native "work" density implementation — a rail/hero panel sized
 * by its CSS grid container, not the wall's fixed hero+sub layout.
 *
 * Companion to `HeatMapStrip` (glance density): both read the same shared
 * feed (`useDXStore`) and workspace display settings
 * (`useActiveWorkspace().display`) so they always agree, and neither
 * imports `HeatMapTile.tsx` or the wall tile barrel.
 */
export function HeatMapPanel(_props: HeatMapPanelProps = {}) {
  const now = useUTCClock(10_000);
  const allSpots = useDXStore((s) => s.spots);
  const feedState = useDXStore((s) => s.clusterFeed);
  const { display } = useActiveWorkspace();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const spots = useMemo(
    () => filterClusterAge(allSpots ?? [], HEATMAP_PANEL_AGE_MINUTES, now.getTime()),
    [allSpots, now],
  );

  const preset = useMemo(
    () => PRESETS.find((p) => p.id === display.heatMap.presetId) ?? LADDER_HUE_PRESET,
    [display.heatMap.presetId],
  );
  const scale: HeatMapScale = useMemo(
    () => ({ metric: preset.scale.metric, thresholds: display.heatMap.thresholds }),
    [preset, display.heatMap.thresholds],
  );
  const colors = display.heatMap.colors.length > 0 ? display.heatMap.colors : preset.bucketColors;

  const bands = useMemo(
    () => BAND_ORDER.filter((band) => display.visibleBands.includes(band)),
    [display.visibleBands],
  );

  const cells = useMemo(() => {
    const inputs: HeatmapSpotInput[] = [];
    for (const spot of spots) {
      const input = dxSpotToHeatmapInput(spot);
      if (input) inputs.push(input);
    }
    return computeHeatmap(inputs, { now: now.getTime() });
  }, [spots, now]);

  const cellMap = useMemo(
    () => new Map(cells.map((cell) => [physicsScoreKey(cell.band, cell.continent), cell])),
    [cells],
  );

  const { headline, totalCount } = useMemo(() => {
    let headline: HeatmapCell | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    let total = 0;
    for (const cell of cells) {
      if (!display.visibleBands.includes(cell.band)) continue;
      total += cell.count;
      if (cell.count === 0) continue;
      const value = headlineValue(cell, display.headlineRule);
      if (value > bestValue || (value === bestValue && headline && cell.count > headline.count)) {
        bestValue = value;
        headline = cell;
      }
    }
    return { headline, totalCount: total };
  }, [cells, display.headlineRule, display.visibleBands]);

  const selected = (selectedKey ? cellMap.get(selectedKey) : null) ?? headline;
  const idle = ["UNAVAILABLE", "LOADING", "OFF"].includes(feedState.state) ? feedState.state : "NO SPOTS IN WINDOW";

  return (
    <div className="su-surface workspace-heatmap-panel" data-testid="heatmap-panel">
      <div className="su-inline workspace-heatmap-panel-head">
        <p className="su-eyebrow">Band x continent heat map</p>
        <p className="su-hint">{totalCount > 0 ? `${totalCount} DX in window` : idle}</p>
      </div>
      <div className="su-inline workspace-heatmap-panel-body">
        <div
          className="workspace-heatmap-grid"
          role="grid"
          aria-label="Band by continent DX activity"
          style={{ display: "grid", gridTemplateColumns: `4rem repeat(${HEATMAP_CONTINENTS.length}, 1fr)`, gap: "2px" }}
        >
          <span aria-hidden="true" />
          {HEATMAP_CONTINENTS.map((continent) => (
            <span key={continent} className="su-hint" style={{ textAlign: "center" }}>
              {continent}
            </span>
          ))}
          {bands.map((band) => (
            <Fragment key={band}>
              <span className="su-hint">{band.toUpperCase()}</span>
              {HEATMAP_CONTINENTS.map((continent) => {
                const key = physicsScoreKey(band, continent);
                const cell = cellMap.get(key);
                const bucket = cell ? bucketFor(cell, scale) : 0;
                const color = colors[bucket] ?? colors[colors.length - 1] ?? "rgb(var(--su-muted-rgb))";
                return (
                  <button
                    key={continent}
                    type="button"
                    className="workspace-heatmap-cell"
                    style={{
                      background: color,
                      minHeight: "2.75rem",
                      border: selectedKey === key ? "2px solid rgb(var(--su-accent-rgb))" : "1px solid transparent",
                    }}
                    aria-label={`${band.toUpperCase()} to ${continent}: ${cell?.count ?? 0} DX, ${cell?.reporters ?? 0} reporters, Band Health ${cell?.ladder ?? "closed"}`}
                    aria-pressed={selectedKey === key}
                    onClick={() => setSelectedKey(key)}
                  >
                    {cell && cell.count > 0 ? cell.count : ""}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
        <div className="su-stack workspace-heatmap-inspector">
          <p className="su-eyebrow">Selected cell</p>
          {selected ? (
            <>
              <p className="workspace-heatmap-inspector-headline">
                {selected.band.toUpperCase()} → {selected.continent}
              </p>
              <p className="su-hint">{`${selected.count} DX · ${selected.reporters} reporters`}</p>
              <p className="su-hint">{`Band Health: ${selected.ladder.toUpperCase()}`}</p>
              <p className="su-hint">
                {selected.ratio === null
                  ? "No baseline yet"
                  : `${selected.ratio >= 0 ? "+" : ""}${selected.ratio.toFixed(2)} vs. baseline`}
              </p>
            </>
          ) : (
            <p className="su-hint">Select a cell, or wait for activity in the window.</p>
          )}
        </div>
      </div>
    </div>
  );
}

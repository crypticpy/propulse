import { Fragment, useMemo, useState } from "react";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { useUTCClock } from "@/hooks/useUTCClock";
import { BAND_ORDER } from "@/lib/data/bandRanges";
import { filterClusterAge } from "@/lib/dx/clusterHistory";
import {
  bucketFor,
  computeHeatmap,
  dxSpotToHeatmapInput,
  HEATMAP_CONTINENTS,
  LADDER_HUE_PRESET,
  metricValue,
  physicsScoreKey,
  PRESETS,
  type HeatmapCell,
  type HeatMapScale,
  type HeatmapSpotInput,
} from "@/lib/widgets/heatmap";
import { useDXStore } from "@/stores/dxStore";
import { useActiveWorkspace } from "@/stores/workspaceStore";

/** Fixed scan window, independent of the DX cluster list's own age filter —
 * matches the heat-map lib's own 20-min ladder window (`DEFAULT_HEATMAP_WINDOW_MS`). */
const HEATMAP_PANEL_AGE_MINUTES = 20;

/** See the identical constant + rationale in `HeatMapStrip.tsx` (#686 review item 3). */
const LIVE_FEED_STATES: ReadonlySet<string> = new Set(["CURRENT", "BRIDGE"]);

function feedStateLabel(state: string): string {
  return state === "UNKNOWN" ? "FEED NOT STARTED" : state;
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
  const { bands: verdictBands } = useBandVerdicts();

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

  // One physics score per band, applied to every continent for that band —
  // same fallback contract `HeatMapTile.tsx` uses (the Band Health arm has
  // no per-continent forecast). Without this, `computeHeatmap` defaults
  // every cell's score to 0 ("closed"), so a forecast-open band with no
  // spots yet always reads Band Health "closed" instead of "forecast"
  // (#686 review item 9, Codex PRRT_kwDORFr4R86ggBm7).
  const physicsScores = useMemo(() => {
    const scores: Record<string, number> = {};
    for (const entry of verdictBands) {
      for (const continent of HEATMAP_CONTINENTS) {
        scores[physicsScoreKey(entry.band, continent)] = entry.result.inputs.physicsScore;
      }
    }
    return scores;
  }, [verdictBands]);

  const cells = useMemo(() => {
    const inputs: HeatmapSpotInput[] = [];
    for (const spot of spots) {
      const input = dxSpotToHeatmapInput(spot);
      if (input) inputs.push(input);
    }
    return computeHeatmap(inputs, { now: now.getTime(), physicsScores });
  }, [spots, now, physicsScores]);

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
      const value = metricValue(cell, display.headlineRule);
      // `!headline` seeds from the first counted cell (#686 review item 4,
      // Codex): see the identical fix + rationale in `HeatMapStrip.tsx`.
      if (!headline || value > bestValue || (value === bestValue && cell.count > headline.count)) {
        bestValue = value;
        headline = cell;
      }
    }
    return { headline, totalCount: total };
  }, [cells, display.headlineRule, display.visibleBands]);

  const selected = (selectedKey ? cellMap.get(selectedKey) : null) ?? headline;
  const idle = LIVE_FEED_STATES.has(feedState.state) ? "NO SPOTS IN WINDOW" : feedStateLabel(feedState.state);

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

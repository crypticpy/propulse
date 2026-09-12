import { useMemo } from "react";
import { useBandVerdicts } from "@/hooks/useBandVerdicts";
import { useUTCClock } from "@/hooks/useUTCClock";
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
const HEATMAP_STRIP_AGE_MINUTES = 20;

/**
 * Feed states that mean "the feed is actually live" (`useDXCluster.ts`'s
 * `spotFeedState`/bridge vocabulary): everything else (`"UNKNOWN"` —
 * `dxStore.ts`'s own default before anything has started the feed —
 * `"OFF"`, `"BRIDGE OFF"`, `"STALE"`, `"UNAVAILABLE"`, `"LOADING"`,
 * `"NO DATA"`, `"NO REPORTS"`) means an empty grid does not mean "quiet
 * band conditions" — it means the feed itself has nothing to say (#686
 * review item 3). `OpsConsole` never starts the feed on a non-Observe tab,
 * so without this the strip would read a merely-unstarted feed as an
 * honest "no activity" reading.
 */
const LIVE_FEED_STATES: ReadonlySet<string> = new Set(["CURRENT", "BRIDGE"]);

function feedStateLabel(state: string): string {
  return state === "UNKNOWN" ? "FEED NOT STARTED" : state;
}

export interface HeatMapStripProps {
  /** Accepted for shape-compatibility with `WallTileProps`/the widget loader map; unused (this widget sources its own headline, same convention as `BestBandTile`/`ClusterTile`). */
  title?: string;
}

/**
 * Glance-density heat map (#661): a one-line "hottest cell right now" strip
 * for an always-visible header (mounted in `OpsConsole`) or any future
 * glance surface — never a grid; the full band x continent grid is
 * `HeatMapPanel`'s work-density job.
 *
 * Styled with plain Tailwind + `su-*` colour tokens (`OpsConsole.tsx`'s own
 * convention), not the `station-ui` component classes (`su-surface` etc.):
 * this widget mounts both inside `StationProvider`'s scope (workspace glance
 * density, via `widgetLoaders.ts`) and outside it (`OpsConsole`'s header,
 * which is plain Tailwind, no `StationProvider` ancestor), and the `su-*`
 * component classes only resolve once `station-ui.css` has loaded, which is
 * not guaranteed on the second path.
 *
 * Reads the same shared DX feed (`useDXStore`) and workspace display
 * settings (`useActiveWorkspace().display`) as `HeatMapPanel`, so the two
 * widgets always agree. Independently computes `computeHeatmap`/`bucketFor`
 * from the public `@/lib/widgets/heatmap` surface (reserved read-only,
 * #668 rework in flight) — never imports the wall tile barrel or
 * `HeatMapTile.tsx`.
 */
export function HeatMapStrip(_props: HeatMapStripProps = {}) {
  const now = useUTCClock(10_000);
  const allSpots = useDXStore((s) => s.spots);
  const feedState = useDXStore((s) => s.clusterFeed);
  const { display } = useActiveWorkspace();
  const { bands } = useBandVerdicts();

  const spots = useMemo(
    () => filterClusterAge(allSpots ?? [], HEATMAP_STRIP_AGE_MINUTES, now.getTime()),
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

  // One physics score per band, applied to every continent for that band —
  // same fallback contract `HeatMapTile.tsx` uses (the Band Health arm has
  // no per-continent forecast). Without this, `computeHeatmap` defaults
  // every cell's score to 0 ("closed"), so a forecast-open band with no
  // spots yet always reads Band Health "closed" instead of "forecast"
  // (#686 review item 9, Codex PRRT_kwDORFr4R86ggBm7).
  const physicsScores = useMemo(() => {
    const scores: Record<string, number> = {};
    for (const entry of bands) {
      for (const continent of HEATMAP_CONTINENTS) {
        scores[physicsScoreKey(entry.band, continent)] = entry.result.inputs.physicsScore;
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
    return computeHeatmap(inputs, { now: now.getTime(), physicsScores }).filter((cell) =>
      display.visibleBands.includes(cell.band),
    );
  }, [spots, now, physicsScores, display.visibleBands]);

  const { headline, totalCount } = useMemo(() => {
    let headline: HeatmapCell | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    let total = 0;
    for (const cell of cells) {
      total += cell.count;
      if (cell.count === 0) continue;
      const value = metricValue(cell, display.headlineRule);
      // `!headline` seeds from the first counted cell (#686 review item 4,
      // Codex): with `headlineRule: "ratio"` and no baseline, every cell's
      // value is the same `Number.NEGATIVE_INFINITY` sentinel, so
      // `value > bestValue` was never true and the tie-break branch never
      // ran either (it required a `headline` that was never set) — the
      // empty state showed even with a counted cell.
      if (!headline || value > bestValue || (value === bestValue && cell.count > headline.count)) {
        bestValue = value;
        headline = cell;
      }
    }
    return { headline, totalCount: total };
  }, [cells, display.headlineRule]);

  if (!headline) {
    // Honest empty state (matches the wall's own convention, `HeatMapTile`):
    // no activity in the window reads as exactly that, ONLY when the feed
    // is actually live — otherwise the feed's own state is the reason, not
    // "quiet band conditions" (#686 review item 3).
    const idle = LIVE_FEED_STATES.has(feedState.state) ? "NO SPOTS IN WINDOW" : feedStateLabel(feedState.state);
    return (
      <div
        className="flex min-w-0 items-center gap-2 rounded-lg border border-su-line/40 bg-su-panel/90 px-2 py-1.5"
        data-testid="heatmap-strip"
      >
        <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-su-muted">Heat map</span>
        <span className="truncate text-xs text-su-muted">{idle}</span>
      </div>
    );
  }

  const bucket = bucketFor(headline, scale);
  const color = colors[bucket] ?? colors[colors.length - 1] ?? "rgb(var(--su-muted-rgb))";
  const sentence = `${headline.band.toUpperCase()} to ${headline.continent} is the hottest cell`;

  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-lg border border-su-line/40 bg-su-panel/90 px-2 py-1.5"
      data-testid="heatmap-strip"
    >
      <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-su-muted">Heat map</span>
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className="shrink-0 text-xs font-bold text-su-text">
        {headline.band.toUpperCase()} → {headline.continent}
      </span>
      <span className="truncate text-xs text-su-muted">{`${totalCount} DX in window · ${sentence}`}</span>
    </div>
  );
}

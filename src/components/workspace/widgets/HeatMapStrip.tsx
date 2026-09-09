import { useMemo } from "react";
import { useUTCClock } from "@/hooks/useUTCClock";
import { filterClusterAge } from "@/lib/dx/clusterHistory";
import { LADDER_RANK } from "@/lib/verdict/ladder";
import {
  bucketFor,
  computeHeatmap,
  dxSpotToHeatmapInput,
  LADDER_HUE_PRESET,
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
const HEATMAP_STRIP_AGE_MINUTES = 20;

/**
 * Rank a cell by the workspace's `display.headlineRule` metric (#661). A
 * small local equivalent of `compute.ts`'s private `metricValue()`, which is
 * not exported — this is derived only from `HeatmapCell`'s public fields
 * plus the exported `LADDER_RANK`, so it does not touch the reserved
 * heat-map lib (read-only here; #668 tracks its rework).
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

  const cells = useMemo(() => {
    const inputs: HeatmapSpotInput[] = [];
    for (const spot of spots) {
      const input = dxSpotToHeatmapInput(spot);
      if (input) inputs.push(input);
    }
    return computeHeatmap(inputs, { now: now.getTime() }).filter((cell) =>
      display.visibleBands.includes(cell.band),
    );
  }, [spots, now, display.visibleBands]);

  const { headline, totalCount } = useMemo(() => {
    let headline: HeatmapCell | null = null;
    let bestValue = Number.NEGATIVE_INFINITY;
    let total = 0;
    for (const cell of cells) {
      total += cell.count;
      if (cell.count === 0) continue;
      const value = headlineValue(cell, display.headlineRule);
      if (value > bestValue || (value === bestValue && headline && cell.count > headline.count)) {
        bestValue = value;
        headline = cell;
      }
    }
    return { headline, totalCount: total };
  }, [cells, display.headlineRule]);

  if (!headline) {
    // Honest empty state (matches the wall's own convention, `HeatMapTile`):
    // no activity in the window reads as exactly that, or as the feed's own
    // state when the feed itself is the reason — never a fabricated value.
    const idle = ["UNAVAILABLE", "LOADING", "OFF"].includes(feedState.state)
      ? feedState.state
      : "NO SPOTS IN WINDOW";
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-su-line/40 bg-su-panel/90 px-2 py-1.5"
        data-testid="heatmap-strip"
      >
        <span className="text-[9px] font-bold uppercase tracking-wider text-su-muted">Heat map</span>
        <span className="text-[10px] text-su-muted">{idle}</span>
      </div>
    );
  }

  const bucket = bucketFor(headline, scale);
  const color = display.heatMap.colors[bucket] ?? display.heatMap.colors[display.heatMap.colors.length - 1];
  const sentence = `${headline.band.toUpperCase()} to ${headline.continent} is the hottest cell`;

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-su-line/40 bg-su-panel/90 px-2 py-1.5"
      data-testid="heatmap-strip"
    >
      <span className="text-[9px] font-bold uppercase tracking-wider text-su-muted">Heat map</span>
      <span
        className="inline-block h-3 w-3 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className="text-xs font-bold text-su-text">
        {headline.band.toUpperCase()} → {headline.continent}
      </span>
      <span className="text-[10px] text-su-muted">{`${totalCount} DX in window · ${sentence}`}</span>
    </div>
  );
}

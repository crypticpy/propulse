import { clusterAgeMinutes } from "@/lib/dx/clusterHistory";
import { DEFAULT_HEATMAP_WINDOW_MS, type HeatmapCell, type LadderState } from "@/lib/widgets/heatmap";
import type { DXSpot } from "@/types/dxcluster";
import { LADDER_WALL_LABEL, TONE_STATE } from "../tokens";

/**
 * Bucket-index -> wall-tone lookups for the heat-map tile and report
 * (workspace #654). Split out from `HeatMapTile.tsx` (react-refresh only
 * allows a component file to export components — see `useWallReliability.ts`
 * for the same split on the reliability tile) so both `HeatMapTile.tsx` and
 * `../reports/HeatMapReport.tsx` share one table instead of two copies.
 *
 * Ladder rank order (see `LADDER_RANK` in `@/lib/verdict/ladder`) — the
 * `ladderHue` preset's bucket index equals this array's index, since the
 * preset's scale thresholds are `[1, 2, 3, 4]` over the ladder rank.
 */
const LADDER_BUCKET_ORDER: readonly LadderState[] = [
  "closed",
  "forecast",
  "stirring",
  "verified",
  "hot",
];

/**
 * Bucket index -> wall tone class, per `HeatMapPreset.id`. A preset's own
 * `bucketColors` are `rgb(var(--su-*-rgb))` strings for the station-ui
 * surfaces; the wall keeps its own themed `--hc-*` tokens (design-system
 * README, "HamClock stays separate"), so a bucket index is mapped to a wall
 * tone here instead of reading the preset's colours directly.
 */
export const HEATMAP_BUCKET_CLASS: Record<string, string[]> = {
  ladderHue: LADDER_BUCKET_ORDER.map((state) => {
    switch (state) {
      case "closed":
        return "hc-dim-text";
      case "forecast":
        return "hc-info-text";
      case "stirring":
        return "hc-warn";
      case "verified":
        return "hc-good";
      case "hot":
        return "hc-accent-text";
    }
  }),
  ratioDiverging: [
    "hc-dim-text",
    "hc-dim-text",
    "hc-good",
    "hc-warn",
    "hc-warn",
    "hc-bad",
  ],
};

/** Bucket index -> wall label, per preset id. `ladderHue`'s labels reuse the
 * same short words the Best Band / Band activity tiles already show. */
export const HEATMAP_BUCKET_LABEL: Record<string, string[]> = {
  ladderHue: LADDER_BUCKET_ORDER.map((state) => LADDER_WALL_LABEL[state]),
  ratioDiverging: [
    "QUIET",
    "BELOW AVG",
    "NORMAL",
    "BUSY",
    "CROWDED",
    "PILEUP",
  ],
};

const DEFAULT_BUCKET_CLASS = "hc-dim-text";

export function heatmapBucketClass(presetId: string, bucket: number): string {
  return HEATMAP_BUCKET_CLASS[presetId]?.[bucket] ?? DEFAULT_BUCKET_CLASS;
}

/** The bucket's tone as a CSS colour, for a grid cell's background or a
 * tile's top state bar — both need an actual colour, not a class name. */
export function heatmapBucketColor(presetId: string, bucket: number): string {
  return TONE_STATE[heatmapBucketClass(presetId, bucket)] ?? "var(--hc-dim2)";
}

export function heatmapBucketLabel(presetId: string, bucket: number): string {
  return (
    HEATMAP_BUCKET_LABEL[presetId]?.[bucket] ??
    HEATMAP_BUCKET_LABEL.ladderHue[bucket] ??
    "—"
  );
}

/** "20m" -> "20 m", matching how the wall reads a band out loud. */
export function formatBandLabel(band: string): string {
  return band.endsWith("m") ? `${band.slice(0, -1)} m` : band;
}

/**
 * `computeHeatmap` always evaluates the ladder over a fixed trailing 20 min
 * / 10 min / 10 min (its own doc comment) regardless of the `windowMs` the
 * caller passes in — so the spots array fed to it must cover at least that
 * 20 min, or the ladder silently sees less history than it assumes. The
 * operator's DX spot-age setting (`useDXStore.filters.maxAge`, 5/15/30/60/120
 * min) still floors the cluster LIST elsewhere; it must never *narrow* what
 * reaches the heat map (workspace #654 P1, Codex review on PR #667).
 */
export function heatmapSpotAgeMinutes(maxAge: number | undefined): number {
  return Math.max(clusterAgeMinutes(maxAge), DEFAULT_HEATMAP_WINDOW_MS / 60_000);
}

function spotEpochMs(time: DXSpot["time"]): number {
  return time instanceof Date ? time.getTime() : new Date(time).getTime();
}

/**
 * How much trailing history the (already widened) feed actually spans, up
 * to the ladder's fixed 20-min need — never more, since more doesn't change
 * anything the ladder reads. This is the honest answer to "does the shared
 * store actually retain 20 minutes right now", independent of what age we
 * asked `filterClusterAge`/`filterBridgeSpotAge` for.
 */
export function heatmapAvailableMs(spots: readonly DXSpot[], now: number): number {
  let oldest = now;
  for (const spot of spots) {
    const t = spotEpochMs(spot.time);
    if (Number.isFinite(t) && t < oldest) oldest = t;
  }
  return Math.min(DEFAULT_HEATMAP_WINDOW_MS, Math.max(0, now - oldest));
}

/** "20 MIN" once the feed spans the ladder's full window, else the honest
 * shorter figure — never claim history the feed doesn't have. */
export function heatmapWindowLabel(availableMs: number): string {
  if (availableMs >= DEFAULT_HEATMAP_WINDOW_MS) return "20 MIN";
  return `${Math.max(1, Math.round(availableMs / 60_000))} MIN`;
}

/**
 * With less than the full 20-min window available, the ladder's "prior 10
 * min" trend half can be missing data rather than genuinely quiet, so any
 * nonzero recent count reads as a spurious "rising" trend (`computeTrend`'s
 * zero-prior rule in `@/lib/utils/bandActivity`) and wrongly promotes a cell
 * to "hot". Rather than touch `evaluateLadder` itself — mirrored server-side
 * in `collector/src/verdict/ladder.ts` — this clamps the ladder's *output*
 * at the wall's own call sites: "hot" cannot render until the feed backing
 * it actually spans the full window (workspace #654 P1, Codex review on
 * PR #667).
 */
export function clampInsufficientHistory(
  cell: HeatmapCell,
  availableMs: number,
): HeatmapCell {
  if (availableMs >= DEFAULT_HEATMAP_WINDOW_MS || cell.ladder !== "hot") return cell;
  return { ...cell, ladder: "verified" };
}

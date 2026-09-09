import { LADDER_WALL_LABEL, TONE_STATE } from "../tokens";
import type { LadderState } from "@/lib/widgets/heatmap";

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

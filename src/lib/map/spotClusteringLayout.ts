/**
 * Maps the persisted spot-clustering preference onto the screen-space layout
 * engine's aggregate threshold (SP-09 round 3 B3). Kept separate from
 * `screenSpaceSpotLayout.ts`, which is intentionally free of app-specific
 * preference types, and from `SpotActivityLayout3D.tsx`, so the mapping is
 * testable without a React Three Fiber render.
 */
import type { SpotClusteringPreferences } from "@/types/user";

/**
 * When clustering is off, the threshold is set above any realistic report
 * count so `layoutProjectedSpotCandidates` never forms an aggregate. When on,
 * the user's `minClusterSize` (documented 2-10 range) drives the threshold.
 */
export function resolveAggregateReportThreshold(
  prefs: SpotClusteringPreferences,
): number {
  if (!prefs.enabled) return Number.MAX_SAFE_INTEGER;
  return Math.min(10, Math.max(2, Math.floor(prefs.minClusterSize)));
}

/**
 * Caps how far a label may be nudged to avoid overlapping siblings (PR #615
 * review finding 2). With clustering explicitly disabled, main honored that
 * preference by continuing the deterministic fan instead of capping offsets
 * until labels overlap again — `screenSpaceSpotLayout.ts`'s
 * `layoutProjectedSpotCandidates` otherwise drops any spot that can't find a
 * slot within the default 36px cap.
 */
export function resolveMaxStackOffsetPx(
  prefs: SpotClusteringPreferences,
): number {
  return prefs.enabled ? 40 : Number.MAX_SAFE_INTEGER;
}

/**
 * Screen-space collision padding, driven by the "Screen Spacing" slider
 * (`gridSize`, persisted 5-15) (PR #615 review finding 3). Reinterprets the
 * old degree-cell value as visible pixel breathing room.
 */
export function resolveCollisionPaddingPx(
  prefs: SpotClusteringPreferences,
): number {
  return Math.max(4, prefs.gridSize ?? 6);
}

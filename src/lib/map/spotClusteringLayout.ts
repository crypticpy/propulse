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

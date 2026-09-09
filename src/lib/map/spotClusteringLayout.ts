/**
 * Maps the persisted spot-clustering preference onto the screen-space layout
 * engine's aggregate threshold (SP-09 round 3 B3). Kept separate from
 * `screenSpaceSpotLayout.ts`, which is intentionally free of app-specific
 * preference types, and from `SpotActivityLayout3D.tsx`, so the mapping is
 * testable without a React Three Fiber render.
 */
import type { SpotCluster as SpotClusterData } from "@/hooks/useSpotClustering";
import type { GlobeSpotLayoutPayload } from "@/lib/map/globeSpotLayout";
import type { SpotLayoutAggregate } from "@/lib/map/screenSpaceSpotLayout";
import { normalizePresentableSpot } from "@/lib/map/spotPresentation";
import type { LiveSpot } from "@/types/livespot";
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

/**
 * Converts one screen-space aggregate (produced when 3+ overlapping reports
 * collide in a viewport region) into the same beacon shape geographic
 * clustering renders, so `SpotCluster` draws it instead of the region going
 * blank. Ids are prefixed to guarantee no collision with a geographic
 * cluster's id.
 */
function screenSpaceAggregateToBeacon(
  aggregate: SpotLayoutAggregate<GlobeSpotLayoutPayload>,
): SpotClusterData {
  const uniqueMembers = new Map<string, LiveSpot>();
  for (const member of aggregate.members) {
    if (!uniqueMembers.has(member.reportId)) {
      uniqueMembers.set(
        member.reportId,
        normalizePresentableSpot(member.payload.spot),
      );
    }
  }
  return {
    id: `screen:${aggregate.id}`,
    center: aggregate.center,
    spots: [...uniqueMembers.values()],
    count: aggregate.count,
    primarySpot: normalizePresentableSpot(aggregate.primary.payload.spot),
  };
}

/**
 * Merges geographic clusters (SP-05 grouping) with screen-space aggregates
 * (collision-driven, camera-dependent) into one beacon list for rendering.
 * Screen-space aggregate members are drawn from `resolvedSingles`, which
 * already excludes geographic-cluster membership, so the two sets cannot
 * double-count a spot.
 */
export function mergeSpotBeacons(
  aggregates: readonly SpotLayoutAggregate<GlobeSpotLayoutPayload>[],
  geographicClusters: readonly SpotClusterData[],
): SpotClusterData[] {
  return [
    ...geographicClusters,
    ...aggregates.map(screenSpaceAggregateToBeacon),
  ];
}

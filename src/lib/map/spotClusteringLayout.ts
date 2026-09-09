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
import { getModeColor } from "@/lib/utils/spotColors";
import type { LiveSpot } from "@/types/livespot";
import type { SpotClusteringPreferences } from "@/types/user";

/** Id prefix screen-space aggregate beacons are given so they never collide
 * with a geographic cluster's id. */
const SCREEN_SPACE_BEACON_ID_PREFIX = "screen:";

/**
 * True when `id` belongs to a screen-space aggregate beacon rather than a
 * geographic cluster (SP-05 grouping). Screen-space aggregate ids are
 * camera-dependent and unknown to `clusterSpots`'s `liveGroupIds`, so callers
 * that expand/map a geographic group must exclude them (PR #615 round 6
 * blocking finding 2: "Map these spots" was a reachable no-op otherwise).
 */
export function isScreenSpaceBeaconId(id: string): boolean {
  return id.startsWith(SCREEN_SPACE_BEACON_ID_PREFIX);
}

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
    id: `${SCREEN_SPACE_BEACON_ID_PREFIX}${aggregate.id}`,
    center: aggregate.center,
    spots: [...uniqueMembers.values()],
    count: aggregate.count,
    primarySpot: normalizePresentableSpot(aggregate.primary.payload.spot),
  };
}

/** One beacon plus the render overrides `SpotCluster` accepts for it. */
export interface SpotBeaconRenderEntry {
  cluster: SpotClusterData;
  color: string;
  sizeScale?: number;
}

/**
 * Merges geographic clusters (SP-05 grouping) with screen-space aggregates
 * (collision-driven, camera-dependent) into one render list, preserving each
 * source's color/size semantics (PR #615 round 6 blocking finding 1):
 * geographic clusters use the primary spot's mode color, while screen-space
 * aggregates carry the layout payload's color (honours `spotColorMode` plus
 * activation/replay semantic colors, see `globeSpotLayout.ts`) and the
 * `aggregateBeaconScale` log2 size curve the layout engine already reserved
 * screen space for. Screen-space aggregate members are drawn from
 * `resolvedSingles`, which already excludes geographic-cluster membership, so
 * the two sets cannot double-count a spot.
 */
export function mergeSpotBeacons(
  aggregates: readonly SpotLayoutAggregate<GlobeSpotLayoutPayload>[],
  geographicClusters: readonly SpotClusterData[],
): SpotBeaconRenderEntry[] {
  return [
    ...geographicClusters.map((cluster) => ({
      cluster,
      color: getModeColor(cluster.primarySpot.mode),
    })),
    ...aggregates.map((aggregate) => ({
      cluster: screenSpaceAggregateToBeacon(aggregate),
      color: aggregate.primary.payload.color,
      sizeScale: aggregate.sizeScale,
    })),
  ];
}

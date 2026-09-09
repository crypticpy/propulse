import { normalizeLiveSpot } from "@/lib/spots/presentation/pipeline";
import { contractIdSchema, type NormalizedSpotReport } from "@/lib/views/spotContracts";
import type { LiveSpot } from "@/types/livespot";
import { groupMappedReports, type GroupingDetail } from "./grouping";

/**
 * A cluster of nearby spots
 */
export interface SpotCluster {
  /** Unique identifier for the cluster */
  id: string;
  /** Geographic center of the cluster */
  center: { lat: number; lon: number };
  /** All spots contained in this cluster */
  spots: LiveSpot[];
  /** Number of spots in this cluster */
  count: number;
  /** The most recent spot (used for color/display) */
  primarySpot: LiveSpot;
}

/**
 * Configuration options for spot clustering
 */
export interface ClusteringOptions {
  /** Whether clustering is enabled */
  enabled: boolean;
  /** Ignored. Membership is geographic, not camera or degree-cell based. */
  gridSize?: number;
  /** Minimum spots required to form a cluster (clamped 2–50, default 3) */
  minClusterSize?: number;
  /** Region vs Maidenhead grouping. Camera is never an input. */
  detail?: GroupingDetail;
  /** Map these spots: hide these groups and emit members as singles. */
  expandedIds?: readonly string[];
}

/**
 * Result of the clustering operation
 */
export interface ClusteringResult {
  /** Clustered spot groups */
  clusters: SpotCluster[];
  /** Spots that don't need clustering (isolated or in small groups) */
  singles: LiveSpot[];
  /** Total number of spots processed */
  totalSpots: number;
  /** Reachable group IDs for expansion sync, including hidden expanded parents. */
  liveGroupIds: string[];
}

const DEFAULT_MIN_GROUP_SIZE = 3;

function clampMinGroupSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 2) {
    return DEFAULT_MIN_GROUP_SIZE;
  }
  return Math.min(50, Math.floor(value));
}

function getSpotTime(spot: LiveSpot): number {
  const value: unknown = spot.time;
  const time =
    value instanceof Date
      ? value.getTime()
      : typeof value === "string" || typeof value === "number"
        ? new Date(value).getTime()
        : Number.NaN;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function compareSpots(a: LiveSpot, b: LiveSpot): number {
  const aTime = getSpotTime(a);
  const bTime = getSpotTime(b);
  if (aTime !== bTime) return bTime - aTime;
  return a.id.localeCompare(b.id);
}

/**
 * `usedIds`/`usedRawIds` must be threaded across the whole batch (mirrors
 * `projectLiveSpotsForView` in presentation/pipeline.ts). A per-spot `Map`
 * defeats `stableReportId`'s collision suffix, and adopting a raw `spot.id`
 * without checking it against the batch lets two upstream spots collide on
 * the same id and silently drop one another out of `clusterSpots`' `byId`.
 */
function reportFromLiveSpot(
  spot: LiveSpot,
  usedIds: Map<string, string>,
  usedRawIds: Set<string>,
): NormalizedSpotReport | null {
  const report = normalizeLiveSpot(spot, usedIds);
  if (!report || report.dx.location.kind === "unavailable") return null;
  const parsedId = contractIdSchema.safeParse(spot.id);
  const rawId =
    parsedId.success && !usedRawIds.has(parsedId.data) && !usedIds.has(parsedId.data)
      ? parsedId.data
      : null;
  if (rawId) usedRawIds.add(rawId);
  return rawId ? { ...report, id: rawId } : report;
}

/**
 * Cluster spots with the SP-05 geographic grouping rules.
 *
 * Prefix/approximate reports stay country groups. Camera and `gridSize` never
 * participate in membership. Unlocated spots remain singles.
 */
export function clusterSpots(
  spots: LiveSpot[],
  options: ClusteringOptions,
): ClusteringResult {
  const enabled = options.enabled;
  const minGroupSize = clampMinGroupSize(options.minClusterSize);
  const detail = options.detail ?? "regions";

  const usedIds = new Map<string, string>();
  const usedRawIds = new Set<string>();
  const mapped: { spot: LiveSpot; report: NormalizedSpotReport }[] = [];
  const unresolved: LiveSpot[] = [];
  for (const spot of spots) {
    const report = reportFromLiveSpot(spot, usedIds, usedRawIds);
    if (!report) {
      unresolved.push(spot);
      continue;
    }
    mapped.push({ spot, report });
  }

  const byId = new Map(mapped.map((entry) => [entry.report.id, entry.spot]));
  const grouped = groupMappedReports(
    mapped.map((entry) => entry.report),
    { enabled, detail, minGroupSize },
    { expandedIds: options.expandedIds },
  );

  const clusters: SpotCluster[] = grouped.groups.map((group) => {
    const clusteredSpots = group.reportIds
      .map((id) => byId.get(id))
      .filter((spot): spot is LiveSpot => Boolean(spot));
    return {
      id: group.id,
      center: group.anchor,
      spots: clusteredSpots,
      count: clusteredSpots.length,
      primarySpot: clusteredSpots[0]!,
    };
  });

  const singles = [
    ...unresolved,
    ...grouped.singles.map((id) => byId.get(id)).filter((spot): spot is LiveSpot => Boolean(spot)),
  ].sort(compareSpots);

  clusters.sort((a, b) => a.id.localeCompare(b.id));

  return {
    clusters,
    singles,
    totalSpots: spots.length,
    liveGroupIds: grouped.liveGroupIds,
  };
}

export function getClusterCallsignSummary(
  cluster: SpotCluster,
  maxCallsigns: number = 10,
): string {
  const callsigns = cluster.spots
    .slice(0, maxCallsigns)
    .map((spot) => spot.dx)
    .join(", ");

  if (cluster.count > maxCallsigns) {
    return `${callsigns} +${cluster.count - maxCallsigns} more`;
  }

  return callsigns;
}

export function getClusterModes(cluster: SpotCluster): string[] {
  const modes = new Set<string>();
  for (const spot of cluster.spots) {
    if (spot.mode) {
      modes.add(spot.mode.toUpperCase());
    }
  }
  return Array.from(modes);
}

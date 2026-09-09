/**
 * useSpotClustering Hook
 *
 * Compatibility adapter over SP-05 geographic grouping. Membership is country /
 * US-Canada subdivision based — never camera, projection, or 5° cells.
 */

import { useMemo } from "react";
import {
  clusterSpots,
  getClusterCallsignSummary,
  getClusterModes,
  type ClusteringOptions,
  type ClusteringResult,
  type SpotCluster,
} from "@/lib/spots/grouping";
import type { LiveSpot } from "@/types/livespot";

export type { ClusteringOptions, ClusteringResult, SpotCluster };

const DEFAULT_OPTIONS: Required<ClusteringOptions> = {
  enabled: true,
  gridSize: 5,
  minClusterSize: 3,
  detail: "regions",
  expandedIds: [],
};

/**
 * Hook to cluster nearby DX spots for cleaner visualization
 */
export function useSpotClustering(
  spots: LiveSpot[],
  options: ClusteringOptions,
): ClusteringResult {
  const { enabled, gridSize, minClusterSize, detail, expandedIds } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return useMemo(
    () =>
      clusterSpots(spots, {
        enabled,
        gridSize,
        minClusterSize,
        detail,
        expandedIds,
      }),
    [spots, enabled, gridSize, minClusterSize, detail, expandedIds],
  );
}

export {
  clusterSpots,
  getClusterCallsignSummary,
  getClusterModes,
};

export default useSpotClustering;

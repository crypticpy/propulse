/**
 * useSpotClustering Hook
 *
 * Provides spot clustering functionality for PropSphere globe visualization.
 * Groups nearby DX spots into clusters for cleaner visualization when many
 * spots are present in the same geographic area.
 *
 * Features:
 * - Grid-based spatial clustering (5 degree cells)
 * - Configurable clustering radius
 * - Memoized for performance with 500+ spots
 * - Prioritizes newest spots as cluster representatives
 */

import { useMemo } from "react";
import type { LiveSpot } from "@/types/livespot";

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
  /** Number of spots in the cluster */
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
  /** Grid cell size in degrees (default: 5) */
  gridSize?: number;
  /** Minimum spots required to form a cluster (default: 3) */
  minClusterSize?: number;
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
}

/**
 * Default clustering options
 */
const DEFAULT_OPTIONS: Required<ClusteringOptions> = {
  enabled: true,
  gridSize: 5,
  minClusterSize: 3,
};

/**
 * Hook to cluster nearby DX spots for cleaner visualization
 *
 * @param spots - Array of live spots to cluster
 * @param options - Clustering configuration options
 * @returns Clustering result with clusters and single spots
 *
 * @example
 * ```tsx
 * const { clusters, singles } = useSpotClustering(spots, {
 *   enabled: true,
 *   gridSize: 5,
 *   minClusterSize: 3,
 * });
 *
 * // Render clusters as aggregate markers
 * {clusters.map(cluster => (
 *   <SpotClusterMarker key={cluster.id} cluster={cluster} />
 * ))}
 *
 * // Render singles as individual markers
 * {singles.map(spot => (
 *   <SpotMarker key={spot.id} spot={spot} />
 * ))}
 * ```
 */
export function useSpotClustering(
  spots: LiveSpot[],
  options: ClusteringOptions,
): ClusteringResult {
  const { enabled, gridSize, minClusterSize } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return useMemo(() => {
    // Return all spots as singles when clustering is disabled
    if (!enabled || spots.length === 0) {
      return {
        clusters: [],
        singles: spots,
        totalSpots: spots.length,
      };
    }

    // Grid-based spatial clustering algorithm
    // Group spots by their grid cell based on lat/lon coordinates
    const gridMap = new Map<string, LiveSpot[]>();

    for (const spot of spots) {
      // Use DX station coordinates for clustering
      // Skip spots without valid coordinates
      if (spot.dxLat == null || spot.dxLon == null) {
        continue;
      }

      // Validate coordinates are finite numbers
      if (!Number.isFinite(spot.dxLat) || !Number.isFinite(spot.dxLon)) {
        continue;
      }

      // Calculate grid cell coordinates
      const gridX = Math.floor(spot.dxLon / gridSize);
      const gridY = Math.floor(spot.dxLat / gridSize);
      const key = `${gridX},${gridY}`;

      const existing = gridMap.get(key) || [];
      existing.push(spot);
      gridMap.set(key, existing);
    }

    const clusters: SpotCluster[] = [];
    const singles: LiveSpot[] = [];

    for (const [key, spotsInCell] of gridMap) {
      if (spotsInCell.length >= minClusterSize) {
        // Create a cluster for this grid cell
        const [gridX, gridY] = key.split(",").map(Number);

        // Calculate center of the grid cell
        const centerLat = (gridY + 0.5) * gridSize;
        const centerLon = (gridX + 0.5) * gridSize;

        // Sort by recency to find the "primary" (most recent) spot
        const sorted = [...spotsInCell].sort(
          (a, b) => b.time.getTime() - a.time.getTime(),
        );

        clusters.push({
          id: `cluster-${key}`,
          center: { lat: centerLat, lon: centerLon },
          spots: spotsInCell,
          count: spotsInCell.length,
          primarySpot: sorted[0],
        });
      } else {
        // Not enough spots to cluster - add as singles
        singles.push(...spotsInCell);
      }
    }

    // Also add spots without coordinates as singles
    const spotsWithoutCoords = spots.filter(
      (spot) =>
        spot.dxLat == null ||
        spot.dxLon == null ||
        !Number.isFinite(spot.dxLat) ||
        !Number.isFinite(spot.dxLon),
    );
    singles.push(...spotsWithoutCoords);

    return {
      clusters,
      singles,
      totalSpots: spots.length,
    };
  }, [spots, enabled, gridSize, minClusterSize]);
}

/**
 * Get a summary of callsigns in a cluster for tooltip display
 * @param cluster - The spot cluster
 * @param maxCallsigns - Maximum number of callsigns to show (default: 10)
 * @returns Formatted string of callsigns
 */
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

/**
 * Get unique modes represented in a cluster
 * @param cluster - The spot cluster
 * @returns Array of unique mode strings
 */
export function getClusterModes(cluster: SpotCluster): string[] {
  const modes = new Set<string>();
  for (const spot of cluster.spots) {
    if (spot.mode) {
      modes.add(spot.mode.toUpperCase());
    }
  }
  return Array.from(modes);
}

export default useSpotClustering;

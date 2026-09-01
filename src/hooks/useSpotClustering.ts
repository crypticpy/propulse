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
import {
  extractPrefixFromCallsign,
  getLocationFromPrefix,
} from "@/lib/data/prefixLocations";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
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

interface LocatedSpot {
  spot: LiveSpot;
  lat: number;
  lon: number;
}

function getValidCoordinatePair(
  lat: unknown,
  lon: unknown,
): { lat: number; lon: number } | null {
  if (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  ) {
    return { lat, lon };
  }
  return null;
}

function resolveDxLocation(
  spot: LiveSpot,
): { lat: number; lon: number } | null {
  const explicitLocation = getValidCoordinatePair(spot.dxLat, spot.dxLon);
  if (explicitLocation) return explicitLocation;

  const grid = spot.dxGrid?.trim();
  if (grid && isValidGrid(grid)) {
    try {
      // gridToLatLon currently supports four- and six-character locators.
      // A valid extended locator still has an accurate six-character parent.
      const location = gridToLatLon(grid.slice(0, 6));
      const validLocation = getValidCoordinatePair(location.lat, location.lon);
      if (validLocation) return validLocation;
    } catch {
      // Continue to the callsign-prefix fallback.
    }
  }

  const prefix = extractPrefixFromCallsign(spot.dx);
  const prefixLocation = getLocationFromPrefix(prefix);
  if (prefixLocation) {
    const validLocation = getValidCoordinatePair(
      prefixLocation.lat,
      prefixLocation.lon,
    );
    if (validLocation) return validLocation;
  }

  return null;
}

function normalizeLongitude(lon: number): number {
  let normalized = lon;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function getLongitudeCell(lon: number, gridSize: number): number {
  // Center a cell on the antimeridian so nearby +179/-179 degree locations
  // are treated as neighbors rather than opposite edges of the grid.
  const cellCount = Math.max(1, Math.ceil(360 / gridSize));
  const cellWidth = 360 / cellCount;
  const circularLon = ((normalizeLongitude(lon) + 180) % 360 + 360) % 360;
  return Math.floor(((circularLon + cellWidth / 2) % 360) / cellWidth);
}

function getLatitudeCell(lat: number, gridSize: number): number {
  const cellCount = Math.max(1, Math.ceil(180 / gridSize));
  return Math.min(cellCount - 1, Math.floor((lat + 90) / gridSize));
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

function getCentroid(spots: LocatedSpot[]): { lat: number; lon: number } {
  let latTotal = 0;
  let longitudeX = 0;
  let longitudeY = 0;

  for (const { lat, lon } of spots) {
    latTotal += lat;
    const longitudeRadians = (lon * Math.PI) / 180;
    longitudeX += Math.cos(longitudeRadians);
    longitudeY += Math.sin(longitudeRadians);
  }

  let lon: number;
  if (Math.hypot(longitudeX, longitudeY) < 1e-12) {
    lon = normalizeLongitude(
      spots.reduce((sum, locatedSpot) => sum + locatedSpot.lon, 0) /
        spots.length,
    );
  } else {
    lon = (Math.atan2(longitudeY, longitudeX) * 180) / Math.PI;
  }

  return {
    lat: latTotal / spots.length,
    lon: normalizeLongitude(lon),
  };
}

/**
 * Cluster spots using their resolved DX locations.
 *
 * Explicit coordinates take precedence, followed by the DX grid and then the
 * callsign-prefix centroid. Spots that cannot be located are retained as
 * singles so clustering never removes feed data from downstream consumers.
 */
export function clusterSpots(
  spots: LiveSpot[],
  options: ClusteringOptions,
): ClusteringResult {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const candidateGridSize = mergedOptions.gridSize;
  const gridSize =
    typeof candidateGridSize === "number" &&
    Number.isFinite(candidateGridSize) &&
    candidateGridSize > 0
      ? candidateGridSize
      : DEFAULT_OPTIONS.gridSize;
  const candidateMinClusterSize = mergedOptions.minClusterSize;
  const minClusterSize =
    typeof candidateMinClusterSize === "number" &&
    Number.isFinite(candidateMinClusterSize) &&
    candidateMinClusterSize >= 1
      ? Math.floor(candidateMinClusterSize)
      : DEFAULT_OPTIONS.minClusterSize;

  if (!mergedOptions.enabled || spots.length === 0) {
    return {
      clusters: [],
      singles: spots,
      totalSpots: spots.length,
    };
  }

  const gridMap = new Map<string, LocatedSpot[]>();
  const unresolved: LiveSpot[] = [];

  for (const spot of spots) {
    const location = resolveDxLocation(spot);
    if (!location) {
      unresolved.push(spot);
      continue;
    }

    const gridX = getLongitudeCell(location.lon, gridSize);
    const gridY = getLatitudeCell(location.lat, gridSize);
    const key = `${gridX},${gridY}`;
    const locatedSpot = { spot, ...location };
    const existing = gridMap.get(key);
    if (existing) {
      existing.push(locatedSpot);
    } else {
      gridMap.set(key, [locatedSpot]);
    }
  }

  const clusters: SpotCluster[] = [];
  const singles: LiveSpot[] = [...unresolved];

  for (const [key, spotsInCell] of gridMap) {
    const sortedSpots = spotsInCell
      .map(({ spot }) => spot)
      .sort(compareSpots);

    if (spotsInCell.length >= minClusterSize) {
      clusters.push({
        id: `cluster-${key}`,
        center: getCentroid(spotsInCell),
        spots: sortedSpots,
        count: sortedSpots.length,
        primarySpot: sortedSpots[0],
      });
    } else {
      singles.push(...sortedSpots);
    }
  }

  clusters.sort((a, b) => a.id.localeCompare(b.id));
  singles.sort(compareSpots);

  return {
    clusters,
    singles,
    totalSpots: spots.length,
  };
}

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

  return useMemo(
    () => clusterSpots(spots, { enabled, gridSize, minClusterSize }),
    [spots, enabled, gridSize, minClusterSize],
  );
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

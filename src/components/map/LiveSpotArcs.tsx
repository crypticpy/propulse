/**
 * LiveSpotArcs Component
 *
 * Renders arcs on the globe showing live spot paths from
 * PSKReporter, RBN, and other sources.
 *
 * Arcs are colored by operating mode (FT8, CW, SSB, etc.)
 * for quick visual identification of activity.
 *
 * Features spot clustering for cleaner visualization when many spots
 * are present in the same geographic area.
 */

import { useMemo, useCallback } from "react";
import { Line } from "@react-three/drei";
import { getPathPoints } from "@/lib/utils/path";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useDXStore } from "@/stores/dxStore";
import {
  useSpotClusteringPrefs,
  useSpotAgePrefs,
  useUIInteractionPrefs,
} from "@/stores/userStore";
import {
  extractPrefixFromCallsign,
  getLocationFromPrefix,
} from "@/lib/data/prefixLocations";
import { useSpotClustering } from "@/hooks/useSpotClustering";
import { SpotCluster } from "./SpotCluster";
import { SpotLabel } from "./SpotLabel";
import { SpotEndpointHitArea } from "./SpotEndpointHitArea";
import type { SpotCluster as SpotClusterType } from "@/hooks/useSpotClustering";
import type { LiveSpot, SpotSource } from "@/types/livespot";
import type { SpotDetailsData } from "./SpotDetailsFlyout";

// ==========================================================================
// Spot Age Types and Utilities
// ==========================================================================

/**
 * Age category for visual styling
 */
export type SpotAgeCategory = "fresh" | "recent" | "aging" | "stale" | "old";

/**
 * Spot age information for visual decay styling
 */
export interface SpotAgeInfo {
  /** Age in minutes */
  ageMinutes: number;
  /** Category for styling decisions */
  ageCategory: SpotAgeCategory;
  /** Opacity value (0.4 - 1.0) */
  opacity: number;
  /** Scale factor (0.5 - 1.0) */
  scale: number;
  /** Saturation factor (0.3 - 1.0) */
  saturation: number;
}

/**
 * Calculate spot age information for visual decay styling
 * @param spotTime - Time when the spot was created
 * @param currentTime - Current time (defaults to now)
 * @returns SpotAgeInfo with age category and visual parameters
 */
export function getSpotAgeInfo(
  spotTime: Date,
  currentTime: Date = new Date(),
): SpotAgeInfo {
  const ageMinutes = (currentTime.getTime() - spotTime.getTime()) / 60000;

  // 0-2 minutes: fresh - full visibility
  if (ageMinutes < 2) {
    return {
      ageMinutes,
      ageCategory: "fresh",
      opacity: 1.0,
      scale: 1.0,
      saturation: 1.0,
    };
  }

  // 2-5 minutes: recent - slight decay
  if (ageMinutes < 5) {
    return {
      ageMinutes,
      ageCategory: "recent",
      opacity: 0.9,
      scale: 0.9,
      saturation: 0.95,
    };
  }

  // 5-10 minutes: aging - moderate decay
  if (ageMinutes < 10) {
    return {
      ageMinutes,
      ageCategory: "aging",
      opacity: 0.75,
      scale: 0.75,
      saturation: 0.7,
    };
  }

  // 10-15 minutes: stale - significant decay
  if (ageMinutes < 15) {
    return {
      ageMinutes,
      ageCategory: "stale",
      opacity: 0.6,
      scale: 0.6,
      saturation: 0.5,
    };
  }

  // 15+ minutes: old - maximum decay
  return {
    ageMinutes,
    ageCategory: "old",
    opacity: 0.4,
    scale: 0.5,
    saturation: 0.3,
  };
}

/**
 * Format spot age for display (e.g., "2:45" for 2 minutes 45 seconds)
 * @param spotTime - Time when the spot was created
 * @param currentTime - Current time (defaults to now)
 * @returns Formatted age string
 */
export function formatSpotAge(
  spotTime: Date,
  currentTime: Date = new Date(),
): string {
  const ageMs = currentTime.getTime() - spotTime.getTime();
  const totalSeconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes}m`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Get short age label for compact display (e.g., "2m", "15m", "1h")
 * @param spotTime - Time when the spot was created
 * @param currentTime - Current time (defaults to now)
 * @returns Short age label
 */
export function getShortAgeLabel(
  spotTime: Date,
  currentTime: Date = new Date(),
): string {
  const ageMs = currentTime.getTime() - spotTime.getTime();
  const minutes = Math.floor(ageMs / 60000);

  if (minutes < 1) return "<1m";
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  }
  return `${minutes}m`;
}

/**
 * Get color for age badge based on category
 * @param ageCategory - The age category
 * @returns Tailwind-compatible color classes
 */
export function getAgeBadgeColors(ageCategory: SpotAgeCategory): {
  bg: string;
  text: string;
  border: string;
} {
  switch (ageCategory) {
    case "fresh":
      return {
        bg: "bg-green-500/20",
        text: "text-green-400",
        border: "border-green-500/30",
      };
    case "recent":
      return {
        bg: "bg-cyan-500/20",
        text: "text-cyan-400",
        border: "border-cyan-500/30",
      };
    case "aging":
      return {
        bg: "bg-yellow-500/20",
        text: "text-yellow-400",
        border: "border-yellow-500/30",
      };
    case "stale":
      return {
        bg: "bg-orange-500/20",
        text: "text-orange-400",
        border: "border-orange-500/30",
      };
    case "old":
      return {
        bg: "bg-gray-500/20",
        text: "text-gray-400",
        border: "border-gray-500/30",
      };
  }
}

// ==========================================================================
// Mode Colors - for visual identification of operating modes
// ==========================================================================
export const MODE_COLORS: Record<string, string> = {
  FT8: "#44DDFF", // Cosmic cyan
  FT4: "#44DDFF", // Cosmic cyan
  CW: "#FFD23F", // Caution amber
  SSB: "#00FF88", // Signal green
  RTTY: "#AA44FF", // Aurora purple
  DIGI: "#44DDFF", // Cosmic cyan (generic digital)
  DATA: "#44DDFF", // Cosmic cyan (generic data)
  default: "#888888", // Gray fallback
};

/**
 * Get color for a given mode
 */
export function getModeColor(mode: string | undefined): string {
  if (!mode) return MODE_COLORS.default;
  const upperMode = mode.toUpperCase();

  // Direct match
  if (MODE_COLORS[upperMode]) {
    return MODE_COLORS[upperMode];
  }

  // Partial matches for common mode variations
  if (upperMode.includes("FT8") || upperMode.includes("FT4")) {
    return MODE_COLORS.FT8;
  }
  if (upperMode.includes("CW")) {
    return MODE_COLORS.CW;
  }
  if (
    upperMode.includes("SSB") ||
    upperMode.includes("USB") ||
    upperMode.includes("LSB")
  ) {
    return MODE_COLORS.SSB;
  }
  if (upperMode.includes("RTTY") || upperMode.includes("PSK")) {
    return MODE_COLORS.RTTY;
  }
  if (upperMode.includes("DIGI") || upperMode.includes("DATA")) {
    return MODE_COLORS.DIGI;
  }

  return MODE_COLORS.default;
}

// ==========================================================================
// Great Circle Path Utilities
// ==========================================================================

/**
 * Calculate great circle points between two coordinates
 * @param lat1 - Start latitude
 * @param lon1 - Start longitude
 * @param lat2 - End latitude
 * @param lon2 - End longitude
 * @param numPoints - Number of points along the path (default: 30)
 * @returns Array of lat/lon points along the great circle
 */
export function getGreatCirclePoints(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  numPoints: number = 30,
): Array<{ lat: number; lon: number }> {
  return getPathPoints(lat1, lon1, lat2, lon2, numPoints).map((p) => ({
    lat: p.lat,
    lon: p.lon,
  }));
}

// ==========================================================================
// Spot Location Resolution
// ==========================================================================

export interface ResolvedSpot {
  id: string;
  spotterLat: number;
  spotterLon: number;
  dxLat: number;
  dxLon: number;
  mode: string;
  frequency: number;
  time: Date;
  callsign: string;
  source: SpotSource;
}

/**
 * Try to get location from a grid locator
 */
function getLocationFromGrid(
  grid: string | undefined,
): { lat: number; lon: number } | null {
  if (!grid || !isValidGrid(grid)) return null;
  try {
    return gridToLatLon(grid);
  } catch {
    return null;
  }
}

/**
 * Try to get location from a callsign using prefix lookup
 */
function getLocationFromCallsign(
  callsign: string,
): { lat: number; lon: number } | null {
  const prefix = extractPrefixFromCallsign(callsign);
  const location = getLocationFromPrefix(prefix);
  if (location) {
    return { lat: location.lat, lon: location.lon };
  }
  return null;
}

/**
 * Resolve spot locations from grid/callsign with fallback chain
 * Priority: grid locator > callsign prefix > continent
 */
export function resolveSpotLocations(spots: LiveSpot[]): ResolvedSpot[] {
  const resolved: ResolvedSpot[] = [];

  for (const spot of spots) {
    // Try to resolve spotter location
    const spotterLoc =
      spot.spotterLat !== undefined && spot.spotterLon !== undefined
        ? { lat: spot.spotterLat, lon: spot.spotterLon }
        : getLocationFromGrid(spot.spotterGrid) ||
          getLocationFromCallsign(spot.spotter);

    // Try to resolve DX location
    const dxLoc =
      spot.dxLat !== undefined && spot.dxLon !== undefined
        ? { lat: spot.dxLat, lon: spot.dxLon }
        : getLocationFromGrid(spot.dxGrid) || getLocationFromCallsign(spot.dx);

    // Skip if we couldn't resolve both locations
    if (!spotterLoc || !dxLoc) continue;

    resolved.push({
      id: spot.id,
      spotterLat: spotterLoc.lat,
      spotterLon: spotterLoc.lon,
      dxLat: dxLoc.lat,
      dxLon: dxLoc.lon,
      mode: spot.mode || "UNKNOWN",
      frequency: spot.frequency,
      time: spot.time,
      callsign: spot.dx,
      source: spot.source,
    });
  }

  return resolved;
}

// ==========================================================================
// 3D Rendering Utilities (for Globe View)
// ==========================================================================

interface LiveSpotArcsProps {
  /** User's grid locator for fetching relevant spots */
  grid?: string;
  /** Maximum number of arcs to render */
  maxArcs?: number;
  /** Minimum opacity for arc lines */
  minOpacity?: number;
  /** Callback when a spot is hovered */
  onSpotHover?: (
    data: SpotDetailsData,
    screenPos: { x: number; y: number },
  ) => void;
  /** Callback when spot hover ends */
  onSpotHoverEnd?: () => void;
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonTo3D(
  lat: number,
  lon: number,
  radius: number = 1.005,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

/**
 * Calculate age-based opacity (newer spots are more visible)
 */
export function getAgeOpacity(
  spotTime: Date,
  maxAgeMinutes: number = 15,
): number {
  const ageMs = Date.now() - spotTime.getTime();
  const ageMinutes = ageMs / 60000;
  return Math.max(0.2, 1 - ageMinutes / maxAgeMinutes);
}

/**
 * Individual spot arc component for 3D globe
 */
function SpotArc({
  spot,
  segments = 30,
  ageVisualizationEnabled = true,
}: {
  spot: ResolvedSpot;
  segments?: number;
  /** Whether to apply age-based visual decay */
  ageVisualizationEnabled?: boolean;
}) {
  // Validate coordinates to prevent NaN errors in THREE.js
  const hasValidCoords =
    Number.isFinite(spot.spotterLat) &&
    Number.isFinite(spot.spotterLon) &&
    Number.isFinite(spot.dxLat) &&
    Number.isFinite(spot.dxLon);

  const points = useMemo(() => {
    if (!hasValidCoords) return [];
    try {
      const pathPoints = getPathPoints(
        spot.spotterLat,
        spot.spotterLon,
        spot.dxLat,
        spot.dxLon,
        segments,
      );
      const result = pathPoints.map((p) => latLonTo3D(p.lat, p.lon)) as Array<
        [number, number, number]
      >;
      // Validate all points are finite numbers
      for (const pt of result) {
        if (
          !Number.isFinite(pt[0]) ||
          !Number.isFinite(pt[1]) ||
          !Number.isFinite(pt[2])
        ) {
          return [];
        }
      }
      return result;
    } catch {
      return [];
    }
  }, [spot, segments, hasValidCoords]);

  const color = getModeColor(spot.mode);

  // Calculate age-based opacity using new getSpotAgeInfo
  const ageInfo = useMemo(() => getSpotAgeInfo(spot.time), [spot.time]);
  const opacity = ageVisualizationEnabled ? ageInfo.opacity : 1.0;
  const lineWidth = ageVisualizationEnabled ? 1.5 * ageInfo.scale : 1.5;

  // Return null for invalid coordinates or insufficient points
  if (!hasValidCoords || points.length < 2) return null;

  return (
    <Line
      points={points}
      color={color}
      lineWidth={lineWidth}
      opacity={opacity}
      transparent
    />
  );
}

/**
 * Endpoint marker for spot arcs (small sphere at each end)
 */
function SpotEndpoint({
  lat,
  lon,
  color,
  size = 0.008,
  opacity = 0.8,
  scale = 1.0,
}: {
  lat: number;
  lon: number;
  color: string;
  size?: number;
  /** Opacity for age-based decay (0.4 - 1.0) */
  opacity?: number;
  /** Scale factor for age-based decay (0.5 - 1.0) */
  scale?: number;
}) {
  // Validate coordinates to prevent NaN errors
  const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lon);
  const position = useMemo(
    () =>
      hasValidCoords
        ? latLonTo3D(lat, lon, 1.006)
        : ([0, 0, 0] as [number, number, number]),
    [lat, lon, hasValidCoords],
  );

  if (!hasValidCoords) return null;

  // Apply scale to size for age-based visual decay
  const scaledSize = size * scale;

  return (
    <mesh position={position}>
      <sphereGeometry args={[scaledSize, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

/**
 * LiveSpotArcs Component for Globe View
 *
 * Fetches live spots and renders them as 3D arcs on the globe.
 * Supports spot clustering for cleaner visualization when many spots
 * are present in the same geographic area.
 * Applies age-based visual decay (opacity/scale) based on user preferences.
 */
export function LiveSpotArcs({
  grid,
  maxArcs = 50,
  onSpotHover,
  onSpotHoverEnd,
}: LiveSpotArcsProps) {
  // Get source filter from dxStore - shared with DXSpotList
  const filters = useDXStore((state) => state.filters);
  const sourcesFilter = filters.sources as SpotSource[] | undefined;

  // Get clustering preferences from user store
  const clusteringPrefs = useSpotClusteringPrefs();

  // Get spot age visualization preferences
  const spotAgePrefs = useSpotAgePrefs();

  // Get UI interaction preferences for callsign labels
  const uiPrefs = useUIInteractionPrefs();

  const { spots, isLoading } = useLiveSpots({
    grid,
    enabled: true,
    refetchInterval: 60000,
    // Pass sources filter - when empty array, useLiveSpots shows all sources
    sources:
      sourcesFilter && sourcesFilter.length > 0 ? sourcesFilter : undefined,
  });

  // Apply clustering to spots
  const { clusters, singles } = useSpotClustering(spots.slice(0, maxArcs), {
    enabled: clusteringPrefs.enabled,
    gridSize: clusteringPrefs.gridSize,
    minClusterSize: clusteringPrefs.minClusterSize,
  });

  // Resolve locations for single (non-clustered) spots
  const resolvedSingles = useMemo(() => {
    return resolveSpotLocations(singles);
  }, [singles]);

  // Create a map from spot ID to original LiveSpot for additional data
  const singlesMap = useMemo(() => {
    const map = new Map<string, LiveSpot>();
    for (const spot of singles) {
      map.set(spot.id, spot);
    }
    return map;
  }, [singles]);

  // Handler for cluster click - placeholder for future zoom/expand functionality
  const handleClusterClick = useCallback((_cluster: SpotClusterType) => {
    // Future enhancement: zoom to cluster center or expand to show individual spots
  }, []);

  if (isLoading || (resolvedSingles.length === 0 && clusters.length === 0)) {
    return null;
  }

  return (
    <group name="live-spot-arcs">
      {/* Render clustered spots as cluster markers */}
      {clusters.map((cluster) => (
        <SpotCluster
          key={cluster.id}
          cluster={cluster}
          onClick={handleClusterClick}
        />
      ))}

      {/* Render non-clustered spots as individual arcs with age-based styling */}
      {resolvedSingles.map((spot) => {
        const color = getModeColor(spot.mode);
        // Calculate age info for endpoint styling
        const ageInfo = getSpotAgeInfo(spot.time);
        // Apply age-based styling only if preference is enabled
        const endpointOpacity = spotAgePrefs.enabled
          ? ageInfo.opacity * 0.8
          : 0.8;
        const endpointScale = spotAgePrefs.enabled ? ageInfo.scale : 1.0;

        return (
          <group key={spot.id}>
            <SpotArc
              spot={spot}
              ageVisualizationEnabled={spotAgePrefs.enabled}
            />
            {/* Endpoint markers with age-based styling */}
            <SpotEndpoint
              lat={spot.spotterLat}
              lon={spot.spotterLon}
              color={color}
              size={0.006}
              opacity={endpointOpacity}
              scale={endpointScale}
            />
            <SpotEndpoint
              lat={spot.dxLat}
              lon={spot.dxLon}
              color={color}
              size={0.008}
              opacity={endpointOpacity}
              scale={endpointScale}
            />
            {/* Callsign label at DX location (receiver) */}
            {uiPrefs.showSpotCallsignLabels && (
              <SpotLabel
                lat={spot.dxLat}
                lon={spot.dxLon}
                callsign={spot.callsign}
                mode={spot.mode}
                isSpotter={false}
                opacity={endpointOpacity}
                frequency={spot.frequency}
              />
            )}
            {/* Hit area for hover detection at DX location */}
            {onSpotHover && (
              <SpotEndpointHitArea
                lat={spot.dxLat}
                lon={spot.dxLon}
                spot={spot}
                spotData={{
                  spotter: singlesMap.get(spot.id)?.spotter,
                  spotterGrid: singlesMap.get(spot.id)?.spotterGrid,
                  dxGrid: singlesMap.get(spot.id)?.dxGrid,
                  band: singlesMap.get(spot.id)?.band,
                  snr: singlesMap.get(spot.id)?.snr,
                  wpm: singlesMap.get(spot.id)?.wpm,
                }}
                hitRadius={0.025 * uiPrefs.spotHitRadiusMultiplier}
                onHover={onSpotHover}
                onHoverEnd={onSpotHoverEnd}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

/**
 * LiveSpotArcs Component
 *
 * Renders arcs on the globe showing live spot paths from
 * PSKReporter, RBN, and other sources.
 *
 * Arcs are colored by operating mode (FT8, CW, SSB, etc.)
 * for quick visual identification of activity.
 */

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { getPathPoints } from "@/lib/utils/path";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useDXStore } from "@/stores/dxStore";
import {
  extractPrefixFromCallsign,
  getLocationFromPrefix,
} from "@/lib/data/prefixLocations";
import type { LiveSpot, SpotSource } from "@/types/livespot";

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
function getAgeOpacity(spotTime: Date, maxAgeMinutes: number = 15): number {
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
}: {
  spot: ResolvedSpot;
  segments?: number;
}) {
  const points = useMemo(() => {
    const pathPoints = getPathPoints(
      spot.spotterLat,
      spot.spotterLon,
      spot.dxLat,
      spot.dxLon,
      segments,
    );
    return pathPoints.map((p) => latLonTo3D(p.lat, p.lon)) as Array<
      [number, number, number]
    >;
  }, [spot, segments]);

  const color = getModeColor(spot.mode);
  const opacity = getAgeOpacity(spot.time);

  if (points.length < 2) return null;

  return (
    <Line
      points={points}
      color={color}
      lineWidth={1.5}
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
}: {
  lat: number;
  lon: number;
  color: string;
  size?: number;
}) {
  const position = useMemo(() => latLonTo3D(lat, lon, 1.006), [lat, lon]);

  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.8} />
    </mesh>
  );
}

/**
 * LiveSpotArcs Component for Globe View
 *
 * Fetches live spots and renders them as 3D arcs on the globe
 */
export function LiveSpotArcs({ grid, maxArcs = 50 }: LiveSpotArcsProps) {
  // Get source filter from dxStore - shared with DXSpotList
  const filters = useDXStore((state) => state.filters);
  const sourcesFilter = filters.sources as SpotSource[] | undefined;

  const { spots, isLoading } = useLiveSpots({
    grid,
    enabled: true,
    refetchInterval: 60000,
    // Pass sources filter - when empty array, useLiveSpots shows all sources
    sources:
      sourcesFilter && sourcesFilter.length > 0 ? sourcesFilter : undefined,
  });

  // Resolve locations and limit count
  const resolvedSpots = useMemo(() => {
    return resolveSpotLocations(spots).slice(0, maxArcs);
  }, [spots, maxArcs]);

  if (isLoading || resolvedSpots.length === 0) {
    return null;
  }

  return (
    <group name="live-spot-arcs">
      {resolvedSpots.map((spot) => {
        const color = getModeColor(spot.mode);
        return (
          <group key={spot.id}>
            <SpotArc spot={spot} />
            {/* Endpoint markers */}
            <SpotEndpoint
              lat={spot.spotterLat}
              lon={spot.spotterLon}
              color={color}
              size={0.006}
            />
            <SpotEndpoint
              lat={spot.dxLat}
              lon={spot.dxLon}
              color={color}
              size={0.008}
            />
          </group>
        );
      })}
    </group>
  );
}

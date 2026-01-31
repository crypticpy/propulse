/**
 * LiveSpotArcs Component
 *
 * Renders arcs on the globe showing live spot paths from
 * PSKReporter, RBN, and other sources.
 *
 * Source filtering is integrated with dxStore to allow users
 * to filter which sources appear on the globe.
 */

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { getPathPoints } from "@/lib/utils/path";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useDXStore } from "@/stores/dxStore";
import {
  SPOT_SOURCE_COLORS,
  type LiveSpot,
  type SpotSource,
} from "@/types/livespot";

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
 * Individual spot arc component
 */
function SpotArc({
  spot,
  segments = 30,
}: {
  spot: LiveSpot;
  segments?: number;
}) {
  const points = useMemo(() => {
    if (
      spot.spotterLat === undefined ||
      spot.spotterLon === undefined ||
      spot.dxLat === undefined ||
      spot.dxLon === undefined
    ) {
      return [];
    }

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

  const color = SPOT_SOURCE_COLORS[spot.source].color;
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

export function LiveSpotArcs({ grid, maxArcs = 25 }: LiveSpotArcsProps) {
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

  // Filter to spots that have both endpoints and limit count
  const renderableSpots = useMemo(() => {
    return spots
      .filter(
        (spot) =>
          spot.spotterLat !== undefined &&
          spot.spotterLon !== undefined &&
          spot.dxLat !== undefined &&
          spot.dxLon !== undefined,
      )
      .slice(0, maxArcs);
  }, [spots, maxArcs]);

  if (isLoading || renderableSpots.length === 0) {
    return null;
  }

  return (
    <group name="live-spot-arcs">
      {renderableSpots.map((spot) => (
        <SpotArc key={spot.id} spot={spot} />
      ))}
    </group>
  );
}

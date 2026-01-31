/**
 * PathArc Component
 *
 * Renders a great circle path arc between two points on the globe.
 * Used to visualize the propagation path between home and target.
 */

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { getPathPoints } from "@/lib/utils/path";

interface PathArcProps {
  /** Start latitude */
  startLat: number;
  /** Start longitude */
  startLon: number;
  /** End latitude */
  endLat: number;
  /** End longitude */
  endLon: number;
  /** Arc color */
  color?: string;
  /** Line width */
  lineWidth?: number;
  /** Number of points along the arc */
  segments?: number;
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonTo3D(
  lat: number,
  lon: number,
  radius: number = 1.003,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

export function PathArc({
  startLat,
  startLon,
  endLat,
  endLon,
  color = "#ff6b35",
  lineWidth = 3,
  segments = 50,
}: PathArcProps) {
  // Calculate path points along great circle
  const points = useMemo(() => {
    const pathPoints = getPathPoints(
      startLat,
      startLon,
      endLat,
      endLon,
      segments,
    );
    return pathPoints.map((p) => latLonTo3D(p.lat, p.lon)) as Array<
      [number, number, number]
    >;
  }, [startLat, startLon, endLat, endLon, segments]);

  if (points.length < 2) return null;

  return (
    <Line
      points={points}
      color={color}
      lineWidth={lineWidth}
      opacity={0.9}
      transparent
    />
  );
}

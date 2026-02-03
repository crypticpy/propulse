/**
 * PathArc Component
 *
 * Renders a great circle path arc between two points on the globe.
 * Used to visualize the propagation path between home and target.
 * Supports both short path (default) and long path visualization.
 */

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { getPathPoints, getLongPathPoints } from "@/lib/utils/path";

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
  /** Path mode - short (default) or long */
  pathMode?: "short" | "long";
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
  pathMode = "short",
}: PathArcProps) {
  // Calculate path points along great circle (short or long path)
  const points = useMemo(() => {
    // Use more segments for long path since it's longer
    const numSegments =
      pathMode === "long" ? Math.max(segments, 150) : segments;

    const pathPoints =
      pathMode === "long"
        ? getLongPathPoints(startLat, startLon, endLat, endLon, numSegments)
        : getPathPoints(startLat, startLon, endLat, endLon, numSegments);

    return pathPoints.map((p) => latLonTo3D(p.lat, p.lon)) as Array<
      [number, number, number]
    >;
  }, [startLat, startLon, endLat, endLon, segments, pathMode]);

  if (points.length < 2) return null;

  // Use dashed style for long path to visually distinguish
  const isDashed = pathMode === "long";

  return (
    <Line
      points={points}
      color={color}
      lineWidth={lineWidth}
      opacity={isDashed ? 0.7 : 0.9}
      transparent
      dashed={isDashed}
      dashSize={isDashed ? 0.03 : undefined}
      gapSize={isDashed ? 0.02 : undefined}
    />
  );
}

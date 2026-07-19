/**
 * Terminator Component
 *
 * Renders the day/night terminator line on the 3D globe.
 * The terminator is the boundary between day and night.
 */

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { getTerminatorPoints } from "@/lib/utils/sun";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

interface TerminatorProps {
  /** Current display time */
  date: Date;
  /** Terminator line color */
  color?: string;
  /** Line opacity */
  opacity?: number;
  /** Use more visible dashing for standard/grayscale map mode */
  standardMode?: boolean;
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonTo3D(
  lat: number,
  lon: number,
  radius: number = 1.002,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

export function Terminator({
  date,
  color = "#ff6b35",
  opacity = 0.8,
  standardMode = false,
}: TerminatorProps) {
  // Calculate terminator points
  const points = useMemo(() => {
    const terminatorPoints = getTerminatorPoints(date, 180);
    const coords = terminatorPoints.map((p) =>
      latLonTo3D(p.lat, p.lon),
    ) as Array<[number, number, number]>;

    // Close the loop
    if (coords.length > 0) {
      coords.push(coords[0]);
    }

    return coords;
  }, [date]);

  if (points.length < 2) {
    return null;
  }

  return (
    <Line
      points={points}
      color={color}
      lineWidth={5}
      opacity={opacity}
      transparent
      dashed
      dashScale={standardMode ? 30 : 50}
      dashSize={standardMode ? 5 : 3}
      gapSize={standardMode ? 3 : 1}
      depthTest={false}
      depthWrite={false}
      renderOrder={GLOBE_LAYER_ORDER.nightShade - 0.1}
    />
  );
}

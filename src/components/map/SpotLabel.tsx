/**
 * SpotLabel Component
 *
 * Renders a callsign label at a spot location on the 3D globe.
 * Uses Html from @react-three/drei for CSS-styled labels that
 * integrate with Three.js transformations.
 *
 * Features:
 * - Mode-based coloring (FT8, CW, SSB, etc.)
 * - Sender vs receiver styling (outline vs filled)
 * - Age-based opacity decay
 * - Compact display optimized for dense spot views
 */

import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { getModeColor } from "./LiveSpotArcs";

/** Offset from globe surface to prevent z-fighting */
const SURFACE_OFFSET = 1.012;

export interface SpotLabelProps {
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Callsign to display */
  callsign: string;
  /** Operating mode for color styling */
  mode?: string;
  /** Whether this is the spotter (sender) vs DX (receiver) */
  isSpotter?: boolean;
  /** Opacity for age-based decay (0.4 - 1.0) */
  opacity?: number;
  /** Label size variant */
  size?: "sm" | "md";
  /** Optional frequency to display */
  frequency?: number;
}

/**
 * Convert lat/lon to 3D position on sphere
 */
function latLonTo3D(
  lat: number,
  lon: number,
  radius: number,
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
 * Format frequency for compact display (e.g., "14.074" for 14074 kHz)
 */
function formatFrequency(freq: number): string {
  if (freq >= 1000) {
    return (freq / 1000).toFixed(3);
  }
  return freq.toString();
}

/**
 * SpotLabel renders a callsign label at a geographic location
 *
 * @example
 * ```tsx
 * <SpotLabel
 *   lat={45.5}
 *   lon={-122.6}
 *   callsign="W7ABC"
 *   mode="FT8"
 *   isSpotter={false}
 *   opacity={0.9}
 * />
 * ```
 */
export function SpotLabel({
  lat,
  lon,
  callsign,
  mode,
  isSpotter = false,
  opacity = 1.0,
  size = "sm",
  frequency,
}: SpotLabelProps) {
  // Validate coordinates
  const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lon);

  // Calculate 3D position
  const position = useMemo(
    () =>
      hasValidCoords
        ? latLonTo3D(lat, lon, SURFACE_OFFSET)
        : ([0, 0, 0] as [number, number, number]),
    [lat, lon, hasValidCoords],
  );

  // Get mode color
  const color = getModeColor(mode);

  // Size classes
  const sizeClasses =
    size === "sm" ? "text-[9px] px-1 py-0.5" : "text-[10px] px-1.5 py-0.5";

  if (!hasValidCoords) return null;

  return (
    <Html
      position={position}
      center
      style={{
        pointerEvents: "none",
        userSelect: "none",
        opacity,
        transition: "opacity 0.3s ease",
      }}
      // Occlude behind globe (optional, can be expensive)
      // occlude
    >
      <div
        className={`
          font-mono font-bold whitespace-nowrap rounded
          ${sizeClasses}
          ${isSpotter ? "bg-transparent border border-current" : "text-white"}
        `}
        style={{
          color: isSpotter ? color : undefined,
          backgroundColor: isSpotter ? "rgba(10, 10, 26, 0.7)" : color,
          borderColor: isSpotter ? color : "transparent",
          boxShadow: isSpotter ? `0 0 4px ${color}40` : `0 0 6px ${color}60`,
          textShadow: isSpotter ? "none" : "0 1px 2px rgba(0,0,0,0.5)",
        }}
      >
        {callsign}
        {frequency && (
          <span className="ml-1 opacity-70" style={{ fontSize: "0.85em" }}>
            {formatFrequency(frequency)}
          </span>
        )}
      </div>
    </Html>
  );
}

export default SpotLabel;

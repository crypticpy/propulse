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
 * - Hover-to-surface: hovered labels pop above the stack with
 *   scale bump + elevated z-index so you can flip through a
 *   crowded pile-up without losing your place.
 */

import { useState, useCallback, useMemo } from "react";
import { Html } from "@react-three/drei";
import { getModeColor, getBandColor } from "@/lib/utils/spotColors";

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
  /** Stack offset index for nearby labels (0 = no offset) */
  stackIndex?: number;
  /** Pre-computed color (hex). When provided, used instead of getModeColor(mode). */
  color?: string;
  /**
   * Pre-computed globe occlusion opacity (0-1).
   * When provided, the label skips its internal useGlobeOcclusion hook.
   * Use this when a parent component batches occlusion via useGlobeOcclusionBatch.
   * Defaults to 1.0 (fully visible).
   */
  occlusionOpacity?: number;
  /** Called when mouse enters this label */
  onHover?: (screenPos: { x: number; y: number }) => void;
  /** Called when mouse leaves this label */
  onHoverEnd?: () => void;
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
  // isSpotter not used — both label types use unified dark-pill styling
  opacity = 1.0,
  size = "sm",
  frequency,
  stackIndex = 0,
  color: colorProp,
  occlusionOpacity = 1.0,
  onHover,
  onHoverEnd,
}: SpotLabelProps) {
  const [isHovered, setIsHovered] = useState(false);

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

  // Use pre-computed color when provided, otherwise fall back to mode color
  const color = colorProp ?? getModeColor(mode);

  // Band-indicator underline: always derive from frequency so the underline
  // shows which band a spot is on, regardless of the mode/band color setting.
  // Falls back to the general spot color when no frequency is available.
  const underlineColor = frequency ? getBandColor(frequency) : color;

  // Combined opacity: age-based decay multiplied by globe occlusion
  const combinedOpacity = opacity * occlusionOpacity;

  // Size classes - sized for legibility (target audience 50-70 age range)
  const sizeClasses =
    size === "sm" ? "text-[11px] px-1.5 py-0.5" : "text-[13px] px-2 py-1";

  // Hover handlers — always enabled so labels in a stack are navigable,
  // even spotter labels that don't have an onHover detail callback.
  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      setIsHovered(true);
      onHover?.({ x: e.clientX, y: e.clientY });
    },
    [onHover],
  );

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    onHoverEnd?.();
  }, [onHoverEnd]);

  if (!hasValidCoords) {
    return null;
  }

  // Vertical pixel offset for stacked labels (each label ~22px tall)
  const stackOffsetY = stackIndex * -24;

  // Text opacity fades with age/occlusion but underline stays fully bright
  const textOpacity = Math.max(combinedOpacity, 0.35);

  return (
    <Html
      position={position}
      center
      // When hovered, boost z-index so this label renders above all others
      // in the stack. Default [1,0] keeps non-hovered labels in paint order.
      zIndexRange={isHovered ? [9000, 8999] : [1, 0]}
      style={{
        // Always accept pointer events so any label in a stack can be hovered
        pointerEvents: "auto",
        userSelect: "none",
        transition: "opacity 0.3s ease",
        transform: stackOffsetY ? `translateY(${stackOffsetY}px)` : undefined,
        // Outer wrapper only hides when fully occluded (behind globe)
        opacity: combinedOpacity < 0.05 ? 0 : 1,
      }}
    >
      <div
        className={`
          font-mono font-bold whitespace-nowrap
          ${sizeClasses}
        `}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        // DO NOT CHANGE — this underline styling is precisely tuned.
        // The 3px solid borderBottom + full-opacity boxShadow glow keeps
        // the band-color bar vivid regardless of age/occlusion fade.
        // Flat bottom radius (4px 4px 0 0) ensures edge-to-edge coverage.
        style={{
          cursor: "pointer",
          color: isHovered
            ? "rgba(255, 255, 255, 1)"
            : `rgba(255, 255, 255, ${textOpacity})`,
          backgroundColor: isHovered
            ? "rgba(10, 10, 26, 0.95)"
            : `rgba(10, 10, 26, ${0.88 * textOpacity})`,
          borderBottom: `3px solid ${underlineColor}`,
          borderRadius: "4px 4px 0 0",
          boxShadow: isHovered
            ? `0 3px 0 ${underlineColor}, 0 0 12px ${underlineColor}80, 0 6px 16px rgba(0,0,0,0.7)`
            : `0 3px 0 ${underlineColor}, 0 5px 10px rgba(0,0,0,0.5)`,
          textShadow: "0 1px 2px rgba(0,0,0,0.8)",
          letterSpacing: "0.03em",
          lineHeight: 1.2,
          // Smooth scale + shadow transitions; z-index change is instant
          transform: isHovered ? "scale(1.15)" : "scale(1)",
          transformOrigin: "center bottom",
          transition:
            "transform 0.15s ease-out, box-shadow 0.15s ease-out, background-color 0.15s ease-out, color 0.15s ease-out",
        }}
      >
        {callsign}
        {frequency && (
          <span
            className="ml-1"
            style={{
              fontSize: "0.9em",
              opacity: isHovered ? 0.9 : 0.75,
            }}
          >
            {formatFrequency(frequency)}
          </span>
        )}
      </div>
    </Html>
  );
}

export default SpotLabel;

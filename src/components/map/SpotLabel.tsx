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

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { getModeColor, getBandColor } from "@/lib/utils/spotColors";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import { GLOBE_DOM_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

/** Offset from globe surface to prevent z-fighting */
const SURFACE_OFFSET = 1.000002;

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
  /** Compact source badge shown after the callsign/frequency. */
  badge?: string;
  /** Accessible name when the pill opens or selects something. */
  ariaLabel?: string;
  /** Stack offset index for nearby labels (0 = no offset) */
  stackIndex?: number;
  /** Deterministic viewport-space displacement from the shared layout pass. */
  screenOffset?: { x: number; y: number };
  /** Visual label scale mirrored by the shared collision bounds. */
  labelScale?: number;
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
  onHover?: (screenPos: ScreenAnchor) => void;
  /** Called when mouse leaves this label */
  onHoverEnd?: () => void;
  /** Selects this spot and opens its canonical detail surface. */
  onSelect?: (screenPos: ScreenAnchor) => void;
  /** Keeps the selected target visually elevated after hover ends. */
  selected?: boolean;
  /** Called when this label is clicked or keyboard-activated. */
  onClick?: () => void;
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
  badge,
  ariaLabel,
  stackIndex = 0,
  screenOffset,
  labelScale = 1,
  color: colorProp,
  occlusionOpacity = 1.0,
  onHover,
  onHoverEnd,
  onSelect,
  selected = false,
  onClick,
}: SpotLabelProps) {
  const [isHovered, setIsHovered] = useState(false);
  const pointerHoveredRef = useRef(false);
  const keyboardFocusedRef = useRef(false);
  const onHoverEndRef = useRef(onHoverEnd);
  onHoverEndRef.current = onHoverEnd;

  // Labels are dynamically culled and can become part of a cluster while the
  // pointer is still over them. Mouse-leave never fires after that unmount, so
  // explicitly release only hover ownership this label actually acquired.
  // Keeping the latest callback in a ref avoids treating ordinary callback
  // identity changes as an unmount/release event.
  useEffect(
    () => () => {
      if (pointerHoveredRef.current || keyboardFocusedRef.current) {
        onHoverEndRef.current?.();
      }
    },
    [],
  );

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
  const isVisible = combinedOpacity >= 0.05;
  const isInteractive = Boolean(onSelect || onClick) && isVisible;
  const receivesPointer =
    Boolean(onHover || onHoverEnd || onSelect || onClick) && isVisible;

  // Size classes - sized for legibility (target audience 50-70 age range)
  const sizeClasses =
    size === "sm" ? "text-[11px] px-1.5 py-0.5" : "text-[13px] px-2 py-1";

  // Hover handlers — always enabled so labels in a stack are navigable,
  // even spotter labels that don't have an onHover detail callback.
  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      pointerHoveredRef.current = true;
      setIsHovered(true);
      const rect = e.currentTarget.getBoundingClientRect();
      onHover?.({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    },
    [onHover],
  );

  const handleMouseLeave = useCallback(() => {
    pointerHoveredRef.current = false;
    setIsHovered(keyboardFocusedRef.current);
    if (!keyboardFocusedRef.current) onHoverEnd?.();
  }, [onHoverEnd]);

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLButtonElement>) => {
      keyboardFocusedRef.current = true;
      setIsHovered(true);
      const rect = event.currentTarget.getBoundingClientRect();
      onHover?.({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    },
    [onHover],
  );

  const handleBlur = useCallback(() => {
    keyboardFocusedRef.current = false;
    setIsHovered(pointerHoveredRef.current);
    if (!pointerHoveredRef.current) onHoverEnd?.();
  }, [onHoverEnd]);

  const stopInteraction = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const selectAtElement = useCallback(
    (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      onSelect?.({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
      onClick?.();
    },
    [onClick, onSelect],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (isInteractive) selectAtElement(event.currentTarget);
    },
    [isInteractive, selectAtElement],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (
        isInteractive &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        selectAtElement(event.currentTarget);
      }
    },
    [isInteractive, selectAtElement],
  );

  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  if (!hasValidCoords) {
    return null;
  }

  // Keep the legacy stack index for non-coordinated callers. Globe activity
  // labels receive a full x/y displacement from the shared screen-space pass.
  const offsetX = screenOffset?.x ?? 0;
  const offsetY = screenOffset?.y ?? stackIndex * -24;
  const wrapperTransform = [
    offsetX || offsetY ? `translate(${offsetX}px, ${offsetY}px)` : "",
    labelScale !== 1 ? `scale(${labelScale})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Text opacity fades with age/occlusion but underline stays fully bright
  const textOpacity = Math.max(combinedOpacity, 0.35);
  const labelStyle: React.CSSProperties = {
    cursor: isInteractive ? "pointer" : receivesPointer ? "default" : "inherit",
    color:
      isHovered || selected
        ? "rgba(255, 255, 255, 1)"
        : `rgba(255, 255, 255, ${textOpacity})`,
    backgroundColor:
      isHovered || selected
        ? "rgba(10, 10, 26, 0.95)"
        : `rgba(10, 10, 26, ${0.88 * textOpacity})`,
    borderBottom: `3px solid ${underlineColor}`,
    borderRadius: "4px 4px 0 0",
    boxShadow:
      isHovered || selected
        ? `0 3px 0 ${underlineColor}, 0 0 12px ${underlineColor}80, 0 6px 16px rgba(0,0,0,0.7)`
        : `0 3px 0 ${underlineColor}, 0 5px 10px rgba(0,0,0,0.5)`,
    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
    letterSpacing: "0.03em",
    lineHeight: 1.2,
    transform: isHovered
      ? "scale(1.2)"
      : selected
        ? "scale(1.15)"
        : "scale(1)",
    transformOrigin: "center bottom",
    transition:
      "transform 0.15s ease-out, box-shadow 0.15s ease-out, background-color 0.15s ease-out, color 0.15s ease-out",
  };
  const labelContent = (
    <>
      {callsign}
      {frequency && (
        <span
          className="ml-1"
          style={{
            fontSize: "0.9em",
            opacity: isHovered || selected ? 0.9 : 0.75,
          }}
        >
          {formatFrequency(frequency)}
        </span>
      )}
      {badge && (
        <span
          className="ml-1 rounded-sm px-1 py-px"
          style={{
            fontSize: "0.72em",
            color: underlineColor,
            backgroundColor: `${underlineColor}1f`,
          }}
        >
          {badge}
        </span>
      )}
    </>
  );

  return (
    <Html
      position={position}
      center
      // When hovered, boost z-index so this label renders above all others
      // in the stack. Default [1,0] keeps non-hovered labels in paint order.
      zIndexRange={
        isHovered || selected
          ? GLOBE_DOM_LAYER_ORDER.activeSpotLabel
          : GLOBE_DOM_LAYER_ORDER.passiveSpotLabel
      }
      style={{
        // Hidden far-side labels must not remain hoverable or clickable through
        // the globe. Visible labels still accept hover even without onClick.
        pointerEvents: receivesPointer ? "auto" : "none",
        userSelect: "none",
        transition: "opacity 0.3s ease",
        transform: wrapperTransform || undefined,
        transformOrigin: "center bottom",
        // Outer wrapper only hides when fully occluded (behind globe)
        opacity: isVisible ? 1 : 0,
      }}
    >
      {isInteractive ? (
        <button
          type="button"
          className={`appearance-none border-0 font-mono font-bold whitespace-nowrap ${sizeClasses}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPointerDown={stopInteraction}
          onPointerUp={stopInteraction}
          onTouchStart={stopInteraction}
          onTouchEnd={stopInteraction}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
          onKeyUp={stopInteraction}
          aria-label={
            ariaLabel ??
            (onSelect ? `Select ${callsign} as target` : `${callsign} spot`)
          }
          aria-pressed={onSelect ? selected : undefined}
          style={labelStyle}
        >
          {labelContent}
        </button>
      ) : (
        <span
          className={`block font-mono font-bold whitespace-nowrap ${sizeClasses}`}
          onMouseEnter={receivesPointer ? handleMouseEnter : undefined}
          onMouseLeave={receivesPointer ? handleMouseLeave : undefined}
          aria-hidden="true"
          style={labelStyle}
        >
          {labelContent}
        </span>
      )}
    </Html>
  );
}

export default SpotLabel;

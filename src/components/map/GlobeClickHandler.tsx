/**
 * GlobeClickHandler Component
 *
 * Provides unified click and hover detection for the 3D globe surface.
 * Converts 3D intersection points to lat/lon coordinates and provides
 * screen positions for tooltip/flyout positioning.
 */

import { useRef, useCallback, useMemo } from "react";
import { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

/** Debounce delay for hover events in milliseconds */
const HOVER_DEBOUNCE_MS = 100;

export interface GlobeClickHandlerProps {
  /** Called when the globe surface is clicked */
  onLocationClick?: (
    lat: number,
    lon: number,
    screenPosition: { x: number; y: number },
  ) => void;
  /** Called when hovering over the globe surface */
  onLocationHover?: (
    lat: number,
    lon: number,
    screenPosition: { x: number; y: number },
  ) => void;
  /** Called when the pointer leaves the globe */
  onHoverEnd?: () => void;
  /** Child components (rendered inside the group) */
  children?: React.ReactNode;
  /** Globe radius for hit detection (default: 1) */
  radius?: number;
}

/**
 * Convert 3D point on unit sphere to lat/lon coordinates
 *
 * The forward transformation (latLonToVector3) uses:
 *   phi = (90 - lat) * π/180
 *   theta = (lon + 180) * π/180
 *   x = -radius * sin(phi) * cos(theta)
 *   y = radius * cos(phi)
 *   z = radius * sin(phi) * sin(theta)
 *
 * Inverse requires: theta = atan2(z, -x), then lon = theta * 180/π - 180
 *
 * @param point - Point on the sphere surface
 * @returns Latitude and longitude in degrees
 */
function pointToLatLon(point: THREE.Vector3): { lat: number; lon: number } {
  // Normalize the point to ensure it's on the unit sphere
  const normalized = point.clone().normalize();

  // Calculate latitude from y-coordinate
  // asin gives us the angle from the equatorial plane
  const lat = Math.asin(normalized.y) * (180 / Math.PI);

  // Calculate longitude from x and z coordinates
  // theta = atan2(z, -x), then lon = theta - 180° (with normalization)
  const theta = Math.atan2(normalized.z, -normalized.x);
  let lon = theta * (180 / Math.PI) - 180;

  // Normalize to [-180, 180] range
  if (lon < -180) lon += 360;

  return { lat, lon };
}

/**
 * Get screen position from native mouse/pointer event
 * Uses clientX/clientY which are viewport-relative coordinates
 */
function getScreenPositionFromEvent(
  event: ThreeEvent<MouseEvent | PointerEvent>,
): { x: number; y: number } {
  const nativeEvent = event.nativeEvent;
  return {
    x: nativeEvent.clientX,
    y: nativeEvent.clientY,
  };
}

/**
 * GlobeClickHandler wraps click/hover detection for the globe surface
 *
 * Uses raycasting to detect interactions with the globe and converts
 * the 3D intersection point to geographic coordinates (lat/lon).
 *
 * @example
 * ```tsx
 * <GlobeClickHandler
 *   onLocationClick={(lat, lon, screenPos) => {
 *     console.log(`Clicked at ${lat}, ${lon}`);
 *     showTooltip(screenPos.x, screenPos.y);
 *   }}
 *   onLocationHover={(lat, lon, screenPos) => {
 *     updateCrosshair(lat, lon);
 *   }}
 *   onHoverEnd={() => {
 *     hideCrosshair();
 *   }}
 * >
 *   <EarthSphere />
 *   <SpotMarkers />
 * </GlobeClickHandler>
 * ```
 */
export function GlobeClickHandler({
  onLocationClick,
  onLocationHover,
  onHoverEnd,
  children,
  radius = 1,
}: GlobeClickHandlerProps) {
  // Debounce timer for hover events
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoverRef = useRef<{ lat: number; lon: number } | null>(null);

  // Invisible sphere for hit detection
  const hitSphereRef = useRef<THREE.Mesh>(null);

  // Create sphere geometry for raycasting
  const sphereGeometry = useMemo(() => {
    return new THREE.SphereGeometry(radius, 64, 64);
  }, [radius]);

  /**
   * Process an intersection point and call the appropriate callback
   */
  const processIntersection = useCallback(
    (
      event: ThreeEvent<MouseEvent | PointerEvent>,
      callback?: (
        lat: number,
        lon: number,
        screenPosition: { x: number; y: number },
      ) => void,
    ) => {
      if (!callback || !event.point) return null;

      const { lat, lon } = pointToLatLon(event.point);
      // Use native event coordinates - these are viewport-relative
      const screenPos = getScreenPositionFromEvent(event);

      callback(lat, lon, screenPos);

      return { lat, lon, screenPos };
    },
    [],
  );

  /**
   * Handle click on globe surface
   */
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      processIntersection(event, onLocationClick);
    },
    [processIntersection, onLocationClick],
  );

  /**
   * Handle pointer move over globe surface with debouncing
   */
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!onLocationHover) return;

      // Clear existing timer
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }

      // Debounce hover events
      hoverTimerRef.current = setTimeout(() => {
        const result = processIntersection(event, onLocationHover);

        if (result) {
          lastHoverRef.current = { lat: result.lat, lon: result.lon };
        }

        hoverTimerRef.current = null;
      }, HOVER_DEBOUNCE_MS);
    },
    [processIntersection, onLocationHover],
  );

  /**
   * Handle pointer leaving the globe
   */
  const handlePointerLeave = useCallback(() => {
    // Clear any pending hover timer
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    lastHoverRef.current = null;
    onHoverEnd?.();
  }, [onHoverEnd]);

  return (
    <group>
      {/* Invisible hit detection sphere */}
      <mesh
        ref={hitSphereRef}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        visible={false}
      >
        <primitive object={sphereGeometry} attach="geometry" />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Child components (actual visible globe, markers, etc.) */}
      {children}
    </group>
  );
}

/**
 * useSpotFocus Hook
 *
 * Manages spot focus state and calculates camera positions for
 * focusing the 3D globe on a selected DX spot.
 */

import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpot } from "@/types/dxcluster";

/** Duration in ms before isFocusing resets to false */
const FOCUS_DURATION_MS = 5000;

/** Globe radius for position calculations */
const GLOBE_RADIUS = 1.0;

/** Camera distance from the focus point */
const CAMERA_DISTANCE = 2.5;

/**
 * 3D position in space
 */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

/**
 * State returned by the useSpotFocus hook
 */
export interface SpotFocusState {
  /** Target camera position to look at the spot */
  targetPosition: Position3D | null;
  /** 3D position of the spot on the globe surface */
  spotPosition: Position3D | null;
  /** Whether we're currently focusing on a spot (first 5 seconds) */
  isFocusing: boolean;
  /** The spot we're focused on */
  focusedSpot: DXSpot | null;
  /** Clear focus and return to default view */
  clearFocus: () => void;
}

/**
 * Convert latitude/longitude to 3D position on a sphere
 *
 * Uses the same coordinate system as LocationMarker for consistency:
 * - Phi: polar angle from the north pole
 * - Theta: azimuthal angle (longitude offset by 180 degrees)
 */
export function latLonToPosition3D(
  lat: number,
  lon: number,
  radius: number = GLOBE_RADIUS,
): Position3D {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

/**
 * Calculate camera position to look at a point on the globe
 *
 * Positions the camera along the vector from the globe center
 * through the target point, at the specified distance.
 */
function calculateCameraPosition(
  spotPosition: Position3D,
  distance: number = CAMERA_DISTANCE,
): Position3D {
  // Normalize the spot position vector
  const magnitude = Math.sqrt(
    spotPosition.x ** 2 + spotPosition.y ** 2 + spotPosition.z ** 2,
  );

  if (magnitude === 0) {
    // Fallback for center position
    return { x: 0, y: 0, z: distance };
  }

  // Position camera along the same direction, at the specified distance
  const scale = distance / magnitude;

  return {
    x: spotPosition.x * scale,
    y: spotPosition.y * scale,
    z: spotPosition.z * scale,
  };
}

/**
 * Hook that manages spot focus state and calculates camera positions
 *
 * Watches the selected spot from useDXStore and provides:
 * - Target camera position for focusing
 * - Focus state (active for 5 seconds after selection)
 * - The currently focused spot
 * - A function to clear focus
 *
 * @example
 * ```tsx
 * const { targetPosition, isFocusing, focusedSpot, clearFocus } = useSpotFocus();
 *
 * // Use targetPosition to animate camera
 * // Use isFocusing for highlight animations
 * // Call clearFocus() to return to default view
 * ```
 */
export function useSpotFocus(): SpotFocusState {
  const selectedSpot = useDXStore((state) => state.selectedSpot);
  const setSelectedSpot = useDXStore((state) => state.setSelectedSpot);

  const [isFocusing, setIsFocusing] = useState(false);
  const [focusedSpot, setFocusedSpot] = useState<DXSpot | null>(null);

  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Calculate spot position on the globe surface
  const spotPosition = useMemo((): Position3D | null => {
    if (!focusedSpot?.dxLat || !focusedSpot?.dxLon) {
      return null;
    }

    return latLonToPosition3D(focusedSpot.dxLat, focusedSpot.dxLon);
  }, [focusedSpot]);

  // Calculate target camera position
  const targetPosition = useMemo((): Position3D | null => {
    if (!spotPosition) {
      return null;
    }

    return calculateCameraPosition(spotPosition);
  }, [spotPosition]);

  // Watch for spot selection changes
  useEffect(() => {
    // Clear any existing timer
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    // Check if spot has valid coordinates
    if (selectedSpot?.dxLat != null && selectedSpot?.dxLon != null) {
      // New valid spot selected - start focusing
      setFocusedSpot(selectedSpot);
      setIsFocusing(true);

      // Set timer to stop focusing animation after duration
      focusTimerRef.current = setTimeout(() => {
        setIsFocusing(false);
        focusTimerRef.current = null;
      }, FOCUS_DURATION_MS);
    } else if (!selectedSpot) {
      // Spot deselected - clear focus
      setFocusedSpot(null);
      setIsFocusing(false);
    }
    // If selectedSpot exists but has no coordinates, maintain previous focus

    // Cleanup timer on unmount
    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
    };
  }, [selectedSpot]);

  // Clear focus and return to default view
  const clearFocus = useCallback(() => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    setFocusedSpot(null);
    setIsFocusing(false);
    setSelectedSpot(null);
  }, [setSelectedSpot]);

  return {
    targetPosition,
    spotPosition,
    isFocusing,
    focusedSpot,
    clearFocus,
  };
}

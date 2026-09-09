/**
 * useSpotFocus Hook
 *
 * Manages spot focus state and calculates camera positions for
 * focusing the 3D globe on a selected DX spot.
 */

import { useEffect, useMemo, useRef, useCallback, useState, useSyncExternalStore } from "react";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpot } from "@/types/dxcluster";
import { useViewRuntime } from "@/components/views/ViewRuntimeContext";

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

export function hasValidSpotCoordinates(
  spot: Pick<DXSpot, "dxLat" | "dxLon"> | null | undefined,
): spot is Pick<DXSpot, "dxLat" | "dxLon"> & {
  dxLat: number;
  dxLon: number;
} {
  return Boolean(
    spot &&
      Number.isFinite(spot.dxLat) &&
      Number.isFinite(spot.dxLon) &&
      spot.dxLat! >= -90 &&
      spot.dxLat! <= 90 &&
      spot.dxLon! >= -180 &&
      spot.dxLon! <= 180,
  );
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
function useSpotFocusState(
  selectedSpot: DXSpot | null,
  onClear: () => void,
): SpotFocusState {
  const [isFocusing, setIsFocusing] = useState(false);
  const [focusedSpot, setFocusedSpot] = useState<DXSpot | null>(null);

  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const spotPosition = useMemo((): Position3D | null => {
    if (!hasValidSpotCoordinates(focusedSpot)) {
      return null;
    }

    return latLonToPosition3D(focusedSpot.dxLat!, focusedSpot.dxLon!);
  }, [focusedSpot]);

  const targetPosition = useMemo((): Position3D | null => {
    if (!spotPosition) {
      return null;
    }

    return calculateCameraPosition(spotPosition);
  }, [spotPosition]);

  useEffect(() => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    if (hasValidSpotCoordinates(selectedSpot)) {
      setFocusedSpot(selectedSpot);
      setIsFocusing(true);

      focusTimerRef.current = setTimeout(() => {
        setIsFocusing(false);
        focusTimerRef.current = null;
      }, FOCUS_DURATION_MS);
    } else if (!selectedSpot) {
      setFocusedSpot(null);
      setIsFocusing(false);
    }

    return () => {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
    };
  }, [selectedSpot]);

  const clearFocus = useCallback(() => {
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    setFocusedSpot(null);
    setIsFocusing(false);
    onClear();
  }, [onClear]);

  return {
    targetPosition,
    spotPosition,
    isFocusing,
    focusedSpot,
    clearFocus,
  };
}

/** Camera focus for this view's selection only. Shared DX rows stay shared. */
export function useViewSpotFocus(spots: readonly DXSpot[]): SpotFocusState {
  const runtime = useViewRuntime();
  const runtimeSelectedId = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().interaction.selectedReportId,
  );
  const target = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().interaction.target,
  );
  // Legacy writers (DXSpotList row click, BandMap, wall BandTopDx) still set
  // dxStore.selectedSpot directly without touching the runtime. The runtime
  // is the authority when it has a value; otherwise fall back to the store
  // so those clicks keep working (see PR #603 NEW-2).
  const dxSelectedSpot = useDXStore((s) => s.selectedSpot);
  const selectedId = runtimeSelectedId ?? dxSelectedSpot?.id;
  // Resolved outside the memo so the memo keys on the row itself, not on
  // `spots`' array identity — a cluster poll produces a new `spots` array
  // every cycle even when the selected row is unchanged, and keying on the
  // array previously rebuilt `selectedSpot` (and re-armed the focus timer,
  // see useSpotFocusState's [selectedSpot] effect) on every poll.
  const row = selectedId
    ? spots.find((spot) => spot.id === selectedId)
    : undefined;
  const selectedSpot = useMemo(() => {
    if (!selectedId) return null;
    if (!runtimeSelectedId) {
      // No runtime-bound selection for this view — use the legacy store
      // write as-is, including its own coordinates.
      return row ?? dxSelectedSpot ?? null;
    }
    if (!target || (target.reportId !== null && target.reportId !== selectedId)) return null;
    const hadCoordinates = hasValidSpotCoordinates(row);
    return {
      ...(row ?? {
        id: selectedId,
        spotter: "",
        dx: "",
        frequency: 0,
        comment: "",
        time: new Date(0),
      }),
      dxLat: target.lat,
      dxLon: target.lon,
      dxLocApprox: hadCoordinates ? row?.dxLocApprox === true : !row?.dxGrid,
    };
  }, [row, runtimeSelectedId, selectedId, target, dxSelectedSpot]);
  const onClear = useCallback(() => runtime.clearSelection(), [runtime]);
  return useSpotFocusState(selectedSpot, onClear);
}

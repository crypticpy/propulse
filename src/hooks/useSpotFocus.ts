/**
 * useSpotFocus Hook
 *
 * Manages spot focus state and calculates camera positions for
 * focusing the 3D globe on a selected DX spot.
 */

import { useEffect, useMemo, useRef, useCallback, useState, useSyncExternalStore } from "react";
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

/**
 * `focusedSpot.id` for a manual camera target synthesized below — not a
 * real DX spot. Consumers that treat `focusedSpot` as spot-derived UI (e.g.
 * `selectedSpotMatchesTarget` in FlatMapView/GlobeView, which suppresses a
 * hover target's own label/difficulty/path metrics when it already matches
 * a selected spot) must check this first: a manual target's coordinates
 * trivially equal themselves, so without this check every manual target
 * would be mistaken for "this hover target is the selected spot."
 */
export const MANUAL_FOCUS_SPOT_ID = "manual-target";

/**
 * Camera focus for this view's selection only. Shared DX rows stay shared.
 * Includes every field a `focusedSpot` consumer reads off the cached row
 * (`SelectedSpotArc` also uses `spotter`/`spotterLat`/`spotterLon`/
 * `spotterGrid`) so a refresh that changes one of them busts the cache
 * instead of leaving `stableSpots` pointing at a stale row indefinitely.
 */
function spotsFocusKey(spots: readonly DXSpot[]): string {
  if (spots.length === 0) return "";
  return spots
    .map(
      (spot) =>
        `${spot.id}:${spot.dxLat ?? ""}:${spot.dxLon ?? ""}:${spot.dxGrid ?? ""}:${spot.spotter ?? ""}:${spot.spotterLat ?? ""}:${spot.spotterLon ?? ""}:${spot.spotterGrid ?? ""}`,
    )
    .join("|");
}

export function useViewSpotFocus(spots: readonly DXSpot[]): SpotFocusState {
  const runtime = useViewRuntime();
  const selectedId = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().interaction.selectedReportId,
  );
  const target = useSyncExternalStore(
    runtime.subscribe,
    () => runtime.getSnapshot().interaction.target,
  );
  // Keep the previous array when contents are equivalent so a fresh inline
  // `[]` or a cluster poll cannot rebuild `selectedSpot` and re-arm the 5s
  // focus timer. `row` object identity is not a dep.
  const listKey = spotsFocusKey(spots);
  const listCache = useRef({ key: listKey, spots });
  if (listCache.current.key !== listKey) {
    listCache.current = { key: listKey, spots };
  }
  const stableSpots = listCache.current.spots;
  const selectedSpot = useMemo(() => {
    if (selectedId) {
      if (!target || (target.reportId !== null && target.reportId !== selectedId)) return null;
      const row = stableSpots.find((spot) => spot.id === selectedId);
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
    }
    if (target?.origin === "manual") {
      return {
        id: MANUAL_FOCUS_SPOT_ID,
        spotter: "",
        dx: "",
        frequency: 0,
        comment: "",
        time: new Date(0),
        dxLat: target.lat,
        dxLon: target.lon,
        dxLocApprox: false,
      };
    }
    return null;
  }, [selectedId, target, stableSpots]);
  const onClear = useCallback(() => runtime.clearSelection(), [runtime]);
  return useSpotFocusState(selectedSpot, onClear);
}

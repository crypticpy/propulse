import { useCallback } from "react";
import {
  extractPrefixFromCallsign,
  getLocationFromPrefix,
} from "@/lib/data/prefixLocations";
import { gridToLatLon, isValidGrid } from "@/lib/utils/grid";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore, type TargetLocation } from "@/stores/mapStore";
import type { DXSpot } from "@/types/dxcluster";

export type MapSpotLocationSource = "coordinates" | "grid" | "callsign-prefix";

export interface MapSpotSelection {
  /** The selected spot, normalized with the coordinates used by the map. */
  spot: DXSpot;
  /** The corresponding map target. */
  target: TargetLocation;
  /** How the DX endpoint was located. */
  locationSource: MapSpotLocationSource;
}

export interface MapSpotSelectionActions {
  setSelectedSpot: (spot: DXSpot) => void;
  setTarget: (target: TargetLocation | null) => void;
}

function isValidCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isValidCoordinatePair(lat: unknown, lon: unknown): boolean {
  return (
    isValidCoordinate(lat, -90, 90) &&
    isValidCoordinate(lon, -180, 180)
  );
}

/**
 * Resolve a live/DX spot to the endpoint the user intends to target.
 *
 * Feed coordinates have highest authority, followed by the DX Maidenhead grid
 * center and finally the existing callsign-prefix centroid. The returned spot
 * carries the resolved coordinates so every selected-spot renderer uses the
 * same endpoint as the target beacon.
 */
export function resolveMapSpotSelection(
  spot: DXSpot,
): MapSpotSelection | null {
  let lat: number;
  let lon: number;
  let locationSource: MapSpotLocationSource;
  const dxGrid = spot.dxGrid?.trim();

  if (
    isValidCoordinate(spot.dxLat, -90, 90) &&
    isValidCoordinate(spot.dxLon, -180, 180)
  ) {
    lat = spot.dxLat;
    lon = spot.dxLon;
    locationSource = "coordinates";
  } else if (dxGrid && isValidGrid(dxGrid)) {
    try {
      // gridToLatLon supports four/six characters; an extended locator has
      // the same accurate six-character parent for map presentation.
      const location = gridToLatLon(dxGrid.slice(0, 6));
      lat = location.lat;
      lon = location.lon;
      locationSource = "grid";
    } catch {
      const prefix = extractPrefixFromCallsign(spot.dx);
      const location = getLocationFromPrefix(prefix);
      if (!location || !isValidCoordinatePair(location.lat, location.lon)) {
        return null;
      }
      lat = location.lat;
      lon = location.lon;
      locationSource = "callsign-prefix";
    }
  } else {
    const prefix = extractPrefixFromCallsign(spot.dx);
    const location = getLocationFromPrefix(prefix);
    if (!location || !isValidCoordinatePair(location.lat, location.lon)) {
      return null;
    }
    lat = location.lat;
    lon = location.lon;
    locationSource = "callsign-prefix";
  }

  const grid = dxGrid && isValidGrid(dxGrid) ? dxGrid : undefined;
  const normalizedSpot: DXSpot = {
    ...spot,
    dxLat: lat,
    dxLon: lon,
    dxLocApprox:
      locationSource === "coordinates"
        ? spot.dxLocApprox === true
        : locationSource === "callsign-prefix",
  };

  return {
    spot: normalizedSpot,
    target: {
      lat,
      lon,
      grid,
      name: spot.dx,
    },
    locationSource,
  };
}

/**
 * Commit selection and target together. A spot that cannot be located still
 * becomes the selected details record, but it cannot leave a misleading new
 * target at an unrelated coordinate.
 */
export function commitMapSpotSelection(
  spot: DXSpot,
  actions: MapSpotSelectionActions,
): MapSpotSelection | null {
  const resolved = resolveMapSpotSelection(spot);
  actions.setSelectedSpot(resolved?.spot ?? spot);
  if (resolved) {
    actions.setTarget(resolved.target);
  } else {
    actions.setTarget(null);
  }
  return resolved;
}

/** Shared selection command for map-rendered live and DX-cluster spots. */
export function useMapSpotSelection() {
  const setSelectedSpot = useDXStore((state) => state.setSelectedSpot);
  const setTarget = useMapStore((state) => state.setTarget);

  return useCallback(
    (spot: DXSpot) =>
      commitMapSpotSelection(spot, { setSelectedSpot, setTarget }),
    [setSelectedSpot, setTarget],
  );
}

export default useMapSpotSelection;

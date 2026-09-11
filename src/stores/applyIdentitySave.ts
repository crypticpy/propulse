import type { OperatingLocation, UserStation } from "@/types/user";
import { gridToLatLon } from "@/lib/utils/grid";

export interface IdentitySaveInput {
  callsign: string;
  operatorName: string;
  grid: string;
}

export interface IdentitySaveOptions {
  createId?: () => string;
  now?: () => string;
}

function normalizeGrid(grid: string): string {
  return grid.trim().toUpperCase();
}

function homeInList(station: UserStation): OperatingLocation | undefined {
  const id = station.homeLocationId;
  if (!id) return undefined;
  return station.savedLocations?.find((loc) => loc.id === id);
}

/**
 * Identity-form save: patch callsign/name/grid without dropping station
 * metadata or other saved locations, and without replacing precise home
 * coordinates with a grid centroid unless the grid field actually changed.
 */
export function applyIdentitySave(
  station: UserStation | null,
  input: IdentitySaveInput,
  options: IdentitySaveOptions = {},
): UserStation | null {
  const callsign = input.callsign.trim().toUpperCase();
  const operatorName = input.operatorName.trim() || undefined;
  const gridUpper = normalizeGrid(input.grid);
  const previousGrid = normalizeGrid(station?.grid ?? "");
  const gridChanged = gridUpper !== previousGrid;

  if (!callsign && !gridUpper) {
    return null;
  }

  const identity = {
    callsign,
    operatorName,
  };

  if (!station) {
    if (!gridUpper) {
      return {
        ...identity,
        homeLocationId: "",
        activeLocationId: null,
        savedLocations: [],
        grid: "",
        lat: 0,
        lon: 0,
      };
    }
    return createStationWithHome(identity, gridUpper, options);
  }

  if (!gridChanged) {
    return {
      ...station,
      ...identity,
    };
  }

  if (!gridUpper) {
    // Cleared grid: drop the locator string only. Do not invent 0,0 or
    // rewrite saved location coordinates.
    return {
      ...station,
      ...identity,
      grid: "",
    };
  }

  const coords = gridToLatLon(gridUpper);
  const existingHome = homeInList(station);

  if (existingHome) {
    const savedLocations = station.savedLocations.map((loc) =>
      loc.id === existingHome.id
        ? { ...loc, grid: gridUpper, lat: coords.lat, lon: coords.lon }
        : loc,
    );
    return {
      ...station,
      ...identity,
      savedLocations,
      grid: gridUpper,
      lat: coords.lat,
      lon: coords.lon,
    };
  }

  const home = makeHomeLocation(gridUpper, coords, options);
  return {
    ...station,
    ...identity,
    homeLocationId: home.id,
    savedLocations: [...(station.savedLocations ?? []), home],
    grid: gridUpper,
    lat: coords.lat,
    lon: coords.lon,
  };
}

function makeHomeLocation(
  grid: string,
  coords: { lat: number; lon: number },
  options: IdentitySaveOptions,
): OperatingLocation {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  return {
    id: createId(),
    name: "Home",
    grid,
    lat: coords.lat,
    lon: coords.lon,
    type: "home",
    createdAt: now(),
  };
}

function createStationWithHome(
  identity: { callsign: string; operatorName: string | undefined },
  grid: string,
  options: IdentitySaveOptions,
): UserStation {
  const coords = gridToLatLon(grid);
  const home = makeHomeLocation(grid, coords, options);
  return {
    ...identity,
    homeLocationId: home.id,
    activeLocationId: null,
    savedLocations: [home],
    grid,
    lat: coords.lat,
    lon: coords.lon,
  };
}

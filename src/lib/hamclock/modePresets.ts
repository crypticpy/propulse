/**
 * HamClock mode → map layer presets.
 * Kept out of the Zustand stores to avoid circular imports with mapStore.
 */

import type { DisplayQuality } from "@/stores/displayQualityStore";
import type { MapState, ViewMode } from "@/stores/mapStore";
import type { SpotFilters } from "@/types/operatingProfile";

export type HamClockMode = "traffic" | "bands" | "satellites" | "weather";

export const HAMCLOCK_MODE_LAYERS: Record<
  HamClockMode,
  Partial<MapState["layers"]>
> = {
  traffic: {
    spots: true,
    spotTraces: false,
    gridActivity: true,
    satellites: false,
    satelliteFootprints: false,
    weather: false,
    lightning: false,
    muf: true,
    aurora: false,
    drap: false,
    goesCloud: false,
    radar: false,
  },
  bands: {
    spots: true,
    spotTraces: true,
    gridActivity: true,
    satellites: false,
    satelliteFootprints: false,
    weather: false,
    lightning: false,
    muf: true,
    aurora: false,
    drap: false,
    goesCloud: false,
    radar: false,
  },
  satellites: {
    spots: false,
    spotTraces: false,
    gridActivity: false,
    satellites: true,
    satelliteFootprints: true,
    weather: false,
    lightning: false,
    muf: false,
    aurora: false,
    drap: false,
    goesCloud: false,
    radar: false,
    issTracker: true,
  },
  weather: {
    spots: true,
    spotTraces: false,
    gridActivity: false,
    satellites: false,
    satelliteFootprints: false,
    weather: true,
    lightning: true,
    muf: false,
    aurora: false,
    drap: false,
    goesCloud: true,
    radar: true,
  },
};

export const HAMCLOCK_ENTER_LAYERS: Partial<MapState["layers"]> = {
  terminator: true,
  greyline: true,
  nightLights: true,
  labels: false,
  ...HAMCLOCK_MODE_LAYERS.traffic,
};

/** Overlay keys HamClock modes own — zeroed before applying a mode preset. */
export const HAMCLOCK_CONTROLLED_LAYER_KEYS = [
  "spots",
  "spotTraces",
  "gridActivity",
  "satellites",
  "satelliteFootprints",
  "weather",
  "lightning",
  "muf",
  "aurora",
  "drap",
  "goesCloud",
  "radar",
  "issTracker",
  "earthquakes",
  "fires",
  "wspr",
  "activations",
  "nvis",
] as const satisfies readonly (keyof MapState["layers"])[];

export function applyHamClockModeLayers(
  current: MapState["layers"],
  mode: HamClockMode,
): MapState["layers"] {
  const cleared: MapState["layers"] = { ...current };
  for (const key of HAMCLOCK_CONTROLLED_LAYER_KEYS) {
    cleared[key] = false as never;
  }
  return {
    ...cleared,
    ...HAMCLOCK_ENTER_LAYERS,
    ...HAMCLOCK_MODE_LAYERS[mode],
  };
}

export interface HamClockEnterSnapshot {
  /** Layout mode in effect before entering HamClock (Normal/Pro/Lite). */
  layoutMode: Exclude<MapState["layoutMode"], "hamclock">;
  viewMode: ViewMode;
  mapStyle: MapState["mapStyle"];
  layers: MapState["layers"];
  spotFilters: SpotFilters;
  displayQuality: DisplayQuality;
  nightDarkness: number;
}

/** HamClock beauty defaults applied on enter (in addition to mode layers). */
export const HAMCLOCK_BEAUTY_DEFAULTS = {
  mapStyle: "satellite" as const,
  /** Slightly softer than full black for wall readability of night-side detail. */
  nightDarkness: 0.85,
  /** Prefer Auto→UHD behavior on large walls without forcing Extreme bandwidth. */
  displayQuality: "uhd" as const,
};

import type { MapState } from "@/stores/mapStore";

export type PropSphereViewMode = "globe" | "flat" | "azimuthal";
export type PropSphereLayerKey = keyof MapState["layers"];

export interface LayerAvailability {
  available: boolean;
  reason?: string;
}

function requireAllLayerKeys<const Keys extends readonly PropSphereLayerKey[]>(
  keys: Keys &
    (Exclude<PropSphereLayerKey, Keys[number]> extends never
      ? unknown
      : { missingLayerKeys: Exclude<PropSphereLayerKey, Keys[number]> }),
): Keys {
  return keys;
}

const PROP_SPHERE_LAYER_KEYS = requireAllLayerKeys([
  "terminator",
  "greyline",
  "aurora",
  "muf",
  "nvis",
  "spots",
  "spotTraces",
  "nightLights",
  "labels",
  "satellites",
  "earthquakes",
  "weather",
  "lightning",
  "wspr",
  "contestQsos",
  "loggedQsos",
  "fires",
  "radar",
  "issTracker",
  "gridActivity",
  "ionosphere",
  "rayPath",
  "drap",
  "geomagField",
  "noiseFloor",
  "meteorShowers",
  "beacons",
  "spectrumRing",
  "ducting",
  "sporadicE",
  "satelliteFootprints",
  "ft8Spotter",
  "goesCloud",
  "tec",
  "repeaters",
  "riverGauges",
  "aprs",
  "tropical",
  "sst",
] as const satisfies readonly PropSphereLayerKey[]);

const PROP_SPHERE_LAYER_KEY_SET = new Set<string>(PROP_SPHERE_LAYER_KEYS);
const PROP_SPHERE_DISPLAY_CONTROL_KEYS = new Set([
  "stateBorders",
  "maidenheadGrid",
  "gridLabels",
  "tileLabels",
  "autoRotate",
]);

const FLAT_UNSUPPORTED_LAYER_KEYS = [
  "aprs",
  "beacons",
  "drap",
  "ducting",
  "geomagField",
  "goesCloud",
  "gridActivity",
  "ionosphere",
  "issTracker",
  "meteorShowers",
  "noiseFloor",
  "nvis",
  "radar",
  "rayPath",
  "repeaters",
  "riverGauges",
  "satelliteFootprints",
  "spectrumRing",
  "sporadicE",
  "sst",
  "tec",
  "tropical",
] as const satisfies readonly PropSphereLayerKey[];
const FLAT_UNSUPPORTED_LAYERS = new Set<PropSphereLayerKey>(
  FLAT_UNSUPPORTED_LAYER_KEYS,
);

const AZIMUTHAL_SUPPORTED_LAYER_KEYS = [
  "earthquakes",
  "fires",
  "labels",
  "lightning",
  "nightLights",
  "spots",
  "spotTraces",
  "terminator",
  "weather",
] as const satisfies readonly PropSphereLayerKey[];
const AZIMUTHAL_SUPPORTED_LAYERS = new Set<PropSphereLayerKey>(
  AZIMUTHAL_SUPPORTED_LAYER_KEYS,
);

export const WSPR_LIVE_SOURCE_ENABLED =
  import.meta.env.VITE_WSPR_LIVE_ENABLED === "true";

export const LIGHTNING_LIVE_SOURCE_ENABLED =
  import.meta.env.VITE_LIGHTNING_LIVE_ENABLED === "true";

export const TEC_LIVE_SOURCE_ENABLED =
  import.meta.env.VITE_TEC_LIVE_ENABLED === "true";

export const REPEATERBOOK_LIVE_SOURCE_ENABLED =
  import.meta.env.VITE_REPEATERBOOK_LIVE_ENABLED === "true";

export const APRS_LIVE_SOURCE_ENABLED =
  import.meta.env.VITE_APRS_LIVE_ENABLED === "true";

export const EXCLUSIVE_SURFACE_LAYERS = [
  "radar",
  "goesCloud",
  "tec",
  "sst",
  "muf",
  "noiseFloor",
] as const satisfies readonly PropSphereLayerKey[];

const EXCLUSIVE_SURFACE_LAYER_SET = new Set<PropSphereLayerKey>(
  EXCLUSIVE_SURFACE_LAYERS,
);

export function normalizeExclusiveLayers<T extends Record<string, boolean>>(
  layers: T,
  preferredLayer?: PropSphereLayerKey,
): T {
  const next = { ...layers };
  const enabled = EXCLUSIVE_SURFACE_LAYERS.filter(
    (candidate) => next[candidate] === true,
  );
  if (enabled.length <= 1) return next;

  const keep =
    enabled.find((candidate) => candidate === preferredLayer) ?? enabled[0];
  for (const candidate of enabled) {
    if (candidate !== keep) {
      (next as Record<string, boolean>)[candidate] = false;
    }
  }
  return next;
}

export function toggleExclusiveLayer<T extends Record<string, boolean>>(
  layers: T,
  layerKey: keyof T & PropSphereLayerKey,
): T {
  const enabling = !layers[layerKey];
  const next = { ...layers, [layerKey]: enabling };

  const preferred =
    enabling && EXCLUSIVE_SURFACE_LAYER_SET.has(layerKey) ? layerKey : undefined;
  return normalizeExclusiveLayers(next, preferred);
}

export function getLayerAvailability(
  layerKey: string,
  viewMode: PropSphereViewMode,
): LayerAvailability {
  if (
    !PROP_SPHERE_LAYER_KEY_SET.has(layerKey) &&
    !PROP_SPHERE_DISPLAY_CONTROL_KEYS.has(layerKey)
  ) {
    return { available: false, reason: "Unknown layer control" };
  }

  if (layerKey === "wspr" && !WSPR_LIVE_SOURCE_ENABLED) {
    return {
      available: false,
      reason: "Live WSPR access is pending source permission",
    };
  }

  if (layerKey === "lightning" && !LIGHTNING_LIVE_SOURCE_ENABLED) {
    return {
      available: false,
      reason: "Live lightning access is pending an authorized source",
    };
  }

  if (layerKey === "tec" && !TEC_LIVE_SOURCE_ENABLED) {
    return {
      available: false,
      reason: "NOAA's experimental TEC feed is currently unavailable",
    };
  }

  if (layerKey === "repeaters" && !REPEATERBOOK_LIVE_SOURCE_ENABLED) {
    return {
      available: false,
      reason: "RepeaterBook access is pending provider approval",
    };
  }

  if (layerKey === "aprs" && !APRS_LIVE_SOURCE_ENABLED) {
    return {
      available: false,
      reason: "APRS.fi access is not configured",
    };
  }

  if (
    viewMode === "flat" &&
    FLAT_UNSUPPORTED_LAYERS.has(layerKey as PropSphereLayerKey)
  ) {
    return { available: false, reason: "Available in Globe view" };
  }

  if (
    viewMode === "azimuthal" &&
    !AZIMUTHAL_SUPPORTED_LAYERS.has(layerKey as PropSphereLayerKey)
  ) {
    return { available: false, reason: "Not available in Azimuthal view" };
  }

  return { available: true };
}

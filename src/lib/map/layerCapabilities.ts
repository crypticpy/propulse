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
  "activations",
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
  "timeStations",
] as const satisfies readonly PropSphereLayerKey[]);

const PROP_SPHERE_LAYER_KEY_SET = new Set<string>(PROP_SPHERE_LAYER_KEYS);
const PROP_SPHERE_DISPLAY_CONTROL_KEYS = new Set([
  "stateBorders",
  "maidenheadGrid",
  "gridLabels",
  "tileLabels",
  "autoRotate",
  "qthOrientation",
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
  "timeStations",
  "tropical",
] as const satisfies readonly PropSphereLayerKey[];
const FLAT_UNSUPPORTED_LAYERS = new Set<PropSphereLayerKey>(
  FLAT_UNSUPPORTED_LAYER_KEYS,
);

const AZIMUTHAL_SUPPORTED_LAYER_KEYS = [
  "earthquakes",
  "activations",
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

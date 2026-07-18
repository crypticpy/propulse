export type PropSphereViewMode = "globe" | "flat" | "azimuthal";

export interface LayerAvailability {
  available: boolean;
  reason?: string;
}

const FLAT_UNSUPPORTED_LAYERS = new Set([
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
  "satelliteFootprints",
  "spectrumRing",
  "sporadicE",
  "sst",
  "tec",
]);

const AZIMUTHAL_SUPPORTED_LAYERS = new Set([
  "earthquakes",
  "fires",
  "labels",
  "lightning",
  "nightLights",
  "spots",
  "spotTraces",
  "terminator",
  "weather",
]);

export const WSPR_LIVE_SOURCE_ENABLED =
  import.meta.env.VITE_WSPR_LIVE_ENABLED === "true";

export const LIGHTNING_LIVE_SOURCE_ENABLED =
  import.meta.env.VITE_LIGHTNING_LIVE_ENABLED === "true";

export const TEC_LIVE_SOURCE_ENABLED =
  import.meta.env.VITE_TEC_LIVE_ENABLED === "true";

export const EXCLUSIVE_SURFACE_LAYERS = [
  "radar",
  "goesCloud",
  "tec",
  "sst",
  "muf",
  "noiseFloor",
] as const;

const EXCLUSIVE_SURFACE_LAYER_SET = new Set<string>(EXCLUSIVE_SURFACE_LAYERS);

export function toggleExclusiveLayer<T extends Record<string, boolean>>(
  layers: T,
  layerKey: keyof T & string,
): T {
  const enabling = !layers[layerKey];
  const next = { ...layers, [layerKey]: enabling };

  if (enabling && EXCLUSIVE_SURFACE_LAYER_SET.has(layerKey)) {
    for (const candidate of EXCLUSIVE_SURFACE_LAYERS) {
      if (candidate !== layerKey && candidate in next) {
        (next as Record<string, boolean>)[candidate] = false;
      }
    }
  }

  return next;
}

export function getLayerAvailability(
  layerKey: string,
  viewMode: PropSphereViewMode,
): LayerAvailability {
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

  if (viewMode === "flat" && FLAT_UNSUPPORTED_LAYERS.has(layerKey)) {
    return { available: false, reason: "Available in Globe view" };
  }

  if (viewMode === "azimuthal" && !AZIMUTHAL_SUPPORTED_LAYERS.has(layerKey)) {
    return { available: false, reason: "Not available in Azimuthal view" };
  }

  return { available: true };
}

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

export const PROP_SPHERE_LAYER_KEYS = requireAllLayerKeys([
  "terminator",
  "greyline",
  "aurora",
  "muf",
  "nvis",
  "spots",
  "activations",
  "spotTraces",
  "nightLights",
  "lunarSubpoint",
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

/** Layers FlatMapView does not draw. Radar and grid activity are omitted
 * on purpose: the flat canvas drapes radar (`useFlatRadarCanvas`) and paints
 * grid-activity cells. DRAP, GOES, ducting and sporadic-E stay here — they
 * have globe implementations only. */
export const FLAT_UNSUPPORTED_LAYER_KEYS = [
  "aprs",
  "beacons",
  "drap",
  "ducting",
  "geomagField",
  "goesCloud",
  "ionosphere",
  "issTracker",
  "meteorShowers",
  "noiseFloor",
  "nvis",
  "rayPath",
  "repeaters",
  "riverGauges",
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

export const AZIMUTHAL_SUPPORTED_LAYER_KEYS = [
  "earthquakes",
  "activations",
  "fires",
  "gridActivity",
  "labels",
  "lightning",
  "nightLights",
  "lunarSubpoint",
  "spots",
  "spotTraces",
  "terminator",
  "weather",
] as const satisfies readonly PropSphereLayerKey[];
const AZIMUTHAL_SUPPORTED_LAYERS = new Set<PropSphereLayerKey>(
  AZIMUTHAL_SUPPORTED_LAYER_KEYS,
);

/**
 * Globe-only hero overlays from #625. Radar drapes on the flat canvas, so it
 * is not in this set — enabling it must not yank a wall off the operator's
 * projection. The host passes only these keys into `resolveHeroProjection`.
 */
export const HERO_CRITICAL_LAYER_KEYS = [
  "drap",
  "goesCloud",
  "ducting",
  "sporadicE",
] as const satisfies readonly PropSphereLayerKey[];

export function enabledHeroCriticalLayers(
  layers: Partial<Record<PropSphereLayerKey, boolean>>,
): PropSphereLayerKey[] {
  return HERO_CRITICAL_LAYER_KEYS.filter((key) => layers[key] === true);
}

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

export const HERO_PROJECTION_FALLBACKS = [
  "globe",
  "azimuthal",
] as const satisfies readonly PropSphereViewMode[];

export interface HeroProjectionResolution {
  projection: PropSphereViewMode;
  forcedBy: string[];
}

function layersBlockingProjection(
  requestedLayers: readonly string[],
  projection: PropSphereViewMode,
): string[] {
  return requestedLayers.filter(
    (layer) => !getLayerAvailability(layer, projection).available,
  );
}

/**
 * Pick the projection that can draw every requested hero layer.
 * The operator's preferred projection wins when it can draw the whole set;
 * otherwise globe, then azimuthal. `forcedBy` is the subset that the
 * preferred projection cannot draw (empty when preferred already works).
 */
export function resolveHeroProjection(
  requestedLayers: readonly string[],
  preferredProjection: PropSphereViewMode,
): HeroProjectionResolution {
  const forcedBy = layersBlockingProjection(
    requestedLayers,
    preferredProjection,
  );
  if (forcedBy.length === 0) {
    return { projection: preferredProjection, forcedBy };
  }

  const projection =
    HERO_PROJECTION_FALLBACKS.find(
      (candidate) =>
        candidate !== preferredProjection &&
        layersBlockingProjection(requestedLayers, candidate).length === 0,
    ) ?? preferredProjection;

  return { projection, forcedBy };
}

function projectionPhrase(mode: PropSphereViewMode): string {
  if (mode === "globe") return "3D globe";
  if (mode === "flat") return "the flat map";
  return "azimuthal view";
}

function formatLayerList(
  layers: readonly string[],
  labelFor: (layer: string) => string,
): string {
  const names = layers.map(labelFor);
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * One-line chip copy whenever something in the set cannot draw on the
 * preferred projection. Silent only when `forcedBy` is empty.
 */
export function formatHeroProjectionChip(
  resolution: HeroProjectionResolution,
  preferredProjection: PropSphereViewMode,
  labelFor: (layer: string) => string = (layer) => layer,
): string | undefined {
  if (resolution.forcedBy.length === 0) return undefined;
  const blockers = formatLayerList(resolution.forcedBy, labelFor);
  if (resolution.projection === preferredProjection) {
    return `${projectionPhrase(preferredProjection)} cannot draw ${blockers}`;
  }
  return (
    `Switched to ${projectionPhrase(resolution.projection)} because ` +
    `${projectionPhrase(preferredProjection)} cannot draw ${blockers}`
  );
}

/**
 * Caveat text for the standard `mapStyle` bucket's built-in row when the
 * current projection ignores the OSM-vs-CARTO tile-provider choice (B6 PR
 * #222 fix #1, corrected). Globe renders the chosen provider through
 * `selectTileProvider()`, so there is nothing to caveat there (`undefined`).
 * Flat's standard branch instead paints `getStandardMapCanvas`
 * (`FlatMapView.tsx`), and Azimuthal's standard branch paints a locally
 * generated texture (`AzimuthalRenderer.ts`) — both still render `mapStyle
 * "standard"`, just never through the chosen provider, so the style chooser
 * collapses OSM/CARTO into one enabled "Standard (built-in)" row there and
 * shows this text as its detail line rather than disabling anything. The
 * satellite bucket (Esri vs Mapbox) is out of scope here: Flat does render
 * it via a real tile layer, and whether Azimuthal's bundled Blue Marble
 * texture ever varies by provider is a separate question this fix does not
 * investigate.
 */
export function standardBasemapCaveat(
  viewMode: PropSphereViewMode,
): string | undefined {
  if (viewMode === "flat") return "Flat map draws its own standard basemap";
  if (viewMode === "azimuthal")
    return "Azimuthal draws its own standard basemap";
  return undefined;
}

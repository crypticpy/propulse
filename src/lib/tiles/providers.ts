import { cartoTileUrl } from "./carto";
import type {
  TileProviderConfig,
  TileProviderId,
  TileProviderRegistry,
} from "./types";

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

/** ESRI World Imagery — cloud-free satellite composite. Free, no API key. */
const esriWorldImagery: TileProviderConfig = {
  id: "esri-world",
  name: "Esri World Imagery",
  attribution:
    "Powered by Esri · Esri, Vantor, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, © OpenStreetMap contributors, TomTom, Garmin, FAO, NOAA, and the GIS User Community",
  attributionUrl:
    "https://developers.arcgis.com/documentation/mapping-and-location-services/deployment/attribution/",
  surfaceKind: "declouded-mosaic",
  coverage: "global",
  coverageNote: "Global mosaic; useful native detail varies by location",
  freshnessNote: "Composite imagery; acquisition date varies by location",
  nativeMaxZoom: 19,
  maxZoom: 19,
  tileSize: 256,
  requiresAuth: false,
  requiresPro: false,
  authentication: "none",
  retina: false,
  overzoom: "limited",
  cacheTtlSeconds: 86_400,
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

/** OpenStreetMap standard raster tiles. */
const osm: TileProviderConfig = {
  id: "osm",
  name: "OpenStreetMap",
  attribution: "\u00A9 OpenStreetMap contributors",
  attributionUrl: "https://www.openstreetmap.org/copyright",
  surfaceKind: "cartographic",
  coverage: "global",
  coverageNote: "Global community cartography",
  freshnessNote: "Continuously updated community map",
  nativeMaxZoom: 19,
  maxZoom: 19,
  tileSize: 256,
  requiresAuth: false,
  requiresPro: false,
  authentication: "none",
  retina: false,
  overzoom: "limited",
  cacheTtlSeconds: 86_400,
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};

/** CARTO Dark Matter — dark cartography for the regional explorer. */
const cartoDark: TileProviderConfig = {
  id: "carto-dark",
  name: "CARTO Dark Matter",
  attribution: "\u00A9 CARTO \u00A9 OpenStreetMap",
  attributionUrl: "https://carto.com/attributions",
  surfaceKind: "cartographic",
  coverage: "global",
  coverageNote: "Global dark cartography",
  freshnessNote: "Built from continuously updated OpenStreetMap data",
  nativeMaxZoom: 20,
  maxZoom: 20,
  tileSize: 512,
  requiresAuth: false,
  requiresPro: false,
  authentication: "none",
  retina: true,
  overzoom: "limited",
  cacheTtlSeconds: 86_400,
  url: cartoTileUrl("dark_all"),
};

/** Mapbox Satellite — Pro tier, proxied through edge function. */
const mapboxSatellite: TileProviderConfig = {
  id: "mapbox-satellite",
  name: "HD Satellite",
  attribution: "\u00A9 Mapbox \u00A9 OpenStreetMap \u00A9 Maxar",
  attributionUrl: "https://www.mapbox.com/about/maps/",
  surfaceKind: "declouded-mosaic",
  coverage: "global",
  coverageNote: "Global mosaic; sub-meter detail is regional",
  freshnessNote: "Composite imagery; acquisition date varies by location",
  nativeMaxZoom: 22,
  maxZoom: 22,
  tileSize: 512,
  requiresAuth: true,
  requiresPro: true,
  authentication: "bearer",
  retina: true,
  overzoom: "limited",
  fallbackProviderId: "esri-world",
  cacheTtlSeconds: 86_400,
  url: "/api/tiles/proxy?provider=mapbox&z={z}&x={x}&y={y}",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All known tile providers keyed by ID. */
export const ALL_PROVIDERS: Record<TileProviderId, TileProviderConfig> = {
  "esri-world": esriWorldImagery,
  osm: osm,
  "carto-dark": cartoDark,
  "mapbox-satellite": mapboxSatellite,
};

/** Which `mapStyle` bucket a provider id belongs to — the map style chooser
 * (HW-55) can only let a reader pick a provider that actually renders under
 * the two-value `mapStyle` the renderers already switch on. */
const SATELLITE_PROVIDER_IDS: ReadonlySet<TileProviderId> = new Set([
  "esri-world",
  "mapbox-satellite",
]);
const STANDARD_PROVIDER_IDS: ReadonlySet<TileProviderId> = new Set([
  "osm",
  "carto-dark",
]);

function providerMatchesStyle(
  id: TileProviderId,
  mapStyle: "satellite" | "standard",
): boolean {
  return mapStyle === "satellite"
    ? SATELLITE_PROVIDER_IDS.has(id)
    : STANDARD_PROVIDER_IDS.has(id);
}

/** Build a provider registry for the given subscription tier. */
export function getProviderRegistry(
  tier: "free" | "pro",
): TileProviderRegistry {
  return {
    satellite: tier === "pro" ? mapboxSatellite : esriWorldImagery,
    standard: osm,
  };
}

/**
 * Select the active tile provider based on map style and subscription tier.
 * A persisted `tileProviderId` (HW-55, `mapStore`) is honoured first — it is
 * what makes Esri/Mapbox and OSM/CARTO dark individually selectable instead
 * of the tier rule always picking the same one member of each style bucket.
 * It is ignored, falling through to the tier default, when it does not
 * belong to the requested `mapStyle` bucket (a stale choice from before a
 * style switch) or requires Pro and the tier is free (a downgrade or a
 * shared-view recipient without the plan) — both are recoverable
 * mismatches, not states the map should render broken or blank for.
 */
export function selectTileProvider(
  mapStyle: "satellite" | "standard",
  tier: "free" | "pro",
  tileProviderId?: TileProviderId | null,
): TileProviderConfig {
  if (tileProviderId && providerMatchesStyle(tileProviderId, mapStyle)) {
    const requested = ALL_PROVIDERS[tileProviderId];
    if (!requested.requiresPro || tier === "pro") return requested;
  }
  const registry = getProviderRegistry(tier);
  return mapStyle === "satellite" ? registry.satellite : registry.standard;
}

/**
 * Resolve a requested provider through its configured fallback exactly once.
 * Once both providers have failed, return null so callers settle on their
 * bundled static surface instead of oscillating between broken layers.
 */
export function selectAvailableTileProvider(
  requested: TileProviderConfig,
  failedProviderIds: ReadonlySet<string>,
): TileProviderConfig | null {
  if (!failedProviderIds.has(requested.id)) return requested;
  if (!requested.fallbackProviderId) return null;

  const fallback = ALL_PROVIDERS[requested.fallbackProviderId];
  return fallback && !failedProviderIds.has(fallback.id) ? fallback : null;
}

/** True when a provider is a cloud-minimized surface, not live weather. */
export function isDecloudedSurface(provider: TileProviderConfig): boolean {
  return provider.surfaceKind === "declouded-mosaic";
}

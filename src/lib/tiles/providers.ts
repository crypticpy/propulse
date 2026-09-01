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
  attribution: "Powered by Esri",
  attributionUrl: "https://www.esri.com/en-us/legal/terms/full-master-agreement",
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
  url: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
};

/** Mapbox Satellite — Pro tier, proxied through edge function. */
const mapboxSatellite: TileProviderConfig = {
  id: "mapbox-satellite",
  name: "HD Satellite",
  attribution: "\u00A9 Mapbox \u00A9 OpenStreetMap",
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

/** Build a provider registry for the given subscription tier. */
export function getProviderRegistry(
  tier: "free" | "pro",
): TileProviderRegistry {
  return {
    satellite: tier === "pro" ? mapboxSatellite : esriWorldImagery,
    standard: osm,
  };
}

/** Select the active tile provider based on map style and subscription tier. */
export function selectTileProvider(
  mapStyle: "satellite" | "standard",
  tier: "free" | "pro",
): TileProviderConfig {
  const registry = getProviderRegistry(tier);
  return mapStyle === "satellite" ? registry.satellite : registry.standard;
}

/** True when a provider is a cloud-minimized surface, not live weather. */
export function isDecloudedSurface(provider: TileProviderConfig): boolean {
  return provider.surfaceKind === "declouded-mosaic";
}

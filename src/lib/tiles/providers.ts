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
  name: "Satellite",
  attribution: "Powered by Esri",
  maxZoom: 19,
  tileSize: 256,
  requiresAuth: false,
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

/** OpenStreetMap standard raster tiles. */
const osm: TileProviderConfig = {
  id: "osm",
  name: "OpenStreetMap",
  attribution: "\u00A9 OpenStreetMap contributors",
  maxZoom: 19,
  tileSize: 256,
  requiresAuth: false,
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};

/** Mapbox Satellite — Pro tier, proxied through edge function. */
const mapboxSatellite: TileProviderConfig = {
  id: "mapbox-satellite",
  name: "HD Satellite",
  attribution: "\u00A9 Mapbox \u00A9 OpenStreetMap",
  maxZoom: 22,
  tileSize: 512,
  requiresAuth: true,
  url: "/api/tiles/proxy?provider=mapbox&z={z}&x={x}&y={y}",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All known tile providers keyed by ID. */
export const ALL_PROVIDERS: Record<TileProviderId, TileProviderConfig> = {
  "esri-world": esriWorldImagery,
  osm: osm,
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

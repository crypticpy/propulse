import type {
  TileProviderConfig,
  TileProviderId,
  TileProviderRegistry,
} from "./types";

// ---------------------------------------------------------------------------
// GIBS date helper
// ---------------------------------------------------------------------------

/** Yesterday's date in YYYY-MM-DD format (MODIS imagery has ~6hr delay). */
export function getGibsDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Build a GIBS MODIS True Color WMTS URL for yesterday's imagery. */
export function getGibsUrl(): string {
  const dateStr = getGibsDate();
  // WMTS REST uses {z}/{y}/{x} order — XYZTilesPlugin replaces tokens by name
  return (
    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" +
    "MODIS_Terra_CorrectedReflectance_TrueColor/default/" +
    `${dateStr}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
  );
}

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

/** NASA GIBS MODIS True Color (EPSG:3857). Free, no API key, daily imagery. */
const gibsModis: TileProviderConfig = {
  id: "gibs-modis",
  name: "NASA GIBS",
  attribution: "NASA EOSDIS GIBS",
  maxZoom: 9,
  tileSize: 256,
  requiresAuth: false,
  // URL is computed dynamically via getGibsUrl(); set at registry build time
  url: "",
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

/** ESRI World Imagery — Pro tier alternative. */
const esriWorld: TileProviderConfig = {
  id: "esri-world",
  name: "ESRI World Imagery",
  attribution: "Powered by Esri",
  maxZoom: 19,
  tileSize: 256,
  requiresAuth: true,
  url: "/api/tiles/proxy?provider=esri&z={z}&x={x}&y={y}",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All known tile providers keyed by ID. */
export const ALL_PROVIDERS: Record<TileProviderId, TileProviderConfig> = {
  "gibs-modis": { ...gibsModis, url: getGibsUrl() },
  osm: osm,
  "mapbox-satellite": mapboxSatellite,
  "esri-world": esriWorld,
};

/** Build a provider registry for the given subscription tier. */
export function getProviderRegistry(
  tier: "free" | "pro",
): TileProviderRegistry {
  return {
    satellite:
      tier === "pro" ? mapboxSatellite : { ...gibsModis, url: getGibsUrl() },
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

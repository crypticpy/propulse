/**
 * NASA GIBS WMTS tile URL builder for GOES satellite imagery.
 * Defaults to GOES-East ABI Band 13 Clean Infrared (works day and night).
 * No API key required. CORS-enabled.
 */

/** Available GOES imagery layers */
export type GOESLayer =
  | "GOES-East_ABI_Band13_Clean_Infrared"
  | "GOES-West_ABI_Band13_Clean_Infrared"
  | "GOES-East_ABI_GeoColor"
  | "GOES-West_ABI_GeoColor"
  | "GOES-East_ABI_Air_Mass";

/** Default layer (works day and night) */
const DEFAULT_LAYER: GOESLayer = "GOES-East_ABI_Band13_Clean_Infrared";

/**
 * GIBS TileMatrixSet identifier per layer. Most ABI layers publish at
 * GoogleMapsCompatible_Level6; GeoColor publishes at a finer native
 * resolution (Level7). Requesting the wrong matrix set returns a 400
 * InvalidParameterValue error — verified live against GIBS'
 * WMTSCapabilities.xml on 2026-07-19.
 */
const GIBS_TILE_MATRIX_SET: Record<GOESLayer, string> = {
  "GOES-East_ABI_Band13_Clean_Infrared": "GoogleMapsCompatible_Level6",
  "GOES-West_ABI_Band13_Clean_Infrared": "GoogleMapsCompatible_Level6",
  "GOES-East_ABI_GeoColor": "GoogleMapsCompatible_Level7",
  "GOES-West_ABI_GeoColor": "GoogleMapsCompatible_Level7",
  "GOES-East_ABI_Air_Mass": "GoogleMapsCompatible_Level6",
};

/** NASA GIBS TileMatrixSetLimits for the GOES-East layer at matrix 2. */
export const GOES_EAST_Z2_TILE_LIMITS = {
  minX: 0,
  maxX: 2,
  minY: 0,
  maxY: 3,
} as const;

/**
 * Build a GIBS WMTS tile URL template for MapLibre GL.
 * Returns a URL with {z}/{y}/{x} placeholders.
 */
export function getGIBSTileUrl(
  layer: GOESLayer = DEFAULT_LAYER,
  time?: string,
): string {
  // This is a subdaily layer. NASA's `default` slot tracks the latest valid
  // 10-minute image and avoids guessing a timestamp that may not exist.
  const timeSlot = time ?? "default";
  const matrixSet = GIBS_TILE_MATRIX_SET[layer];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${timeSlot}/${matrixSet}/{z}/{y}/{x}.png`;
}

/**
 * Return the dynamic latest slot used by subdaily GIBS imagery.
 */
export function getLatestGIBSDate(): string {
  return "default";
}

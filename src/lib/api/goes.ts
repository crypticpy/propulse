/**
 * NASA GIBS WMTS tile URL builder for GOES satellite imagery.
 * Uses GOES-East ABI Band 13 Clean Infrared (works day and night).
 * No API key required. CORS-enabled.
 */

/** Available GOES imagery layers */
export type GOESLayer =
  | "GOES-East_ABI_Band13_Clean_Infrared"
  | "MODIS_Terra_CorrectedReflectance_TrueColor";

/** Default layer (works day and night) */
const DEFAULT_LAYER: GOESLayer = "GOES-East_ABI_Band13_Clean_Infrared";

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
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${timeSlot}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`;
}

/**
 * Return the dynamic latest slot used by subdaily GIBS imagery.
 */
export function getLatestGIBSDate(): string {
  return "default";
}

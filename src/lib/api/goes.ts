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

/**
 * Build a GIBS WMTS tile URL template for MapLibre GL.
 * Returns a URL with {z}/{y}/{x} placeholders.
 */
export function getGIBSTileUrl(
  layer: GOESLayer = DEFAULT_LAYER,
  date?: string, // YYYY-MM-DD format, defaults to today
): string {
  const dateStr = date ?? new Date().toISOString().split("T")[0];
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${dateStr}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`;
}

/**
 * Fetch the latest available date for a GIBS layer.
 * GIBS imagery is typically available with a ~3 hour delay.
 * Returns today's date as GIBS handles missing dates gracefully.
 */
export function getLatestGIBSDate(): string {
  // GIBS uses UTC dates. Use yesterday if before 06:00 UTC (imagery delay)
  const now = new Date();
  if (now.getUTCHours() < 6) {
    now.setUTCDate(now.getUTCDate() - 1);
  }
  return now.toISOString().split("T")[0];
}

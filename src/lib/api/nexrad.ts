/**
 * IEM NEXRAD Weather Radar API client
 * Iowa Environmental Mesonet — free NEXRAD Level 3 composite tiles
 * 1km resolution, 5-minute updates, standard XYZ/TMS tiles
 *
 * Product: nexrad-n0q (base reflectivity, 0.5° tilt)
 * Time offsets: latest, -5m, -10m, ..., -55m (12 frames = 1 hour)
 */

/** Available IEM tile hosts for DNS load balancing */
const IEM_HOSTS = [
  "https://mesonet1.agron.iastate.edu",
  "https://mesonet2.agron.iastate.edu",
  "https://mesonet3.agron.iastate.edu",
] as const;

/** NEXRAD time-offset product names in chronological order (oldest → newest) */
export const NEXRAD_FRAME_PRODUCTS = [
  "nexrad-n0q-m55m",
  "nexrad-n0q-m50m",
  "nexrad-n0q-m45m",
  "nexrad-n0q-m40m",
  "nexrad-n0q-m35m",
  "nexrad-n0q-m30m",
  "nexrad-n0q-m25m",
  "nexrad-n0q-m20m",
  "nexrad-n0q-m15m",
  "nexrad-n0q-m10m",
  "nexrad-n0q-m05m",
  "nexrad-n0q", // latest (current)
] as const;

export type NexradProduct = (typeof NEXRAD_FRAME_PRODUCTS)[number];

/** Number of animation frames available */
export const NEXRAD_FRAME_COUNT = NEXRAD_FRAME_PRODUCTS.length; // 12

/**
 * Get the tile URL for a NEXRAD product at given tile coordinates.
 * Uses round-robin DNS balancing across IEM hosts.
 */
export function getNexradTileUrl(
  product: NexradProduct,
  z: number,
  x: number,
  y: number,
): string {
  // Distribute tile requests across hosts based on (x + y) for cache locality
  const hostIdx = (x + y) % IEM_HOSTS.length;
  const host = IEM_HOSTS[hostIdx];
  return `${host}/cache/tile.py/1.0.0/${product}/{z}/{x}/{y}.png`
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/**
 * Get the tile URL template for a NEXRAD product (for MapLibre raster sources).
 * Contains {z}/{x}/{y} placeholders.
 */
export function getNexradTileTemplate(product: NexradProduct): string {
  // Use a single host for the template — MapLibre will cache per-URL
  return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/${product}/{z}/{x}/{y}.png`;
}

/**
 * US bounding box for NEXRAD 3D tile loading (contiguous US + buffer).
 * At zoom 5 (32 tiles per axis):
 * - CONUS: lat 24-50°N, lon 125-66°W → x: 3-10, y: 9-15
 * - Includes Alaska/Hawaii buffer
 */
export const NEXRAD_US_BOUNDS_Z5 = {
  xMin: 3,
  xMax: 10,
  yMin: 9,
  yMax: 15,
} as const;

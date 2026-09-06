export type CartoRasterStyle =
  | "dark_all"
  | "dark_only_labels"
  | "light_only_labels";

/** CARTO basemap-only key is intentionally visible in direct browser requests. */
export function cartoTileUrl(style: CartoRasterStyle): string {
  const url = `https://basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png`;
  const key = import.meta.env.VITE_CARTO_BASEMAPS_API_KEY;
  return key ? `${url}?key=${encodeURIComponent(key)}` : url;
}

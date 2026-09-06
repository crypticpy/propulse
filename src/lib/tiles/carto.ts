export type CartoRasterStyle =
  | "dark_all"
  | "dark_only_labels"
  | "light_only_labels";

/** The server supplies the CARTO key and preserves the existing @2x PNG tiles. */
export function cartoTileUrl(style: CartoRasterStyle): string {
  return `/api/tiles/carto?style=${style}&z={z}&x={x}&y={y}`;
}

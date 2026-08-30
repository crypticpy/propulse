/**
 * Web Mercator → equirectangular resampling for globe overlay textures.
 *
 * XYZ tile services (RainViewer, IEM NEXRAD, NASA GIBS EPSG:3857) hand back
 * Web Mercator imagery. A full-world composite of those tiles spans
 * lon −180..180 left→right but lat ±85.05° top→bottom on a *Mercator* axis,
 * while a sphere's default UVs (and the equirect basemap) are linear in
 * latitude. Draped directly, the imagery lands at the right longitude and the
 * wrong latitude — mid-latitudes drift poleward by several degrees.
 */

/** Latitude at which a square Web Mercator world image ends. */
export const MAX_MERCATOR_LAT = 85.05112878;

/** Fractional row of `lat` (degrees) in a full-world Mercator image `height` rows tall. */
export function mercatorRowForLat(lat: number, height: number): number {
  const phi = (lat * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + phi / 2));
  return ((1 - y / Math.PI) / 2) * height;
}

/** Latitude (degrees) at the top edge of equirect `row` in an image `height` rows tall. */
export function latForEquirectRow(row: number, height: number): number {
  return 90 - (row / height) * 180;
}

/**
 * Draw a full-world Web Mercator canvas onto `ctx` as an equirectangular
 * image of `dstWidth × dstHeight`, one row at a time so the browser's image
 * filtering averages the source strip each row covers. Rows poleward of
 * ±85.05° have no Mercator source and are left untouched (transparent).
 */
export function drawMercatorAsEquirect(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  dstWidth: number,
  dstHeight: number,
): void {
  const srcWidth = src.width;
  const srcHeight = src.height;
  for (let row = 0; row < dstHeight; row++) {
    const latTop = Math.min(latForEquirectRow(row, dstHeight), MAX_MERCATOR_LAT);
    const latBottom = Math.max(
      latForEquirectRow(row + 1, dstHeight),
      -MAX_MERCATOR_LAT,
    );
    if (latTop <= latBottom) continue;
    const y0 = mercatorRowForLat(latTop, srcHeight);
    const y1 = mercatorRowForLat(latBottom, srcHeight);
    ctx.drawImage(src, 0, y0, srcWidth, y1 - y0, 0, row, dstWidth, 1);
  }
}

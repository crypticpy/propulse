import type { TileProviderConfig } from "./types";

/**
 * FlatTileLayer — composites XYZ raster tiles onto the 2D equirectangular map.
 *
 * Web Mercator tiles are linear in longitude but nonlinear in latitude, so
 * each tile is drawn as a stack of horizontal strips whose destination
 * heights follow the inverse-Mercator latitude of the strip edges. Coverage
 * is limited to the Mercator domain (±85.05°); the static base image remains
 * visible at the poles and while tiles load.
 */

export interface FlatTileViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderWidth: number;
  renderHeight: number;
  devicePixelRatio: number;
}

export interface FlatTileLayer {
  /** Draw visible tiles in map space; ctx must already carry the zoom transform. */
  draw(ctx: CanvasRenderingContext2D, view: FlatTileViewState): void;
  dispose(): void;
}

interface TileEntry {
  img: HTMLImageElement;
  status: "loading" | "ready" | "error";
}

const MAX_CACHED_TILES = 320;
/** The static 4096px base image is ~z4 quality; tiles only add detail beyond it. */
const MIN_DRAW_ZOOM = 5;
/** How many coarser zoom levels to paint beneath the exact level while it loads. */
const FALLBACK_ZOOM_STEPS = 2;
const MERCATOR_MAX_LAT = 85.05112878;

/** Latitude (deg) → normalized Mercator y in [0, 1], 0 at the north edge. */
function mercatorNormY(lat: number): number {
  const clamped = Math.min(Math.max(lat, -MERCATOR_MAX_LAT), MERCATOR_MAX_LAT);
  const phi = (clamped * Math.PI) / 180;
  return (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2;
}

/** Normalized Mercator y in [0, 1] → latitude (deg). */
function mercatorNormYToLat(ny: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * ny))) * 180) / Math.PI;
}

export function createFlatTileLayer(
  provider: TileProviderConfig,
  onTileLoaded: () => void,
): FlatTileLayer {
  // Insertion-ordered Map doubles as the LRU: hits re-insert, evictions pop
  // from the front, skipping in-flight requests.
  const cache = new Map<string, TileEntry>();
  let disposed = false;

  function requestTile(key: string, z: number, x: number, y: number): void {
    const img = new Image();
    // Esri/OSM send ACAO:*; without this the canvas would be tainted.
    img.crossOrigin = "anonymous";
    const entry: TileEntry = { img, status: "loading" };
    cache.set(key, entry);
    if (cache.size > MAX_CACHED_TILES) {
      for (const [oldKey, old] of cache) {
        if (cache.size <= MAX_CACHED_TILES) break;
        if (old.status !== "loading") cache.delete(oldKey);
      }
    }
    img.onload = () => {
      entry.status = "ready";
      if (!disposed) onTileLoaded();
    };
    img.onerror = () => {
      entry.status = "error";
    };
    img.src = provider.url
      .replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));
  }

  function drawTile(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    z: number,
    x: number,
    y: number,
    view: FlatTileViewState,
  ): void {
    const { renderWidth, renderHeight, scale } = view;
    const n = 1 << z;
    const destX = (x / n) * renderWidth;
    const destW = renderWidth / n;
    const srcW = img.naturalWidth || provider.tileSize;
    const srcH = img.naturalHeight || provider.tileSize;
    // More strips at low zoom, where one tile spans a large latitude range
    // and the Mercator→equirectangular warp is strongest.
    const strips = z <= 3 ? 32 : z <= 5 ? 16 : z <= 7 ? 8 : 4;
    // Half a CSS px of overlap hides antialiasing seams between strips.
    const overlap = 0.5 / scale;
    for (let i = 0; i < strips; i++) {
      const latTop = mercatorNormYToLat((y + i / strips) / n);
      const latBottom = mercatorNormYToLat((y + (i + 1) / strips) / n);
      const destY = ((90 - latTop) / 180) * renderHeight;
      const destH = ((latTop - latBottom) / 180) * renderHeight;
      ctx.drawImage(
        img,
        0,
        (i / strips) * srcH,
        srcW,
        srcH / strips,
        destX,
        destY,
        destW,
        destH + overlap,
      );
    }
  }

  function draw(ctx: CanvasRenderingContext2D, view: FlatTileViewState): void {
    if (disposed) {
      return;
    }
    const { scale, offsetX, offsetY, renderWidth, renderHeight } = view;
    const worldDevicePx = renderWidth * scale * view.devicePixelRatio;
    const idealZoom = Math.round(Math.log2(worldDevicePx / provider.tileSize));
    if (idealZoom < MIN_DRAW_ZOOM) {
      return; // base image is sharp enough at this zoom
    }
    const z = Math.min(idealZoom, provider.maxZoom);

    // Visible window in map space (CSS px, before the zoom transform).
    const left = Math.max(0, -offsetX / scale);
    const right = Math.min(renderWidth, (renderWidth - offsetX) / scale);
    const top = Math.max(0, -offsetY / scale);
    const bottom = Math.min(renderHeight, (renderHeight - offsetY) / scale);
    if (right <= left || bottom <= top) {
      return;
    }

    const lonLeft = (left / renderWidth) * 360 - 180;
    const lonRight = (right / renderWidth) * 360 - 180;
    const latTop = 90 - (top / renderHeight) * 180;
    const latBottom = 90 - (bottom / renderHeight) * 180;
    if (latTop <= -MERCATOR_MAX_LAT || latBottom >= MERCATOR_MAX_LAT) {
      return; // window is entirely polar — outside tile coverage
    }

    // Coarse-to-fine: paint any cached ancestor tiles first so zooming shows
    // upscaled imagery instead of holes while the exact level loads.
    for (let level = Math.max(2, z - FALLBACK_ZOOM_STEPS); level <= z; level++) {
      const n = 1 << level;
      const xStart = Math.max(0, Math.floor(((lonLeft + 180) / 360) * n));
      const xEnd = Math.min(n - 1, Math.floor(((lonRight + 180) / 360) * n));
      const yStart = Math.max(0, Math.floor(mercatorNormY(latTop) * n));
      const yEnd = Math.min(n - 1, Math.floor(mercatorNormY(latBottom) * n));
      for (let ty = yStart; ty <= yEnd; ty++) {
        for (let tx = xStart; tx <= xEnd; tx++) {
          const key = `${level}/${tx}/${ty}`;
          const entry = cache.get(key);
          if (entry) {
            if (entry.status === "ready") {
              cache.delete(key);
              cache.set(key, entry); // refresh LRU position
              drawTile(ctx, entry.img, level, tx, ty, view);
            }
          } else if (level === z) {
            requestTile(key, level, tx, ty);
          }
        }
      }
    }
  }

  return {
    draw,
    dispose() {
      disposed = true;
      for (const entry of cache.values()) {
        entry.img.onload = null;
        entry.img.onerror = null;
      }
      cache.clear();
    },
  };
}

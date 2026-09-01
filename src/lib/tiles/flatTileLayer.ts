import type { TileProviderConfig } from "./types";
import { authHeaders } from "@/lib/api/authFetch";

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

export interface FlatTileLayerOptions {
  maxCachedTiles?: number;
  tileZoomBias?: number;
  maxConcurrentRequests?: number;
  prefetchRadius?: number;
  settleDelayMs?: number;
  onProviderUnavailable?: () => void;
}

interface TileEntry {
  img: HTMLImageElement;
  status: "queued" | "loading" | "ready" | "error";
  z: number;
  x: number;
  y: number;
  controller?: AbortController;
  objectUrl?: string;
}

const DEFAULT_MAX_CACHED_TILES = 320;
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
  options: FlatTileLayerOptions = {},
): FlatTileLayer {
  // Insertion-ordered Map doubles as the LRU: hits re-insert, evictions pop
  // from the front, skipping in-flight requests.
  const cache = new Map<string, TileEntry>();
  const maxCachedTiles =
    options.maxCachedTiles ?? DEFAULT_MAX_CACHED_TILES;
  const tileZoomBias = options.tileZoomBias ?? 0;
  const maxConcurrentRequests = Math.max(
    1,
    options.maxConcurrentRequests ?? 12,
  );
  const prefetchRadius = Math.max(0, Math.floor(options.prefetchRadius ?? 0));
  const settleDelayMs = Math.max(0, options.settleDelayMs ?? 0);
  let disposed = false;
  let consecutiveErrors = 0;
  let providerFailureReported = false;
  let activeRequests = 0;
  let requestQueue: string[] = [];
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let lastViewSignature = "";

  function releaseEntry(entry: TileEntry): void {
    const wasLoading = entry.status === "loading";
    entry.controller?.abort();
    entry.img.onload = null;
    entry.img.onerror = null;
    if (wasLoading) entry.img.src = "";
    if (entry.objectUrl) {
      URL.revokeObjectURL(entry.objectUrl);
      entry.objectUrl = undefined;
    }
    if (wasLoading) activeRequests = Math.max(0, activeRequests - 1);
  }

  function markError(entry: TileEntry): void {
    if (disposed) return;
    const wasLoading = entry.status === "loading";
    entry.status = "error";
    entry.controller = undefined;
    if (entry.objectUrl) {
      URL.revokeObjectURL(entry.objectUrl);
      entry.objectUrl = undefined;
    }
    consecutiveErrors += 1;
    if (consecutiveErrors >= 3 && !providerFailureReported) {
      providerFailureReported = true;
      options.onProviderUnavailable?.();
    }
    if (wasLoading) activeRequests = Math.max(0, activeRequests - 1);
    pumpQueue();
  }

  async function loadAuthenticatedTile(
    entry: TileEntry,
    tileUrl: string,
  ): Promise<void> {
    const headers = await authHeaders({
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    });
    if (disposed || entry.controller?.signal.aborted) return;

    const response = await fetch(tileUrl, {
      headers,
      signal: entry.controller?.signal,
    });
    if (!response.ok) {
      throw new Error(`Tile request failed with ${response.status}`);
    }
    const blob = await response.blob();
    if (disposed || entry.controller?.signal.aborted) return;
    entry.objectUrl = URL.createObjectURL(blob);
    entry.img.src = entry.objectUrl;
  }

  function startTileRequest(entry: TileEntry): void {
    if (disposed || entry.status !== "queued") return;

    const { img, z, x, y } = entry;
    entry.status = "loading";
    activeRequests += 1;
    if (provider.authentication === "bearer") {
      entry.controller = new AbortController();
    }

    img.onload = () => {
      if (disposed || entry.status !== "loading") return;
      entry.status = "ready";
      entry.controller = undefined;
      activeRequests = Math.max(0, activeRequests - 1);
      consecutiveErrors = 0;
      if (entry.objectUrl) {
        URL.revokeObjectURL(entry.objectUrl);
        entry.objectUrl = undefined;
      }
      onTileLoaded();
      pumpQueue();
    };
    img.onerror = () => markError(entry);
    const tileUrl = provider.url
      .replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));

    if (provider.authentication === "bearer") {
      void loadAuthenticatedTile(entry, tileUrl).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (disposed || entry.status !== "loading") return;
        markError(entry);
      });
    } else {
      // Esri/OSM send ACAO:*; without this the canvas would be tainted.
      img.crossOrigin = "anonymous";
      img.src = tileUrl;
    }
  }

  function pumpQueue(): void {
    if (disposed || settleTimer) return;
    while (activeRequests < maxConcurrentRequests && requestQueue.length > 0) {
      const key = requestQueue.shift()!;
      const entry = cache.get(key);
      if (!entry || entry.status !== "queued") continue;
      startTileRequest(entry);
    }
  }

  function queueTile(key: string, z: number, x: number, y: number): void {
    const img = new Image();
    const entry: TileEntry = {
      img,
      status: "queued",
      z,
      x,
      y,
    };
    cache.set(key, entry);
    requestQueue.push(key);
    if (cache.size > maxCachedTiles) {
      for (const [oldKey, old] of cache) {
        if (cache.size <= maxCachedTiles) break;
        if (old.status !== "loading") {
          releaseEntry(old);
          cache.delete(oldKey);
        }
      }
    }
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
    const idealZoom =
      Math.round(Math.log2(worldDevicePx / provider.tileSize)) + tileZoomBias;
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

    const exactN = 1 << z;
    const exactXStart = Math.max(
      0,
      Math.floor(((lonLeft + 180) / 360) * exactN),
    );
    const exactXEnd = Math.min(
      exactN - 1,
      Math.floor(((lonRight + 180) / 360) * exactN),
    );
    const exactYStart = Math.max(0, Math.floor(mercatorNormY(latTop) * exactN));
    const exactYEnd = Math.min(
      exactN - 1,
      Math.floor(mercatorNormY(latBottom) * exactN),
    );
    const requestXStart = Math.max(0, exactXStart - prefetchRadius);
    const requestXEnd = Math.min(exactN - 1, exactXEnd + prefetchRadius);
    const requestYStart = Math.max(0, exactYStart - prefetchRadius);
    const requestYEnd = Math.min(exactN - 1, exactYEnd + prefetchRadius);
    const viewSignature = `${z}/${requestXStart}-${requestXEnd}/${requestYStart}-${requestYEnd}`;
    const viewChanged = viewSignature !== lastViewSignature;
    lastViewSignature = viewSignature;

    // Coarse-to-fine: paint any cached ancestor tiles first so zooming shows
    // upscaled imagery instead of holes while the exact level loads.
    const visibleTileKeys = new Set<string>();
    for (let level = Math.max(2, z - FALLBACK_ZOOM_STEPS); level <= z; level++) {
      const n = 1 << level;
      const xStart =
        level === z
          ? requestXStart
          : Math.max(0, Math.floor(((lonLeft + 180) / 360) * n));
      const xEnd =
        level === z
          ? requestXEnd
          : Math.min(n - 1, Math.floor(((lonRight + 180) / 360) * n));
      const yStart =
        level === z
          ? requestYStart
          : Math.max(0, Math.floor(mercatorNormY(latTop) * n));
      const yEnd =
        level === z
          ? requestYEnd
          : Math.min(n - 1, Math.floor(mercatorNormY(latBottom) * n));
      for (let ty = yStart; ty <= yEnd; ty++) {
        for (let tx = xStart; tx <= xEnd; tx++) {
          const key = `${level}/${tx}/${ty}`;
          visibleTileKeys.add(key);
          const entry = cache.get(key);
          if (entry) {
            if (entry.status === "ready") {
              cache.delete(key);
              cache.set(key, entry); // refresh LRU position
              drawTile(ctx, entry.img, level, tx, ty, view);
            }
          } else if (level === z) {
            queueTile(key, level, tx, ty);
          }
        }
      }
    }

    // Fast pans/zooms should not spend bandwidth finishing tiles that are no
    // longer visible. Ready ancestors remain cached for seamless fallback.
    for (const [key, entry] of cache) {
      if (
        (entry.status === "loading" || entry.status === "queued") &&
        !visibleTileKeys.has(key)
      ) {
        releaseEntry(entry);
        cache.delete(key);
      }
    }

    if (viewChanged && settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = undefined;
    }
    if (viewChanged && settleDelayMs > 0) {
      settleTimer = setTimeout(() => {
        settleTimer = undefined;
        pumpQueue();
      }, settleDelayMs);
    } else {
      pumpQueue();
    }
  }

  return {
    draw,
    dispose() {
      disposed = true;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = undefined;
      for (const entry of cache.values()) {
        releaseEntry(entry);
      }
      cache.clear();
      requestQueue = [];
    },
  };
}

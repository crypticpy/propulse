import type { TileProviderConfig } from "./types";
import { authHeaders } from "@/lib/api/authFetch";
import {
  recordFlatMapTileRange,
  shouldDrawFlatMapTileBounds,
} from "@/lib/map/flatMapDiagnostics";

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
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio: number;
  /** Suppresses the idle prefetch ring while the operator pans or zooms. */
  navigationActive?: boolean;
}

export interface FlatTileLayer {
  /**
   * Draw visible tiles in map space; ctx must already carry the zoom transform.
   * Returns true only when at least one provider tile contributed pixels.
   */
  draw(ctx: CanvasRenderingContext2D, view: FlatTileViewState): boolean;
  dispose(): void;
}

export interface FlatTileLayerOptions {
  maxCachedTiles?: number;
  tileZoomBias?: number;
  maxConcurrentRequests?: number;
  prefetchRadius?: number;
  settleDelayMs?: number;
  onProviderUnavailable?: () => void;
  /** Test seam for coalescing tile completions without depending on a real RAF. */
  scheduleFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

interface TileEntry {
  img: HTMLImageElement;
  status: "queued" | "loading" | "ready" | "error";
  z: number;
  x: number;
  y: number;
  controller?: AbortController;
  objectUrl?: string;
  projected?: HTMLCanvasElement;
}

const DEFAULT_MAX_CACHED_TILES = 320;
/** Compare source pixels, since 256px and 512px providers use different zooms. */
const BASE_WORLD_PIXELS = 4096;
/** How many coarser zoom levels to paint beneath the exact level while it loads. */
const FALLBACK_ZOOM_STEPS = 2;
const MERCATOR_MAX_LAT = 85.05112878;

export interface FlatTileWindow {
  zoom: number;
  visible: { xStart: number; xEnd: number; yStart: number; yEnd: number };
  requested: { xStart: number; xEnd: number; yStart: number; yEnd: number };
  mapBounds: { left: number; right: number; top: number; bottom: number };
  geoBounds: {
    lonLeft: number;
    lonRight: number;
    latTop: number;
    latBottom: number;
  };
}

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

/** Resolve the exact visible XYZ window and its optional, bounded idle ring. */
export function getFlatTileWindow(
  provider: TileProviderConfig,
  view: FlatTileViewState,
  tileZoomBias = 0,
  prefetchRadius = 0,
): FlatTileWindow | null {
  const { scale, offsetX, offsetY, renderWidth, renderHeight } = view;
  const worldDevicePx = renderWidth * scale * view.devicePixelRatio;
  const idealZoom =
    Math.ceil(Math.log2(worldDevicePx / provider.tileSize)) + tileZoomBias;
  if (worldDevicePx <= BASE_WORLD_PIXELS && tileZoomBias <= 0) return null;

  const left = Math.max(0, -offsetX / scale);
  const right = Math.min(
    renderWidth,
    ((view.viewportWidth ?? renderWidth) - offsetX) / scale,
  );
  const top = Math.max(0, -offsetY / scale);
  const bottom = Math.min(
    renderHeight,
    ((view.viewportHeight ?? renderHeight) - offsetY) / scale,
  );
  if (right <= left || bottom <= top) return null;

  const lonLeft = (left / renderWidth) * 360 - 180;
  const lonRight = (right / renderWidth) * 360 - 180;
  const latTop = 90 - (top / renderHeight) * 180;
  const latBottom = 90 - (bottom / renderHeight) * 180;
  if (latTop <= -MERCATOR_MAX_LAT || latBottom >= MERCATOR_MAX_LAT) {
    return null;
  }

  const zoom = Math.min(idealZoom, provider.maxZoom);
  const n = 1 << zoom;
  const visible = {
    xStart: Math.max(0, Math.floor(((lonLeft + 180) / 360) * n)),
    xEnd: Math.min(n - 1, Math.floor(((lonRight + 180) / 360) * n)),
    yStart: Math.max(0, Math.floor(mercatorNormY(latTop) * n)),
    yEnd: Math.min(n - 1, Math.floor(mercatorNormY(latBottom) * n)),
  };
  const ring = Math.max(
    0,
    Math.floor(view.navigationActive ? 0 : prefetchRadius),
  );

  return {
    zoom,
    visible,
    requested: {
      xStart: Math.max(0, visible.xStart - ring),
      xEnd: Math.min(n - 1, visible.xEnd + ring),
      yStart: Math.max(0, visible.yStart - ring),
      yEnd: Math.min(n - 1, visible.yEnd + ring),
    },
    mapBounds: { left, right, top, bottom },
    geoBounds: { lonLeft, lonRight, latTop, latBottom },
  };
}

export function createFlatTileLayer(
  provider: TileProviderConfig,
  onTileLoaded: () => void,
  options: FlatTileLayerOptions = {},
): FlatTileLayer {
  // Insertion-ordered Map doubles as the LRU: hits re-insert, evictions pop
  // from the front, skipping in-flight requests.
  const cache = new Map<string, TileEntry>();
  const maxCachedTiles = options.maxCachedTiles ?? DEFAULT_MAX_CACHED_TILES;
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
  let completionFrame: number | undefined;
  const scheduleFrame =
    options.scheduleFrame ??
    ((callback: FrameRequestCallback) => requestAnimationFrame(callback));
  const cancelFrame =
    options.cancelFrame ?? ((handle: number) => cancelAnimationFrame(handle));

  // A provider can decode many tiles in the same browser frame. React only
  // needs one retained-basemap invalidation for that batch.
  function notifyTileCompletion(): void {
    if (disposed || completionFrame !== undefined) return;
    completionFrame = scheduleFrame(() => {
      completionFrame = undefined;
      if (!disposed) onTileLoaded();
    });
  }

  function releaseEntry(entry: TileEntry): void {
    const wasLoading = entry.status === "loading";
    entry.controller?.abort();
    entry.img.onload = null;
    entry.img.onerror = null;
    if (wasLoading) entry.img.src = "";
    if (entry.projected) {
      entry.projected.width = 0;
      entry.projected.height = 0;
      entry.projected = undefined;
    }
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
      notifyTileCompletion();
      pumpQueue();
    };
    img.onerror = () => markError(entry);
    const tileUrl = provider.url
      .replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));

    if (provider.authentication === "bearer") {
      void loadAuthenticatedTile(entry, tileUrl).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
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
    entry: TileEntry,
    z: number,
    x: number,
    y: number,
    view: FlatTileViewState,
  ): void {
    const { renderWidth, renderHeight, scale } = view;
    const { img } = entry;
    const n = 1 << z;
    const destX = (x / n) * renderWidth;
    const destW = renderWidth / n;
    const srcW = img.naturalWidth || provider.tileSize;
    const srcH = img.naturalHeight || provider.tileSize;
    const north = mercatorNormYToLat(y / n);
    const south = mercatorNormYToLat((y + 1) / n);
    const destY = ((90 - north) / 180) * renderHeight;
    const destH = ((north - south) / 180) * renderHeight;
    // Warp once per cached tile, at its source resolution. Repainting a view
    // then takes one blit per tile instead of 4–32 strip draws on every frame.
    if (!entry.projected) {
      const projected = document.createElement("canvas");
      projected.width = srcW;
      projected.height = Math.max(
        1,
        Math.ceil((srcW * (north - south) * n) / 360),
      );
      const projection = projected.getContext("2d");
      if (projection) {
        projection.imageSmoothingEnabled = true;
        projection.imageSmoothingQuality = "high";
        const strips = z <= 3 ? 64 : z <= 5 ? 32 : z <= 7 ? 16 : 8;
        for (let i = 0; i < strips; i++) {
          const top = mercatorNormYToLat((y + i / strips) / n);
          const bottom = mercatorNormYToLat((y + (i + 1) / strips) / n);
          const py = ((north - top) / (north - south)) * projected.height;
          const ph = ((top - bottom) / (north - south)) * projected.height;
          projection.drawImage(
            img,
            0,
            (i / strips) * srcH,
            srcW,
            srcH / strips,
            0,
            py,
            projected.width,
            ph + 0.5,
          );
        }
        entry.projected = projected;
      }
    }
    const surface = entry.projected ?? img;
    ctx.drawImage(
      surface,
      0,
      0,
      entry.projected?.width ?? srcW,
      entry.projected?.height ?? srcH,
      destX,
      destY,
      destW + 0.25 / scale,
      destH + 0.25 / scale,
    );
  }

  function draw(
    ctx: CanvasRenderingContext2D,
    view: FlatTileViewState,
  ): boolean {
    if (disposed) {
      return false;
    }
    const { scale, renderWidth, renderHeight } = view;
    const window = getFlatTileWindow(
      provider,
      view,
      tileZoomBias,
      prefetchRadius,
    );
    if (!window) {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = undefined;
      for (const [key, entry] of cache) {
        if (entry.status === "loading" || entry.status === "queued") {
          releaseEntry(entry);
          cache.delete(key);
        }
      }
      requestQueue = [];
      lastViewSignature = "";
      return false;
    }

    const { zoom: z, visible, requested, mapBounds, geoBounds } = window;
    const { left, right, top, bottom } = mapBounds;
    const { lonLeft, lonRight, latTop, latBottom } = geoBounds;
    const requestXStart = requested.xStart;
    const requestXEnd = requested.xEnd;
    const requestYStart = requested.yStart;
    const requestYEnd = requested.yEnd;
    const viewSignature = `${z}/${requestXStart}-${requestXEnd}/${requestYStart}-${requestYEnd}`;
    const viewChanged = viewSignature !== lastViewSignature;
    lastViewSignature = viewSignature;

    recordFlatMapTileRange({
      zoom: z,
      visible,
      requested,
      navigationActive: view.navigationActive === true,
    });

    // Coarse-to-fine: paint any cached ancestor tiles first so zooming shows
    // upscaled imagery instead of holes while the exact level loads.
    const retainedRequestKeys = new Set<string>();
    let drewProviderTile = false;
    for (
      let level = Math.max(2, z - FALLBACK_ZOOM_STEPS);
      level <= z;
      level++
    ) {
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
          retainedRequestKeys.add(key);
          const entry = cache.get(key);
          if (entry) {
            if (entry.status === "ready") {
              cache.delete(key);
              cache.set(key, entry); // refresh LRU position
              const tileLeft = (tx / n) * renderWidth;
              const tileRight = ((tx + 1) / n) * renderWidth;
              const tileLatTop = mercatorNormYToLat(ty / n);
              const tileLatBottom = mercatorNormYToLat((ty + 1) / n);
              const tileTop = ((90 - tileLatTop) / 180) * renderHeight;
              const tileBottom = ((90 - tileLatBottom) / 180) * renderHeight;
              const intersectsVisibleViewport =
                tileLeft < right &&
                tileRight > left &&
                tileTop < bottom &&
                tileBottom > top;
              if (intersectsVisibleViewport) {
                drawTile(ctx, entry, level, tx, ty, view);
                drewProviderTile = true;
                if (shouldDrawFlatMapTileBounds() && level === z) {
                  ctx.save();
                  ctx.strokeStyle = "rgba(0, 255, 255, 0.9)";
                  ctx.lineWidth = 1 / scale;
                  ctx.strokeRect(
                    tileLeft,
                    tileTop,
                    tileRight - tileLeft,
                    tileBottom - tileTop,
                  );
                  ctx.restore();
                }
              }
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
        !retainedRequestKeys.has(key)
      ) {
        releaseEntry(entry);
        cache.delete(key);
      }
    }

    if (viewChanged) {
      // Fill the actual view before spending its request slots on the idle ring.
      // Center-first also avoids a slow scan from the northwestern corner.
      const centerX = (visible.xStart + visible.xEnd) / 2;
      const centerY = (visible.yStart + visible.yEnd) / 2;
      const priority = (key: string) => {
        const entry = cache.get(key)!;
        const offscreen =
          entry.x < visible.xStart ||
          entry.x > visible.xEnd ||
          entry.y < visible.yStart ||
          entry.y > visible.yEnd;
        return (
          (offscreen ? 1e9 : 0) +
          (entry.x - centerX) ** 2 +
          (entry.y - centerY) ** 2
        );
      };
      requestQueue = [...new Set(requestQueue)].filter(
        (key) => cache.get(key)?.status === "queued",
      );
      requestQueue.sort((a, b) => priority(a) - priority(b));
    }

    if ((viewChanged || view.navigationActive) && settleTimer) {
      clearTimeout(settleTimer);
      settleTimer = undefined;
    }
    if (view.navigationActive) {
      // Exact visible children are useful during a gesture; the configured
      // offscreen ring is only introduced by the settled redraw.
      pumpQueue();
    } else if (viewChanged && settleDelayMs > 0) {
      settleTimer = setTimeout(() => {
        settleTimer = undefined;
        pumpQueue();
      }, settleDelayMs);
    } else {
      pumpQueue();
    }

    return drewProviderTile;
  }

  return {
    draw,
    dispose() {
      disposed = true;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = undefined;
      if (completionFrame !== undefined) cancelFrame(completionFrame);
      completionFrame = undefined;
      for (const entry of cache.values()) {
        releaseEntry(entry);
      }
      cache.clear();
      requestQueue = [];
    },
  };
}

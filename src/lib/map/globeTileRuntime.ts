import type { DisplayQualitySettings } from "@/lib/map/displayQuality";

export type GlobeTileLayer = "imagery" | "labels";

export interface GlobeTileRuntimeBudget {
  minCacheTiles: number;
  maxCacheTiles: number;
  minCacheBytes: number;
  maxCacheBytes: number;
  downloadJobs: number;
  parseJobs: number;
  processJobs: number;
  maxTilesProcessed: number;
}

interface RuntimeQueue {
  maxJobs: number;
}

interface RuntimeCache {
  minSize: number;
  maxSize: number;
  minBytesSize: number;
  maxBytesSize: number;
  unloadPercent: number;
  itemSet?: { size?: number };
}

interface RuntimeStats {
  inCache?: number;
  queued?: number;
  downloading?: number;
  parsing?: number;
  loaded?: number;
  failed?: number;
  active?: number;
  visible?: number;
}

/** Structural subset shared by current 3d-tiles-renderer releases. */
export interface GlobeTileRendererRuntime {
  lruCache: RuntimeCache;
  downloadQueue: RuntimeQueue;
  parseQueue: RuntimeQueue;
  processNodeQueue: RuntimeQueue;
  loadSiblings: boolean;
  optimizedLoadStrategy: boolean;
  maxTilesProcessed: number;
  visibleTiles?: { size?: number };
  activeTiles?: { size?: number };
  stats?: RuntimeStats;
}

export interface GlobeTileRuntimeSnapshot {
  visible: number;
  active: number;
  cached: number;
  queued: number;
  downloading: number;
  parsing: number;
  decoded: number;
  failed: number;
}

function finiteCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

/**
 * Split the quality envelope between imagery and transparent labels. Label
 * tiles are 512px RGBA images, so a half-size secondary cache avoids silently
 * doubling the primary globe budget while retaining nearby pan reuse.
 */
export function resolveGlobeTileRuntimeBudget(
  settings: DisplayQualitySettings,
  layer: GlobeTileLayer,
): GlobeTileRuntimeBudget {
  const share = layer === "imagery" ? 1 : 0.5;
  const maxCacheTiles = Math.max(
    64,
    Math.floor(settings.globeTileCacheSize * share),
  );
  const maxCacheBytes = Math.max(
    32 * 1024 * 1024,
    Math.floor(settings.globeTileCacheBytes * share),
  );
  const downloadJobs = Math.max(
    2,
    Math.floor(settings.tileRequestConcurrency * share),
  );
  return {
    minCacheTiles: Math.max(32, Math.floor(maxCacheTiles * 0.8)),
    maxCacheTiles,
    minCacheBytes: Math.floor(maxCacheBytes * 0.8),
    maxCacheBytes,
    downloadJobs,
    parseJobs: Math.max(2, Math.min(6, Math.ceil(downloadJobs / 2))),
    processJobs: Math.max(4, downloadJobs * 2),
    maxTilesProcessed: Math.max(
      64,
      Math.floor(settings.globeTileTraversalBudget * share),
    ),
  };
}

/** Apply one quality profile to the renderer without relying on plugin defaults. */
export function applyGlobeTileRuntimeBudget(
  renderer: GlobeTileRendererRuntime,
  budget: GlobeTileRuntimeBudget,
): void {
  renderer.lruCache.minSize = budget.minCacheTiles;
  renderer.lruCache.maxSize = budget.maxCacheTiles;
  renderer.lruCache.minBytesSize = budget.minCacheBytes;
  renderer.lruCache.maxBytesSize = budget.maxCacheBytes;
  renderer.lruCache.unloadPercent = 0.1;
  renderer.downloadQueue.maxJobs = budget.downloadJobs;
  renderer.parseQueue.maxJobs = budget.parseJobs;
  renderer.processNodeQueue.maxJobs = budget.processJobs;
  renderer.maxTilesProcessed = budget.maxTilesProcessed;

  // XYZ parents remain visible until their selected children arrive. Loading
  // every sibling of a visible child spends bandwidth on off-screen quadrants;
  // the optimized queue can instead prioritize only tiles contributing to the
  // current camera without introducing a hole in the globe.
  renderer.loadSiblings = false;
  renderer.optimizedLoadStrategy = true;
}

export function readGlobeTileRuntimeSnapshot(
  renderer: GlobeTileRendererRuntime,
): GlobeTileRuntimeSnapshot {
  const stats = renderer.stats ?? {};
  return {
    visible: finiteCount(renderer.visibleTiles?.size ?? stats.visible),
    active: finiteCount(renderer.activeTiles?.size ?? stats.active),
    cached: finiteCount(stats.inCache ?? renderer.lruCache.itemSet?.size),
    queued: finiteCount(stats.queued),
    downloading: finiteCount(stats.downloading),
    parsing: finiteCount(stats.parsing),
    decoded: finiteCount(stats.loaded),
    failed: finiteCount(stats.failed),
  };
}

/**
 * Cache names used by Workbox runtime caching for tiles
 * (`src/lib/tiles/tileRuntimeCaching.ts`). `tiles-pro` no longer has a caching
 * rule — it stays listed so the settings screen's clear action still removes
 * any cache left behind by an older build.
 */
const TILE_CACHE_NAMES = [
  "tiles-esri",
  "tiles-osm",
  "tiles-carto",
  "tiles-pro",
] as const;

/** Get tile cache statistics (entry counts per cache). */
export async function getTileCacheStats(): Promise<{
  totalEntries: number;
  byCache: Record<string, number>;
}> {
  const byCache: Record<string, number> = {};
  let totalEntries = 0;

  if (typeof caches === "undefined") {
    for (const name of TILE_CACHE_NAMES) {
      byCache[name] = 0;
    }
    return { totalEntries: 0, byCache };
  }

  for (const name of TILE_CACHE_NAMES) {
    try {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      byCache[name] = keys.length;
      totalEntries += keys.length;
    } catch {
      byCache[name] = 0;
    }
  }

  return { totalEntries, byCache };
}

/** Clear all tile caches. */
export async function clearAllTileCaches(): Promise<void> {
  if (typeof caches === "undefined") return;

  for (const name of TILE_CACHE_NAMES) {
    try {
      await caches.delete(name);
    } catch {
      // Ignore errors — cache may not exist
    }
  }
}

/** Clear a specific tile cache by name. */
export async function clearTileCache(cacheName: string): Promise<void> {
  if (typeof caches === "undefined") return;

  try {
    await caches.delete(cacheName);
  } catch {
    // Ignore errors — cache may not exist
  }
}

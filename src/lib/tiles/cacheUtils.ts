/** Cache names used by Workbox runtime caching for tiles. */
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

const PRO_TILE_CACHE_NAME = "tiles-pro";
const PRO_TILE_CACHE_OWNER_KEY = "propulse-tiles-pro-owner";

/**
 * Keeps the `tiles-pro` cache scoped to one signed-in account per browser
 * profile. That cache's Workbox rule sets `matchOptions.ignoreVary` so a
 * Mapbox tile match survives the proxy's hourly `Authorization` token
 * rotation (`api/tiles/proxy.ts` sends `Vary: Authorization`) — but ignoring
 * Vary also means the service worker would happily serve a previous
 * account's cached Pro imagery to a different account signing in on the
 * same browser, without that account ever hitting the server's entitlement
 * check. Call this from the auth listener with the current user id (or
 * `null` on sign-out); it purges the cache whenever the owner changes and
 * is a no-op otherwise. Fire-and-forget — never throws, never blocks
 * sign-in.
 */
export function ensureProTileCacheOwner(userId: string | null): void {
  try {
    const previousOwner = localStorage.getItem(PRO_TILE_CACHE_OWNER_KEY);
    if (previousOwner === userId) return;

    if (userId) {
      localStorage.setItem(PRO_TILE_CACHE_OWNER_KEY, userId);
    } else {
      localStorage.removeItem(PRO_TILE_CACHE_OWNER_KEY);
    }

    if (typeof caches === "undefined") return;
    void caches.delete(PRO_TILE_CACHE_NAME).catch(() => {
      // Best-effort purge; a stale entry still expires within 30 days.
    });
  } catch {
    // Storage/Cache APIs can be unavailable (privacy mode, tests, SSR).
  }
}

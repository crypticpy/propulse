import { authHeaders } from "@/lib/api/authFetch";

/**
 * Pre-fetches the lowest zoom levels of a tile source so the Workbox
 * `tiles-*` CacheFirst caches (see `tileRuntimeCaching.ts`) already hold
 * them before the map's own tile loaders request them. This is a pure
 * quota/latency optimization — the map still renders correctly if warming
 * is skipped or a tile fails, so every guard below fails open (no warming)
 * rather than throwing.
 */

export interface WarmTileSource {
  /** Component of the once-per-session guard key (provider id, or "labels"). */
  id: string;
  /** XYZ URL template containing literal `{z}`, `{x}`, `{y}` tokens. */
  urlTemplate: string;
  /** True when requests must carry a Supabase bearer token (Pro proxy). */
  requiresAuth?: boolean;
}

export interface WarmTileCacheOptions {
  sources: WarmTileSource[];
  /** UHD/Extreme quality tiers also warm z3 (64 more tiles per source). */
  includeZoom3: boolean;
  /** Guard key, e.g. `${provider.id}:${themeId}` — one warm-up per value per session. */
  sessionKey: string;
}

const SESSION_STORAGE_PREFIX = "propulse:tile-warm:";
const WARM_CONCURRENCY = 4;
const BASE_MAX_ZOOM = 2;
const HIGH_TIER_MAX_ZOOM = 3;

interface TileCoordinate {
  z: number;
  x: number;
  y: number;
}

function tileCoordinates(maxZoom: number): TileCoordinate[] {
  const coordinates: TileCoordinate[] = [];
  for (let z = 0; z <= maxZoom; z++) {
    const n = 1 << z;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        coordinates.push({ z, x, y });
      }
    }
  }
  return coordinates;
}

function buildTileUrl(template: string, { z, x, y }: TileCoordinate): string {
  return template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

/** URLs for z0-z2 (21 tiles), or z0-z3 (85 tiles) when `includeZoom3` is set. */
export function buildWarmTileUrls(
  urlTemplate: string,
  includeZoom3: boolean,
): string[] {
  const maxZoom = includeZoom3 ? HIGH_TIER_MAX_ZOOM : BASE_MAX_ZOOM;
  return tileCoordinates(maxZoom).map((coordinate) =>
    buildTileUrl(urlTemplate, coordinate),
  );
}

function hasWarmedThisSession(sessionKey: string): boolean {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_PREFIX + sessionKey) === "1";
  } catch {
    return false;
  }
}

function markWarmedThisSession(sessionKey: string): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_PREFIX + sessionKey, "1");
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts;
    // warming again next mount is harmless.
  }
}

/** True when the browser's Save-Data preference is on. */
function isSaveDataEnabled(): boolean {
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean } }
  ).connection;
  return connection?.saveData === true;
}

async function warmOneUrl(url: string, requiresAuth: boolean): Promise<void> {
  try {
    const init: RequestInit = { priority: "low" };
    if (requiresAuth) {
      init.headers = await authHeaders();
    }
    await fetch(url, init);
  } catch {
    // Best-effort warm-up; one failed tile must never abort the rest.
  }
}

async function runWithConcurrency(
  jobs: Array<{ url: string; requiresAuth: boolean }>,
  limit: number,
): Promise<void> {
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < jobs.length) {
      const job = jobs[nextIndex];
      nextIndex += 1;
      await warmOneUrl(job.url, job.requiresAuth);
    }
  }
  const workerCount = Math.min(limit, jobs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

/**
 * Warms the tile caches for `options.sources` (z0-z2, or z0-z3 for
 * `includeZoom3`), unless: it already ran for `sessionKey` this session, the
 * browser is offline, Save-Data is on, or no service worker controls the
 * page (so the fetches would not populate the Workbox cache). Never throws.
 */
export async function warmTileCache(
  options: WarmTileCacheOptions,
): Promise<void> {
  try {
    if (typeof navigator === "undefined") return;
    if (navigator.onLine === false) return;
    if (isSaveDataEnabled()) return;
    if (!navigator.serviceWorker?.controller) return;
    if (hasWarmedThisSession(options.sessionKey)) return;

    const jobs = options.sources.flatMap((source) =>
      buildWarmTileUrls(source.urlTemplate, options.includeZoom3).map(
        (url) => ({ url, requiresAuth: source.requiresAuth === true }),
      ),
    );
    await runWithConcurrency(jobs, WARM_CONCURRENCY);
    markWarmedThisSession(options.sessionKey);
  } catch {
    // Warm-up is an optimization; never let it throw into the caller.
  }
}

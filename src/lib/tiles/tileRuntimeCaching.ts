/**
 * Workbox `runtimeCaching` rules for tile hosts.
 *
 * Kept in a plain module (not inline in `vite.config.ts`) so both the
 * service worker build and Vitest can import the same source of truth —
 * `vite.config.ts` spreads this array into its `workbox.runtimeCaching`
 * list, and `tileRuntimeCaching.test.ts` asserts every tile host is covered.
 *
 * These caches only ever store tiles the reader actually looked at: there is
 * no proactive prefetch or bulk warm-up anywhere in the app, because the
 * OpenStreetMap tile usage policy and CARTO's basemap terms both prohibit
 * bulk downloading. See `docs/guides/CARTO-BASEMAPS.md` and
 * `docs/PROP-SPHERE-LAYER-SOURCE-AUDIT.md`.
 *
 * Retention is per provider, not shared:
 * - `tiles-esri` / `tiles-osm` keep the 30 days they have had since the
 *   original service worker configuration.
 * - `tiles-carto` is bounded to one day, matching the CARTO provider's
 *   documented application cache TTL. CARTO's terms cap end-user caching at
 *   30 days, but `docs/guides/CARTO-BASEMAPS.md` commits us to not extending
 *   client retention beyond the provider's own headers, so one day it is.
 * - `tiles-pro` stays NetworkOnly (see the rule comment below).
 */

interface TileCachingRule {
  urlPattern: RegExp;
  handler: "CacheFirst" | "NetworkOnly";
  options?: {
    cacheName: string;
    expiration: { maxEntries: number; maxAgeSeconds: number };
  };
}

const TILE_CACHE_MAX_ENTRIES = 3000;
const DAY_SECONDS = 24 * 60 * 60;
const TILE_CACHE_MAX_AGE_SECONDS = 30 * DAY_SECONDS;
const CARTO_CACHE_MAX_AGE_SECONDS = DAY_SECONDS;

export const TILE_RUNTIME_CACHING: TileCachingRule[] = [
  {
    // ESRI World Imagery satellite tiles (free tier)
    urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/,
    handler: "CacheFirst",
    options: {
      cacheName: "tiles-esri",
      expiration: {
        maxEntries: TILE_CACHE_MAX_ENTRIES,
        maxAgeSeconds: TILE_CACHE_MAX_AGE_SECONDS,
      },
    },
  },
  {
    // OpenStreetMap standard tiles (free tier)
    urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/,
    handler: "CacheFirst",
    options: {
      cacheName: "tiles-osm",
      expiration: {
        maxEntries: TILE_CACHE_MAX_ENTRIES,
        maxAgeSeconds: TILE_CACHE_MAX_AGE_SECONDS,
      },
    },
  },
  {
    // CARTO Dark Matter basemap and dark/light label overlays. Requests are
    // CORS (fetch from 3d-tiles-renderer, Image.crossOrigin="anonymous" from
    // flatTileLayer.ts), so responses are status 200, not opaque. One-day
    // retention only — see the module comment.
    urlPattern: /^https:\/\/([abcd]\.)?basemaps\.cartocdn\.com\/.*/,
    handler: "CacheFirst",
    options: {
      cacheName: "tiles-carto",
      expiration: {
        maxEntries: TILE_CACHE_MAX_ENTRIES,
        maxAgeSeconds: CARTO_CACHE_MAX_AGE_SECONDS,
      },
    },
  },
  {
    // Authenticated imagery uses the browser's private HTTP cache
    // (one hour, Vary: Authorization) plus the decoded tile LRU.
    // Avoid persisting JWT-keyed copies across refreshes/accounts in
    // CacheStorage; never ignore Vary to share entitled responses.
    //
    // A CacheFirst rule here cannot be made safe from application code: the
    // service worker consults CacheStorage before any app code (auth store,
    // profile tier) has run, so a purge-on-account-change always races the
    // first tile request of a page load — and `subscriptionTier` is persisted
    // in localStorage, so a second account can render as Pro for a moment.
    // Per-user caching would have to partition the cache key itself (e.g. a
    // user-id component in the proxy URL), not police it afterwards.
    urlPattern: /\/api\/tiles\/proxy/,
    handler: "NetworkOnly",
  },
];

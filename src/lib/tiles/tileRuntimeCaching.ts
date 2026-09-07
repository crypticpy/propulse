/**
 * Workbox `runtimeCaching` rules for tile hosts.
 *
 * Kept in a plain module (not inline in `vite.config.ts`) so both the
 * service worker build and Vitest can import the same source of truth —
 * `vite.config.ts` spreads this array into its `workbox.runtimeCaching`
 * list, and `tileRuntimeCaching.test.ts` asserts every tile host is covered.
 *
 * All four caches share the same CacheFirst policy: 3000 entries, 30 days.
 * `tiles-pro` additionally sets `matchOptions.ignoreVary` because the proxy
 * always responds `Vary: Authorization` and the Supabase access token
 * rotates hourly — without it, a cache entry stops matching on every token
 * refresh even though the proxied tile bytes are identical for every
 * entitled user. The server-side entitlement check on `/api/tiles/proxy`
 * (`api/tiles/proxy.ts`) is unchanged; this only affects how the browser's
 * own private CacheStorage matches a request it already fetched.
 */

interface TileCachingRule {
  urlPattern: RegExp;
  handler: "CacheFirst";
  options: {
    cacheName: string;
    expiration: { maxEntries: number; maxAgeSeconds: number };
    matchOptions?: { ignoreVary: boolean };
  };
}

const TILE_CACHE_MAX_ENTRIES = 3000;
const TILE_CACHE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

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
    // flatTileLayer.ts), so responses are status 200, not opaque.
    urlPattern: /^https:\/\/([abcd]\.)?basemaps\.cartocdn\.com\/.*/,
    handler: "CacheFirst",
    options: {
      cacheName: "tiles-carto",
      expiration: {
        maxEntries: TILE_CACHE_MAX_ENTRIES,
        maxAgeSeconds: TILE_CACHE_MAX_AGE_SECONDS,
      },
    },
  },
  {
    // Mapbox HD satellite (Pro tier), proxied through /api/tiles/proxy.
    // See the module comment above for why ignoreVary is safe here.
    urlPattern: /\/api\/tiles\/proxy/,
    handler: "CacheFirst",
    options: {
      cacheName: "tiles-pro",
      expiration: {
        maxEntries: TILE_CACHE_MAX_ENTRIES,
        maxAgeSeconds: TILE_CACHE_MAX_AGE_SECONDS,
      },
      matchOptions: { ignoreVary: true },
    },
  },
];

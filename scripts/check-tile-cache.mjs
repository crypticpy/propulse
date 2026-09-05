#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

// Exercise the route order actually emitted by Workbox, not a copy of the
// configuration regex. No network, credentials, or browser state is used.
const routes = [];
const workbox = {
  clientsClaim() {},
  precacheAndRoute() {},
  cleanupOutdatedCaches() {},
  createHandlerBoundToURL() {},
  registerRoute(pattern, handler) {
    routes.push({ pattern, handler });
  },
};
for (const kind of [
  "NavigationRoute",
  "NetworkOnly",
  "NetworkFirst",
  "CacheFirst",
  "StaleWhileRevalidate",
  "ExpirationPlugin",
]) {
  workbox[kind] = class {
    constructor(options = {}) {
      Object.assign(this, options, { kind });
    }
  };
}
const define = (_dependencies, factory) => factory(workbox);
runInNewContext(
  await readFile(process.argv[2] ?? "dist/sw.js", "utf8"),
  {
    self: { define, skipWaiting() {} },
    define,
  },
  { timeout: 1000 },
);

for (const [url, cache] of [
  ["https://propulse.cloud/api/tiles/proxy?provider=mapbox&z=4&x=5&y=6", null],
  [
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/4/5/6",
    "tiles-esri",
  ],
  ["https://tile.openstreetmap.org/4/5/6.png", "tiles-osm"],
]) {
  // Workbox uses the first matching route. The broad API rule used to swallow
  // HD tiles and give them NetworkFirst with a five-minute data-cache lifetime.
  const match = routes.find(
    ({ pattern }) => typeof pattern?.test === "function" && pattern.test(url),
  );
  if (cache === null) {
    // NetworkOnly still honors the browser HTTP cache. It must not place
    // bearer-token variants into a long-lived service-worker cache.
    assert.equal(match?.handler.kind, "NetworkOnly", url);
    assert.equal(match?.handler.cacheName, undefined, url);
    continue;
  }
  assert.equal(match?.handler.kind, "CacheFirst", url);
  assert.equal(match?.handler.cacheName, cache, url);
  assert(
    match.handler.plugins.some(
      (plugin) => plugin.maxEntries > 0 && plugin.maxAgeSeconds > 0,
    ),
  );
}
console.log(
  "Built worker caches public tiles and leaves private HD caching to authenticated HTTP semantics.",
);

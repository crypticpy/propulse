import { describe, expect, it } from "vitest";
import { TILE_RUNTIME_CACHING } from "./tileRuntimeCaching";

const DAY_SECONDS = 24 * 60 * 60;

describe("TILE_RUNTIME_CACHING", () => {
  const cases: Array<{
    host: string;
    sample: string;
    cacheName: string;
    maxAgeSeconds: number;
  }> = [
    {
      host: "server.arcgisonline.com",
      sample:
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/2/1",
      cacheName: "tiles-esri",
      maxAgeSeconds: 30 * DAY_SECONDS,
    },
    {
      host: "tile.openstreetmap.org",
      sample: "https://tile.openstreetmap.org/3/2/1.png",
      cacheName: "tiles-osm",
      maxAgeSeconds: 30 * DAY_SECONDS,
    },
    {
      host: "basemaps.cartocdn.com (bare)",
      sample: "https://basemaps.cartocdn.com/dark_all/3/2/1@2x.png",
      cacheName: "tiles-carto",
      maxAgeSeconds: DAY_SECONDS,
    },
    {
      host: "basemaps.cartocdn.com (sharded)",
      sample: "https://a.basemaps.cartocdn.com/dark_only_labels/3/2/1@2x.png",
      cacheName: "tiles-carto",
      maxAgeSeconds: DAY_SECONDS,
    },
  ];

  it.each(cases)(
    "caches $host under $cacheName",
    ({ sample, cacheName, maxAgeSeconds }) => {
      const rule = TILE_RUNTIME_CACHING.find((entry) =>
        entry.urlPattern.test(sample),
      );
      expect(rule).toBeDefined();
      expect(rule?.handler).toBe("CacheFirst");
      expect(rule?.options?.cacheName).toBe(cacheName);
      expect(rule?.options?.expiration).toEqual({
        maxEntries: 3000,
        maxAgeSeconds,
      });
    },
  );

  it("bounds CARTO retention to the documented one-day provider TTL", () => {
    const carto = TILE_RUNTIME_CACHING.find(
      (rule) => rule.options?.cacheName === "tiles-carto",
    );
    expect(carto?.options?.expiration.maxAgeSeconds).toBe(DAY_SECONDS);
  });

  it("never persists authenticated Pro imagery in CacheStorage", () => {
    const sample =
      "https://propulse.example/api/tiles/proxy?provider=mapbox&z=3&x=2&y=1";
    const rule = TILE_RUNTIME_CACHING.find((entry) =>
      entry.urlPattern.test(sample),
    );
    expect(rule).toBeDefined();
    expect(rule?.handler).toBe("NetworkOnly");
    expect(rule?.options).toBeUndefined();
  });

  it("declares no cache that ignores Vary", () => {
    for (const rule of TILE_RUNTIME_CACHING) {
      expect(rule.options ?? {}).not.toHaveProperty("matchOptions");
    }
  });
});

import { describe, expect, it } from "vitest";
import { TILE_RUNTIME_CACHING } from "./tileRuntimeCaching";

describe("TILE_RUNTIME_CACHING", () => {
  const cases: Array<{ host: string; sample: string; cacheName: string }> = [
    {
      host: "server.arcgisonline.com",
      sample: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/2/1",
      cacheName: "tiles-esri",
    },
    {
      host: "tile.openstreetmap.org",
      sample: "https://tile.openstreetmap.org/3/2/1.png",
      cacheName: "tiles-osm",
    },
    {
      host: "basemaps.cartocdn.com (bare)",
      sample: "https://basemaps.cartocdn.com/dark_all/3/2/1@2x.png",
      cacheName: "tiles-carto",
    },
    {
      host: "basemaps.cartocdn.com (sharded)",
      sample: "https://a.basemaps.cartocdn.com/dark_only_labels/3/2/1@2x.png",
      cacheName: "tiles-carto",
    },
    {
      host: "/api/tiles/proxy",
      sample: "https://propulse.example/api/tiles/proxy?provider=mapbox&z=3&x=2&y=1",
      cacheName: "tiles-pro",
    },
  ];

  it.each(cases)("covers $host under $cacheName", ({ sample, cacheName }) => {
    const rule = TILE_RUNTIME_CACHING.find((entry) => entry.urlPattern.test(sample));
    expect(rule).toBeDefined();
    expect(rule?.options.cacheName).toBe(cacheName);
    expect(rule?.handler).toBe("CacheFirst");
  });

  it("uses the shared 3000-entry / 30-day expiration for every tile cache", () => {
    for (const rule of TILE_RUNTIME_CACHING) {
      expect(rule.options.expiration).toEqual({
        maxEntries: 3000,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      });
    }
  });

  it("only ignores Vary for the authenticated Pro proxy cache", () => {
    const proRule = TILE_RUNTIME_CACHING.find((r) => r.options.cacheName === "tiles-pro");
    expect(proRule?.options.matchOptions).toEqual({ ignoreVary: true });

    const others = TILE_RUNTIME_CACHING.filter((r) => r.options.cacheName !== "tiles-pro");
    for (const rule of others) {
      expect(rule.options.matchOptions).toBeUndefined();
    }
  });
});

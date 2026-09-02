import { describe, expect, it } from "vitest";
import { ALL_PROVIDERS } from "@/lib/tiles/providers";
import { getXYZTilePluginOptions } from "@/lib/tiles/xyzOptions";

describe("getXYZTilePluginOptions", () => {
  it("converts the inclusive zoom level to the plugin's level count", () => {
    const options = getXYZTilePluginOptions(ALL_PROVIDERS["esri-world"]);

    expect(options.levels).toBe(20);
    expect(options.tileDimension).toBe(256);
    expect(options.useRecommendedSettings).toBe(false);
  });

  it("preserves Mapbox's high-resolution tile depth and dimensions", () => {
    const options = getXYZTilePluginOptions(
      ALL_PROVIDERS["mapbox-satellite"],
    );

    expect(options.levels).toBe(23);
    expect(options.tileDimension).toBe(512);
  });

  it("marks satellite providers as de-clouded mosaics with explicit provenance", () => {
    const free = ALL_PROVIDERS["esri-world"];
    const pro = ALL_PROVIDERS["mapbox-satellite"];

    expect(free.surfaceKind).toBe("declouded-mosaic");
    expect(free.attributionUrl).toMatch(/^https:/);
    expect(pro.surfaceKind).toBe("declouded-mosaic");
    expect(pro.requiresPro).toBe(true);
    expect(pro.authentication).toBe("bearer");
    expect(pro.fallbackProviderId).toBe("esri-world");
  });
});

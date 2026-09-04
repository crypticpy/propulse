import { describe, expect, it } from "vitest";
import {
  absoluteTileUrl,
  buildExplorerStyle,
  buildGlobeFallbackStyle,
  resolveExplorerProvider,
} from "./mapExplorerStyle";

describe("mapExplorerStyle", () => {
  it("resolves de-clouded free and authenticated Pro satellite sources", () => {
    expect(resolveExplorerProvider("satellite", "free").id).toBe("esri-world");
    expect(resolveExplorerProvider("satellite", "pro").id).toBe(
      "mapbox-satellite",
    );
    expect(resolveExplorerProvider("dark", "free").id).toBe("osm");
  });

  it("derives a dark presentation from OSM instead of a keyed dark basemap", () => {
    const dark = buildExplorerStyle(
      resolveExplorerProvider("dark", "free"),
      "dark",
      19,
    );
    expect(dark.layers[1]).toMatchObject({
      paint: {
        "raster-brightness-max": 0.34,
      },
    });
  });

  it("does not cap the raster layer below the source max zoom", () => {
    const contrast = buildExplorerStyle(
      resolveExplorerProvider("light", "free"),
      "contrast",
      19,
    );
    expect(contrast.sources.basemap).toMatchObject({
      type: "raster",
      maxzoom: 19,
    });
    expect(contrast.layers[1]).not.toHaveProperty("maxzoom");
  });

  it("leaves absolute tile URLs unchanged", () => {
    expect(absoluteTileUrl("https://example.test/{z}/{x}/{y}.png")).toBe(
      "https://example.test/{z}/{x}/{y}.png",
    );
  });

  it("names the photorealistic globe fallback distinctly", () => {
    const style = buildGlobeFallbackStyle(
      resolveExplorerProvider("satellite", "free"),
      19,
    );
    expect(style.name).toBe("PropSphere Photorealistic Fallback");
  });
});

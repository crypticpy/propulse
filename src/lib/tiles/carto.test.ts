import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cartoTileUrl } from "./carto";

beforeEach(() => {
  vi.stubEnv("VITE_CARTO_BASEMAPS_API_KEY", "synthetic key&?/+#=é");
});
afterEach(() => vi.unstubAllEnvs());

describe("direct CARTO raster URL integration", () => {
  it.each(["dark_all", "dark_only_labels", "light_only_labels"] as const)(
    "preserves %s retina coordinate placeholders and safely encodes the basemap key",
    (style) => {
      const template = cartoTileUrl(style);
      expect(template).toBe(
        `https://basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png?key=synthetic%20key%26%3F%2F%2B%23%3D%C3%A9`,
      );
      const url = new URL(
        template.replace("{z}", "2").replace("{x}", "1").replace("{y}", "3"),
      );
      expect(url.origin).toBe("https://basemaps.cartocdn.com");
      expect(url.pathname).toBe(`/${style}/2/1/3@2x.png`);
      expect([...url.searchParams]).toEqual([["key", "synthetic key&?/+#=é"]]);
      expect(url.hash).toBe("");
    },
  );

  it.each([undefined, ""])(
    "preserves unkeyed URLs when configuration is absent (%s)",
    (key) => {
      vi.stubEnv("VITE_CARTO_BASEMAPS_API_KEY", key);
      for (const style of [
        "dark_all",
        "dark_only_labels",
        "light_only_labels",
      ] as const) {
        expect(cartoTileUrl(style)).toBe(
          `https://basemaps.cartocdn.com/${style}/{z}/{x}/{y}@2x.png`,
        );
      }
    },
  );

  it("keeps the provider and Atmos source on direct keyed tiles with credits and retina geometry", async () => {
    vi.resetModules();
    const { selectTileProvider } = await import("./providers");
    const { DARK_BASEMAP_STYLE } = await import("@/lib/atmos/mapStyles");
    const provider = selectTileProvider("standard", "free", "carto-dark");
    expect(provider.url).toBe(cartoTileUrl("dark_all"));
    expect(provider).toMatchObject({
      retina: true,
      tileSize: 512,
      maxZoom: 20,
      requiresAuth: false,
      cacheTtlSeconds: 86400,
    });
    expect(provider.attribution).toContain("CARTO");
    expect(provider.attribution).toContain("OpenStreetMap");
    expect(DARK_BASEMAP_STYLE.sources["carto-dark"]).toMatchObject({
      tiles: [provider.url],
      tileSize: 256,
    });
    const source = DARK_BASEMAP_STYLE.sources["carto-dark"];
    expect(source.type).toBe("raster");
    if (source.type !== "raster") throw new Error("Expected raster source");
    expect(source.attribution).toContain("CARTO");
    expect(selectTileProvider("standard", "free").id).toBe("osm");
  });
});

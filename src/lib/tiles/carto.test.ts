import { describe, expect, it } from "vitest";
import { cartoTileUrl } from "./carto";
import { selectTileProvider } from "./providers";
import { DARK_BASEMAP_STYLE } from "@/lib/atmos/mapStyles";

describe("CARTO raster URL integration", () => {
  it.each(["dark_all", "dark_only_labels", "light_only_labels"] as const)(
    "keeps %s coordinate placeholders at a credential-free same-origin endpoint",
    (style) => {
      const template = cartoTileUrl(style);
      expect(template).toBe(
        `/api/tiles/carto?style=${style}&z={z}&x={x}&y={y}`,
      );
      const url = new URL(
        template.replace("{z}", "2").replace("{x}", "1").replace("{y}", "3"),
        "https://app.example",
      );
      expect(url.origin).toBe("https://app.example");
      expect([...url.searchParams]).toEqual([
        ["style", style],
        ["z", "2"],
        ["x", "1"],
        ["y", "3"],
      ]);
    },
  );
  it("routes the selectable dark provider and Atmos source through the same proxy without dropping credits or retina geometry", () => {
    const provider = selectTileProvider("standard", "free", "carto-dark");
    expect(provider.url).toBe(cartoTileUrl("dark_all"));
    expect(provider).toMatchObject({
      retina: true,
      tileSize: 512,
      maxZoom: 20,
      requiresAuth: false,
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
  });
});

import { describe, expect, it, vi } from "vitest";
import { CompatibleXYZTilesPlugin } from "./CompatibleXYZTilesPlugin";

describe("CompatibleXYZTilesPlugin", () => {
  it("declares generated XYZ tiles as 1.0 before preprocessing", () => {
    const preprocessTileset = vi.fn();
    const plugin = Object.create(CompatibleXYZTilesPlugin.prototype) as
      CompatibleXYZTilesPlugin & {
        imageSource: {
          tiling: {
            minLevel: number;
            getLevel: () => { tileCountX: number; tileCountY: number };
          };
        };
        tiles: { preprocessTileset: typeof preprocessTileset };
        createChild: (x: number, y: number, level: number) => unknown;
        createBoundingVolume: () => unknown;
      };

    plugin.imageSource = {
      tiling: {
        minLevel: 0,
        getLevel: () => ({ tileCountX: 2, tileCountY: 1 }),
      },
    };
    plugin.tiles = { preprocessTileset };
    plugin.createChild = (x, y, level) => ({ x, y, level });
    plugin.createBoundingVolume = () => ({ region: [0, 0, 1, 1, 0, 1] });

    const tileset = plugin.getTileset("https://tiles.example/{z}/{x}/{y}");

    expect(tileset.asset.version).toBe("1.0");
    expect(tileset.root.children).toHaveLength(2);
    expect(preprocessTileset).toHaveBeenCalledOnce();
    expect(preprocessTileset).toHaveBeenCalledWith(
      tileset,
      "https://tiles.example/{z}/{x}/{y}",
    );
    expect(plugin.tiles.preprocessTileset).toBe(preprocessTileset);
  });
});

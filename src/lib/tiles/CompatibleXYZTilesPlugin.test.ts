import { describe, expect, it, vi } from "vitest";
import { CompatibleXYZTilesPlugin } from "@/lib/tiles/CompatibleXYZTilesPlugin";

type PreprocessTilesetMock = ReturnType<typeof vi.fn>;

type TestPlugin = CompatibleXYZTilesPlugin & {
  imageSource: {
    tiling: {
      minLevel: number;
      getLevel: () => { tileCountX: number; tileCountY: number };
    };
  };
  tiles: { preprocessTileset: PreprocessTilesetMock };
  createChild: (x: number, y: number, level: number) => unknown;
  createBoundingVolume: () => unknown;
};

function createPlugin(preprocessTileset: PreprocessTilesetMock): TestPlugin {
  const plugin = Object.create(
    CompatibleXYZTilesPlugin.prototype,
  ) as TestPlugin;

  plugin.imageSource = {
    tiling: {
      minLevel: 0,
      getLevel: () => ({ tileCountX: 2, tileCountY: 1 }),
    },
  };
  plugin.tiles = { preprocessTileset };
  plugin.createChild = (x, y, level) => ({ x, y, level });
  plugin.createBoundingVolume = () => ({ region: [0, 0, 1, 1, 0, 1] });

  return plugin;
}

describe("CompatibleXYZTilesPlugin", () => {
  it("declares generated XYZ tiles as 1.0 before preprocessing", () => {
    const preprocessTileset = vi.fn();
    const plugin = createPlugin(preprocessTileset);

    const tileset = plugin.getTileset("https://tiles.example/{z}/{x}/{y}");

    expect(tileset.asset?.version).toBe("1.0");
    expect(tileset.root.children).toHaveLength(2);
    expect(preprocessTileset).toHaveBeenCalledOnce();
    expect(preprocessTileset).toHaveBeenCalledWith(
      tileset,
      "https://tiles.example/{z}/{x}/{y}",
    );
    expect(plugin.tiles.preprocessTileset).toBe(preprocessTileset);
  });

  it("restores preprocessing when tileset generation throws", () => {
    const error = new Error("preprocessing failed");
    const preprocessTileset = vi.fn(() => {
      throw error;
    });
    const plugin = createPlugin(preprocessTileset);

    expect(() =>
      plugin.getTileset("https://tiles.example/{z}/{x}/{y}"),
    ).toThrow(error);
    expect(plugin.tiles.preprocessTileset).toBe(preprocessTileset);
  });
});

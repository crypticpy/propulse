import { XYZTilesPlugin } from "3d-tiles-renderer/plugins";

type XYZTilesPluginOptions = ConstructorParameters<typeof XYZTilesPlugin>[0];

interface SyntheticTileset {
  asset: { version: string };
  root: { children: unknown[] };
}

interface XYZPluginInternals {
  tiles: {
    preprocessTileset: (
      tileset: SyntheticTileset,
      baseUrl: string,
    ) => unknown;
  };
}

interface XYZPluginPrototype {
  getTileset: (
    this: CompatibleXYZTilesPlugin,
    baseUrl: string,
  ) => SyntheticTileset;
}

/**
 * XYZTilesPlugin generates a basic tileset but labels it as 1.1, which makes
 * the renderer warn about unsupported 1.1 features. Its generated structure
 * only uses 1.0 fields, so declare that version before preprocessing it.
 */
export class CompatibleXYZTilesPlugin extends XYZTilesPlugin {
  constructor(options: XYZTilesPluginOptions = {}) {
    super(options);
  }

  getTileset(baseUrl: string): SyntheticTileset {
    const { tiles } = this as unknown as XYZPluginInternals;
    const preprocessTileset = tiles.preprocessTileset;
    const basePrototype = XYZTilesPlugin.prototype as unknown as XYZPluginPrototype;

    tiles.preprocessTileset = (tileset, url) => {
      if (tileset.asset.version === "1.1") {
        tileset.asset.version = "1.0";
      }
      return preprocessTileset.call(tiles, tileset, url);
    };

    try {
      return basePrototype.getTileset.call(this, baseUrl);
    } finally {
      tiles.preprocessTileset = preprocessTileset;
    }
  }
}

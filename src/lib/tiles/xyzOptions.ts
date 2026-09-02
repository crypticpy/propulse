import type { TileProviderConfig } from "./types";

export interface XYZTilePluginOptions {
  url: string;
  shape: "ellipsoid";
  /** App quality profiles own errorTarget and runtime budgets. */
  useRecommendedSettings: false;
  /** Number of levels, not the highest inclusive level. */
  levels: number;
  tileDimension: number;
}

/** Translate the app's provider metadata to XYZTilesPlugin's real API. */
export function getXYZTilePluginOptions(
  provider: TileProviderConfig,
): XYZTilePluginOptions {
  return {
    url: provider.url,
    shape: "ellipsoid",
    // ImageFormatPlugin's recommended mode overwrites renderer.errorTarget
    // with 1 after React applies our quality profile. Keep it disabled so
    // Saver/Balanced/UHD/Extreme retain their intended detail level.
    useRecommendedSettings: false,
    levels: provider.maxZoom + 1,
    tileDimension: provider.tileSize,
  };
}

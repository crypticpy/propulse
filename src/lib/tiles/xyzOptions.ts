import type { TileProviderConfig } from "./types";

export interface XYZTilePluginOptions {
  url: string;
  shape: "ellipsoid";
  useRecommendedSettings: true;
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
    useRecommendedSettings: true,
    levels: provider.maxZoom + 1,
    tileDimension: provider.tileSize,
  };
}

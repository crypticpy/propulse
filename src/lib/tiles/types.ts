export type TileProviderId = "esri-world" | "osm" | "mapbox-satellite";

export interface TileProviderConfig {
  id: TileProviderId;
  name: string;
  attribution: string;
  maxZoom: number;
  tileSize: number; // 256 or 512
  requiresAuth: boolean; // true = needs Pro tier + edge proxy
  /** URL template with {z}, {x}, {y} tokens for XYZTilesPlugin */
  url: string;
}

export interface TileProviderRegistry {
  satellite: TileProviderConfig;
  standard: TileProviderConfig;
}

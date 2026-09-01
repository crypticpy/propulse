export type TileProviderId =
  | "esri-world"
  | "osm"
  | "carto-dark"
  | "mapbox-satellite";

export type TileSurfaceKind = "declouded-mosaic" | "cartographic";
export type TileCoverage = "global" | "regional";
export type TileAuthentication = "none" | "bearer";

export interface TileProviderConfig {
  id: TileProviderId;
  name: string;
  attribution: string;
  attributionUrl: string;
  /** What the pixels represent; weather/cloud observations are separate layers. */
  surfaceKind: TileSurfaceKind;
  coverage: TileCoverage;
  coverageNote: string;
  freshnessNote: string;
  /** Highest source zoom requested before any renderer overzoom. */
  nativeMaxZoom: number;
  maxZoom: number;
  tileSize: number; // 256 or 512
  requiresAuth: boolean; // true = needs Pro tier + edge proxy
  requiresPro: boolean;
  authentication: TileAuthentication;
  retina: boolean;
  overzoom: "none" | "limited";
  fallbackProviderId?: TileProviderId;
  cacheTtlSeconds: number;
  /** URL template with {z}, {x}, {y} tokens for XYZTilesPlugin */
  url: string;
}

export interface TileProviderRegistry {
  satellite: TileProviderConfig;
  standard: TileProviderConfig;
}

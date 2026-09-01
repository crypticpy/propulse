import type { TileProviderConfig } from "@/lib/tiles/types";

export interface ImagerySourceCredit {
  name: string;
  attribution: string;
  attributionUrl: string;
  surfaceKind: TileProviderConfig["surfaceKind"];
}

export const NASA_BLUE_MARBLE_SOURCE: ImagerySourceCredit = {
  name: "NASA Blue Marble",
  attribution: "NASA Blue Marble",
  attributionUrl: "https://visibleearth.nasa.gov/collection/1484/blue-marble",
  surfaceKind: "declouded-mosaic",
};

export const NATURAL_EARTH_SOURCE: ImagerySourceCredit = {
  name: "Natural Earth",
  attribution: "Natural Earth",
  attributionUrl: "https://www.naturalearthdata.com/about/terms-of-use/",
  surfaceKind: "cartographic",
};

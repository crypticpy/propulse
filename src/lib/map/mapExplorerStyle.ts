import type { StyleSpecification } from "maplibre-gl";
import { selectTileProvider } from "@/lib/tiles/providers";
import type { TileProviderConfig } from "@/lib/tiles/types";

export type ExplorerStyle = "satellite" | "light" | "dark" | "contrast";

export function resolveExplorerProvider(
  style: ExplorerStyle,
  subscriptionTier: "free" | "pro",
): TileProviderConfig {
  if (style === "satellite") {
    return selectTileProvider("satellite", subscriptionTier);
  }
  return selectTileProvider("standard", subscriptionTier);
}

export function buildExplorerStyle(
  provider: TileProviderConfig,
  style: ExplorerStyle,
  maxZoom: number,
): StyleSpecification {
  return {
    version: 8,
    name: `PropSphere ${style}`,
    sources: {
      basemap: {
        type: "raster",
        tiles: [provider.url],
        tileSize: provider.tileSize,
        minzoom: 0,
        maxzoom: maxZoom,
        attribution: provider.attribution,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": style === "light" ? "#dce9ee" : "#050914",
        },
      },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        minzoom: 0,
        paint:
          style === "contrast"
            ? {
                "raster-saturation": -1,
                "raster-contrast": 0.75,
                "raster-brightness-min": 0.05,
                "raster-brightness-max": 0.95,
              }
            : style === "dark"
              ? {
                  // Derive a dark presentation from the policy-compliant OSM
                  // source. CARTO's former keyless raster endpoint now renders
                  // an API-key watermark and is being retired.
                  "raster-saturation": -0.85,
                  "raster-contrast": 0.35,
                  "raster-brightness-min": 0,
                  "raster-brightness-max": 0.34,
                  "raster-fade-duration": 180,
                }
              : { "raster-fade-duration": 180 },
      },
    ],
  };
}

/**
 * Dark basemap style for MapLibre GL in AtmosPulse
 * Uses CARTO Dark Matter raster tiles through the server-keyed proxy
 */

import type { StyleSpecification } from "maplibre-gl";
import { cartoTileUrl } from "@/lib/tiles/carto";

export const DARK_BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  name: "AtmosPulse Dark",
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [cartoTileUrl("dark_all")],
      tileSize: 256,
      attribution:
        "&copy; <a href='https://carto.com/'>CARTO</a> &copy; <a href='https://www.openstreetmap.org/copyright'>OSM</a>",
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0a0a1a" },
    },
    {
      id: "carto-dark-layer",
      type: "raster",
      source: "carto-dark",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

/**
 * GOESCloudLayer2D — Renders GOES satellite cloud imagery as raster tiles
 * on the 2D MapLibre map via NASA GIBS WMTS.
 */

import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { useGOESImagery } from "@/hooks/useGOESImagery";

interface GOESCloudLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "goes-cloud";
const LAYER_ID = "goes-cloud-layer";

export function GOESCloudLayer2D({ map }: GOESCloudLayer2DProps) {
  const { tileUrl } = useGOESImagery();
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tileUrl) return;
    if (tileUrl === currentUrlRef.current) return;
    currentUrlRef.current = tileUrl;

    // Remove existing to update
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

    map.addSource(SOURCE_ID, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      maxzoom: 9,
    });

    map.addLayer(
      {
        id: LAYER_ID,
        type: "raster",
        source: SOURCE_ID,
        paint: {
          "raster-opacity": 0.5,
        },
      },
      // Insert below radar layer if it exists
      map.getLayer("rainviewer-radar-layer")
        ? "rainviewer-radar-layer"
        : undefined,
    );
  }, [map, tileUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      currentUrlRef.current = null;
    };
  }, [map]);

  return null;
}

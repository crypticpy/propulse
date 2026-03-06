/**
 * RadarLayer2D — Renders RainViewer weather radar tiles on the 2D MapLibre map
 * Uses the latest past frame from the RainViewer manifest as a raster tile source
 */

import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { useWeatherRadar } from "@/hooks/useWeatherRadar";

interface RadarLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "rainviewer-radar";
const LAYER_ID = "rainviewer-radar-layer";

export function RadarLayer2D({ map }: RadarLayer2DProps) {
  const { manifest } = useWeatherRadar();
  const currentPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!manifest) return;

    // Use the latest past frame
    const frames = manifest.radar.past;
    if (frames.length === 0) return;
    const latestFrame = frames[frames.length - 1];
    const tilePath = `${manifest.host}${latestFrame.path}/256/{z}/{x}/{y}/6/1_1.png`;

    // Skip if same frame already displayed
    if (tilePath === currentPathRef.current) return;
    currentPathRef.current = tilePath;

    // Remove existing source/layer before re-adding with new URL
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

    map.addSource(SOURCE_ID, {
      type: "raster",
      tiles: [tilePath],
      tileSize: 256,
    });

    map.addLayer({
      id: LAYER_ID,
      type: "raster",
      source: SOURCE_ID,
      paint: {
        "raster-opacity": 0.7,
      },
    });
  }, [map, manifest]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      currentPathRef.current = null;
    };
  }, [map]);

  return null;
}

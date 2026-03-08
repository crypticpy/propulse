/**
 * RadarLayer2D — RainViewer radar layer for the 2D MapLibre map.
 *
 * Uses RainViewer tiles (transparent backgrounds, designed for map overlays).
 * Single raster source showing the LATEST frame only — no animation.
 * Updates when the manifest refreshes (every ~10 minutes).
 *
 * NEXRAD tiles cannot be used in 2D because they have opaque white
 * backgrounds that cover the basemap entirely.
 *
 * Animation is handled only in the 3D globe view (WeatherRadarOverlay).
 */

import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { useWeatherRadar } from "@/hooks/useWeatherRadar";

interface RadarLayer2DProps {
  map: maplibregl.Map;
}

const RV_SOURCE = "rainviewer-radar";
const RV_LAYER = "rainviewer-radar-layer";

export function RadarLayer2D({ map }: RadarLayer2DProps) {
  const { manifest } = useWeatherRadar();
  const currentUrlRef = useRef<string | null>(null);

  /* ── RainViewer: latest frame, single source ─────────────────────── */
  useEffect(() => {
    if (!map.getStyle() || !manifest) return;

    const frames = manifest.radar.past;
    if (frames.length === 0) return;

    const latestFrame = frames[frames.length - 1];
    const tileUrl = `${manifest.host}${latestFrame.path}/256/{z}/{x}/{y}/6/1_1.png`;

    // Skip if same URL already displayed
    if (tileUrl === currentUrlRef.current) return;
    currentUrlRef.current = tileUrl;

    try {
      if (map.getLayer(RV_LAYER)) map.removeLayer(RV_LAYER);
      if (map.getSource(RV_SOURCE)) map.removeSource(RV_SOURCE);

      map.addSource(RV_SOURCE, {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
      });
      map.addLayer({
        id: RV_LAYER,
        type: "raster",
        source: RV_SOURCE,
        paint: { "raster-opacity": 0.7 },
      });
    } catch {
      // Map may be destroyed
    }
  }, [map, manifest]);

  /* ── Cleanup on unmount ─────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      try {
        if (map.getLayer(RV_LAYER)) map.removeLayer(RV_LAYER);
        if (map.getSource(RV_SOURCE)) map.removeSource(RV_SOURCE);
      } catch {
        // Map already destroyed
      }
      currentUrlRef.current = null;
    };
  }, [map]);

  return null;
}

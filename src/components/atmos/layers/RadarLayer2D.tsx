/**
 * RadarLayer2D — Dual-source animated radar layer for the 2D MapLibre map.
 *
 * Uses a SINGLE raster source per provider, swapping tile URLs on frame change.
 * This avoids creating 12 simultaneous sources which would each fetch tiles.
 *
 * Animation is driven by `radarFrame` from atmosStore (set by RadarScrubber2D).
 */

import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
import { useWeatherRadar } from "@/hooks/useWeatherRadar";
import { useAtmosStore } from "@/stores/atmosStore";
import {
  NEXRAD_FRAME_PRODUCTS,
  getNexradTileTemplate,
  NEXRAD_FRAME_COUNT,
} from "@/lib/api/nexrad";

interface RadarLayer2DProps {
  map: maplibregl.Map;
}

const NEXRAD_SOURCE = "nexrad-radar";
const NEXRAD_LAYER = "nexrad-radar-layer";
const RV_SOURCE = "rainviewer-global";
const RV_LAYER = "rainviewer-global-layer";

export function RadarLayer2D({ map }: RadarLayer2DProps) {
  const { manifest } = useWeatherRadar();
  const radarFrame = useAtmosStore((s) => s.radarFrame);
  const currentProductRef = useRef<string | null>(null);
  const rvPathRef = useRef<string | null>(null);

  /* ── NEXRAD: single source, swap URL on frame change ─────────── */
  useEffect(() => {
    if (!map.getStyle()) return;

    const frameIdx = radarFrame < 0 ? NEXRAD_FRAME_COUNT - 1 : radarFrame;
    const product = NEXRAD_FRAME_PRODUCTS[frameIdx];
    const template = getNexradTileTemplate(product);

    // Skip if same product already displayed
    if (template === currentProductRef.current) return;
    currentProductRef.current = template;

    // Remove old source+layer, add new one with updated URL
    try {
      if (map.getLayer(NEXRAD_LAYER)) map.removeLayer(NEXRAD_LAYER);
      if (map.getSource(NEXRAD_SOURCE)) map.removeSource(NEXRAD_SOURCE);

      map.addSource(NEXRAD_SOURCE, {
        type: "raster",
        tiles: [template],
        tileSize: 256,
      });
      map.addLayer({
        id: NEXRAD_LAYER,
        type: "raster",
        source: NEXRAD_SOURCE,
        paint: { "raster-opacity": 0.75 },
      });
    } catch {
      // Map may be destroyed
    }
  }, [map, radarFrame]);

  /* ── RainViewer: global fallback, update when manifest refreshes ── */
  useEffect(() => {
    if (!map.getStyle() || !manifest) return;

    const frames = manifest.radar.past;
    if (frames.length === 0) return;
    const latestFrame = frames[frames.length - 1];
    const rvTemplate = `${manifest.host}${latestFrame.path}/256/{z}/{x}/{y}/6/1_1.png`;

    if (rvTemplate === rvPathRef.current) return;
    rvPathRef.current = rvTemplate;

    try {
      if (map.getLayer(RV_LAYER)) map.removeLayer(RV_LAYER);
      if (map.getSource(RV_SOURCE)) map.removeSource(RV_SOURCE);

      map.addSource(RV_SOURCE, {
        type: "raster",
        tiles: [rvTemplate],
        tileSize: 256,
      });
      // Add BEFORE nexrad layer so it renders underneath
      const beforeLayer = map.getLayer(NEXRAD_LAYER) ? NEXRAD_LAYER : undefined;
      map.addLayer(
        {
          id: RV_LAYER,
          type: "raster",
          source: RV_SOURCE,
          paint: { "raster-opacity": 0.4 },
        },
        beforeLayer,
      );
    } catch {
      // Map may be destroyed
    }
  }, [map, manifest]);

  /* ── Cleanup on unmount ─────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      try {
        if (map.getLayer(NEXRAD_LAYER)) map.removeLayer(NEXRAD_LAYER);
        if (map.getSource(NEXRAD_SOURCE)) map.removeSource(NEXRAD_SOURCE);
        if (map.getLayer(RV_LAYER)) map.removeLayer(RV_LAYER);
        if (map.getSource(RV_SOURCE)) map.removeSource(RV_SOURCE);
      } catch {
        // Map already destroyed
      }
      currentProductRef.current = null;
      rvPathRef.current = null;
    };
  }, [map]);

  return null;
}

/**
 * RadarLayer2D — Dual-source animated radar layer for the 2D MapLibre map.
 *
 * Strategy: Pre-create all 12 NEXRAD raster sources + layers on mount.
 * Only toggle `raster-opacity` to animate (avoids re-fetching tiles).
 * RainViewer sits underneath at lower opacity for global fill.
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

/* ── Source / layer ID helpers ──────────────────────────────────────── */

const NEXRAD_SOURCE_ID = (i: number) => `nexrad-frame-${i}`;
const NEXRAD_LAYER_ID = (i: number) => `nexrad-frame-${i}-layer`;
const RV_SOURCE_ID = "rainviewer-global";
const RV_LAYER_ID = "rainviewer-global-layer";

const NEXRAD_ACTIVE_OPACITY = 0.75;
const RV_OPACITY = 0.4;

export function RadarLayer2D({ map }: RadarLayer2DProps) {
  const { manifest } = useWeatherRadar();
  const radarFrame = useAtmosStore((s) => s.radarFrame);
  const nexradMountedRef = useRef(false);
  const rvPathRef = useRef<string | null>(null);

  /* ── Mount: add NEXRAD sources + layers (manifest-independent) ──── */
  useEffect(() => {
    if (!map.getStyle() || nexradMountedRef.current) return;

    for (let i = 0; i < NEXRAD_FRAME_COUNT; i++) {
      const srcId = NEXRAD_SOURCE_ID(i);
      const layId = NEXRAD_LAYER_ID(i);
      const product = NEXRAD_FRAME_PRODUCTS[i];
      const template = getNexradTileTemplate(product);

      if (!map.getSource(srcId)) {
        map.addSource(srcId, {
          type: "raster",
          tiles: [template],
          tileSize: 256,
        });
        map.addLayer({
          id: layId,
          type: "raster",
          source: srcId,
          paint: { "raster-opacity": 0 },
        });
      }
    }

    nexradMountedRef.current = true;
  }, [map]);

  /* ── RainViewer: add/update when manifest arrives or refreshes ──── */
  useEffect(() => {
    if (!map.getStyle() || !manifest) return;

    const frames = manifest.radar.past;
    if (frames.length === 0) return;
    const latestFrame = frames[frames.length - 1];
    const rvTemplate = `${manifest.host}${latestFrame.path}/256/{z}/{x}/{y}/6/1_1.png`;

    // Skip if same frame already displayed
    if (rvTemplate === rvPathRef.current) return;
    rvPathRef.current = rvTemplate;

    // Re-create RainViewer source with updated tile URL
    try {
      if (map.getLayer(RV_LAYER_ID)) map.removeLayer(RV_LAYER_ID);
      if (map.getSource(RV_SOURCE_ID)) map.removeSource(RV_SOURCE_ID);

      map.addSource(RV_SOURCE_ID, {
        type: "raster",
        tiles: [rvTemplate],
        tileSize: 256,
      });
      map.addLayer({
        id: RV_LAYER_ID,
        type: "raster",
        source: RV_SOURCE_ID,
        paint: { "raster-opacity": RV_OPACITY },
      });
    } catch {
      // Map may be destroyed
    }
  }, [map, manifest]);

  /* ── Animate: toggle active NEXRAD frame opacity ────────────────── */
  useEffect(() => {
    if (!nexradMountedRef.current || !map.getStyle()) return;

    const activeIdx = radarFrame < 0 ? NEXRAD_FRAME_COUNT - 1 : radarFrame;

    for (let i = 0; i < NEXRAD_FRAME_COUNT; i++) {
      const layId = NEXRAD_LAYER_ID(i);
      try {
        if (map.getLayer(layId)) {
          map.setPaintProperty(
            layId,
            "raster-opacity",
            i === activeIdx ? NEXRAD_ACTIVE_OPACITY : 0,
          );
        }
      } catch {
        // Layer may not exist yet during initial render
      }
    }
  }, [map, radarFrame]);

  /* ── Cleanup on unmount ─────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      try {
        for (let i = 0; i < NEXRAD_FRAME_COUNT; i++) {
          const layId = NEXRAD_LAYER_ID(i);
          const srcId = NEXRAD_SOURCE_ID(i);
          if (map.getLayer(layId)) map.removeLayer(layId);
          if (map.getSource(srcId)) map.removeSource(srcId);
        }
        if (map.getLayer(RV_LAYER_ID)) map.removeLayer(RV_LAYER_ID);
        if (map.getSource(RV_SOURCE_ID)) map.removeSource(RV_SOURCE_ID);
      } catch {
        // Map already destroyed
      }
      nexradMountedRef.current = false;
      rvPathRef.current = null;
    };
  }, [map]);

  return null;
}

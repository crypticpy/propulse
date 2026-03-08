/**
 * RadarLayer2D — NEXRAD-only animated radar layer for the 2D MapLibre map.
 *
 * Uses IEM NEXRAD tiles (1km resolution, no rate limits, free).
 * Single raster source — swaps tile URL template on frame change.
 *
 * RainViewer is NOT used in 2D because MapLibre fetches tiles at the
 * viewport zoom level. At zoom 5-6, that's hundreds of tiles per frame,
 * which triggers RainViewer's aggressive 429 rate limits.
 *
 * Animation is driven by `radarFrame` from atmosStore (set by RadarScrubber2D).
 */

import { useEffect, useRef } from "react";
import type maplibregl from "maplibre-gl";
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

export function RadarLayer2D({ map }: RadarLayer2DProps) {
  const radarFrame = useAtmosStore((s) => s.radarFrame);
  const currentProductRef = useRef<string | null>(null);

  /* ── NEXRAD: single source, swap URL on frame change ─────────── */
  useEffect(() => {
    if (!map.getStyle()) return;

    const frameIdx = radarFrame < 0 ? NEXRAD_FRAME_COUNT - 1 : radarFrame;
    const product = NEXRAD_FRAME_PRODUCTS[frameIdx];
    if (!product) return;
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

  /* ── Cleanup on unmount ─────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      try {
        if (map.getLayer(NEXRAD_LAYER)) map.removeLayer(NEXRAD_LAYER);
        if (map.getSource(NEXRAD_SOURCE)) map.removeSource(NEXRAD_SOURCE);
      } catch {
        // Map already destroyed
      }
      currentProductRef.current = null;
    };
  }, [map]);

  return null;
}

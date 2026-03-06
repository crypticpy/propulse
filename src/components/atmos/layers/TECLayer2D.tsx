/**
 * TECLayer2D — Renders Total Electron Content grid data as a circle layer
 * on the 2D MapLibre map.
 *
 * Color scale (TECU):
 *   0   → blue   (#2266ff)  Low ionisation
 *  20   → green  (#22cc44)  Moderate
 *  40   → yellow (#ddcc00)  Elevated
 *  60   → orange (#ff6600)  High
 *  80+  → red    (#ff2222)  Very high
 */

import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useTEC } from "@/hooks/useTEC";

interface TECLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "tec-grid";
const LAYER_ID = "tec-circles";

export function TECLayer2D({ map }: TECLayer2DProps) {
  const { tecData } = useTEC();

  useEffect(() => {
    if (!tecData.available || tecData.grid.length === 0) {
      // Clean up if no data
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      return;
    }

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: tecData.grid.map((pt) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [pt.lon, pt.lat],
        },
        properties: { tec: pt.tec },
      })),
    };

    const source = map.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;

    if (source) {
      source.setData(geojson);
    } else {
      map.addSource(SOURCE_ID, { type: "geojson", data: geojson });
      map.addLayer({
        id: LAYER_ID,
        type: "circle",
        source: SOURCE_ID,
        paint: {
          "circle-radius": 8,
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "tec"],
            0,
            "#2266ff",
            20,
            "#22cc44",
            40,
            "#ddcc00",
            60,
            "#ff6600",
            80,
            "#ff2222",
          ],
          "circle-opacity": 0.4,
          "circle-blur": 0.5,
        },
      });
    }

    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map, tecData]);

  return null;
}

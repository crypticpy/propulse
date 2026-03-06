/**
 * FireLayer2D — Renders NASA FIRMS fire hotspots as GeoJSON circle markers
 * Color intensity and size scale with fire radiative power (FRP)
 */

import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useFires } from "@/hooks/useFires";
import type { FireHotspot } from "@/lib/api/fires";

interface FireLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "fire-hotspots";
const LAYER_ID = "fire-circles";

function hotspotsToGeoJSON(hotspots: FireHotspot[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: hotspots.map((h) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [h.lon, h.lat],
      },
      properties: {
        frp: h.frp,
        confidence: h.confidence,
        brightness: h.brightness,
      },
    })),
  };
}

export function FireLayer2D({ map }: FireLayer2DProps) {
  const { hotspots } = useFires();

  useEffect(() => {
    if (!map.getStyle()) return;
    const geojson = hotspotsToGeoJSON(hotspots);

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
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "frp"],
            0,
            3,
            50,
            6,
            200,
            10,
            500,
            14,
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "frp"],
            0,
            "#ff8c00",
            50,
            "#ff4500",
            200,
            "#dc143c",
          ],
          "circle-opacity": 0.75,
          "circle-blur": 0.2,
        },
      });
    }
  }, [map, hotspots]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // Map already destroyed
      }
    };
  }, [map]);

  return null;
}

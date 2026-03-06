/**
 * ShadowZoneLayer2D — Renders communications shadow zones as a fill layer
 *
 * Displays areas with neither VHF repeater nor NVIS HF coverage
 * as translucent red polygons on the MapLibre map. Renderless component.
 */

import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useShadowZones } from "@/hooks/useShadowZones";

interface ShadowZoneLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "shadow-zones-source";
const FILL_LAYER_ID = "shadow-zones-fill";
const OUTLINE_LAYER_ID = "shadow-zones-outline";

const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export function ShadowZoneLayer2D({ map }: ShadowZoneLayer2DProps) {
  const { shadowZones } = useShadowZones();

  // Update source data when shadow zones change
  useEffect(() => {
    const geojson = shadowZones ?? EMPTY_GEOJSON;

    const source = map.getSource(SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (source) {
      source.setData(geojson);
    } else {
      map.addSource(SOURCE_ID, { type: "geojson", data: geojson });
      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": "#ef4444",
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: OUTLINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#ef4444",
          "line-opacity": 0.3,
          "line-width": 0.5,
        },
      });
    }
  }, [map, shadowZones]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.getLayer(OUTLINE_LAYER_ID)) map.removeLayer(OUTLINE_LAYER_ID);
      if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  return null;
}

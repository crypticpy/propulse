/**
 * RiverGaugeLayer2D — Renders USGS river gauge markers as GeoJSON circles
 *
 * Color-coded by flood status: blue (normal) → yellow (action) → orange (minor)
 * → red (moderate) → dark red (major). Renderless component.
 */

import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useRiverGauges } from "@/hooks/useRiverGauges";
import type { RiverGauge } from "@/lib/api/gauges";

interface RiverGaugeLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "river-gauges";
const LAYER_ID = "river-gauge-markers";

const FLOOD_COLORS: Record<RiverGauge["floodStatus"], string> = {
  normal: "#3b82f6",
  action: "#eab308",
  minor: "#f97316",
  moderate: "#ef4444",
  major: "#dc2626",
};

function gaugesToGeoJSON(gauges: RiverGauge[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: gauges.map((g) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [g.lon, g.lat],
      },
      properties: {
        name: g.name,
        height: g.gageHeightFt,
        status: g.floodStatus,
        color: FLOOD_COLORS[g.floodStatus],
      },
    })),
  };
}

export function RiverGaugeLayer2D({ map }: RiverGaugeLayer2DProps) {
  const { gauges } = useRiverGauges();

  useEffect(() => {
    const geojson = gaugesToGeoJSON(gauges);

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
          "circle-radius": 5,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.85,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#1e3a5f",
        },
      });
    }
  }, [map, gauges]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  return null;
}

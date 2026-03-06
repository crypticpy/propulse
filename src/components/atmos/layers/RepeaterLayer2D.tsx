/**
 * RepeaterLayer2D — Renders nearby repeaters as GeoJSON circle markers
 * Only operational repeaters are shown. Purple markers match the repeater theme.
 */

import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useRepeaters } from "@/hooks/useRepeaters";
import type { Repeater } from "@/lib/api/repeaters";

interface RepeaterLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "repeaters";
const LAYER_ID = "repeater-markers";

function repeatersToGeoJSON(repeaters: Repeater[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: repeaters
      .filter((r) => r.operational)
      .map((r) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [r.lon, r.lat],
        },
        properties: {
          callsign: r.callsign,
          frequency: r.frequency,
          offset:
            r.offset > 0 ? `+${r.offset.toFixed(1)}` : r.offset.toFixed(1),
          tone: r.tone,
          mode: r.mode,
          city: r.city,
        },
      })),
  };
}

export function RepeaterLayer2D({ map }: RepeaterLayer2DProps) {
  const { repeaters } = useRepeaters();

  useEffect(() => {
    const geojson = repeatersToGeoJSON(repeaters);

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
          "circle-color": "#e879f9",
          "circle-opacity": 0.8,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#a21caf",
        },
      });
    }
  }, [map, repeaters]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  return null;
}

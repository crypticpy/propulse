/**
 * LightningLayer2D — Renders lightning strikes as GeoJSON circle markers
 * Strike radius scales with peak current (kA), styled with cyan glow
 */

import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useLightning } from "@/hooks/useLightning";
import type { LightningStrike } from "@/lib/api/lightning";

interface LightningLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "lightning-strikes";
const LAYER_ID = "lightning-circles";

function strikesToGeoJSON(
  strikes: LightningStrike[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: strikes.map((s) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [s.lon, s.lat],
      },
      properties: {
        kA: Math.abs(s.currentKA),
        time: s.time,
      },
    })),
  };
}

export function LightningLayer2D({ map }: LightningLayer2DProps) {
  const { strikes } = useLightning();

  useEffect(() => {
    const geojson = strikesToGeoJSON(strikes);

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
            ["get", "kA"],
            0,
            3,
            50,
            6,
            150,
            10,
          ],
          "circle-color": "#66ccff",
          "circle-opacity": 0.8,
          "circle-blur": 0.3,
        },
      });
    }
  }, [map, strikes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };
  }, [map]);

  return null;
}

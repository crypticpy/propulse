/**
 * SSTLayer2D — Renders NOAA OISST data as GeoJSON circle markers on the 2D map
 * Color scales from deep blue (cold) through cyan/green/yellow to red (warm)
 */

import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useSST } from "@/hooks/useSST";
import type { SSTDataPoint } from "@/lib/api/sst";

interface SSTLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "sst-data";
const LAYER_ID = "sst-circles";

function sstToGeoJSON(points: SSTDataPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [p.lon, p.lat],
      },
      properties: {
        sst: p.sst,
      },
    })),
  };
}

export function SSTLayer2D({ map }: SSTLayer2DProps) {
  const { data } = useSST();

  useEffect(() => {
    if (!map.getStyle()) return;
    const geojson = sstToGeoJSON(data);

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
            ["zoom"],
            1,
            4,
            4,
            6,
            8,
            10,
          ],
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "sst"],
            -2,
            "#001a80", // deep blue (very cold)
            5,
            "#00b3e6", // cyan (cool)
            15,
            "#1acc33", // green (temperate)
            22,
            "#e6e600", // yellow (warm)
            28,
            "#ff8000", // orange (tropical)
            35,
            "#e61a00", // red (extreme)
          ],
          "circle-opacity": 0.6,
          "circle-blur": 0.3,
        },
      });
    }
  }, [map, data]);

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

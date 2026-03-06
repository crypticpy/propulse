/**
 * TropicalCycloneLayer2D — Renders active tropical cyclones on the 2D MapLibre map
 * Shows storm position markers (circles), forecast track lines, and name labels
 */

import { useEffect } from "react";
import type maplibregl from "maplibre-gl";
import { useTropicalCyclones } from "@/hooks/useTropicalCyclones";
import type { TropicalCyclone, StormCategory } from "@/lib/api/tropical";

interface TropicalCycloneLayer2DProps {
  map: maplibregl.Map;
}

const POINT_SOURCE = "tropical-cyclone-points";
const POINT_LAYER = "tropical-cyclone-circles";
const TRACK_SOURCE = "tropical-cyclone-tracks";
const TRACK_LAYER = "tropical-cyclone-lines";
const LABEL_LAYER = "tropical-cyclone-labels";

function categoryToColor(cat: StormCategory): string {
  switch (cat) {
    case "TD":
      return "#3b82f6";
    case "TS":
      return "#eab308";
    case "1":
    case "2":
      return "#f97316";
    default:
      return "#ef4444";
  }
}

function categoryToRadius(cat: StormCategory): number {
  switch (cat) {
    case "TD":
      return 5;
    case "TS":
      return 7;
    case "1":
    case "2":
      return 10;
    default:
      return 13;
  }
}

function categoryLabel(cat: StormCategory): string {
  switch (cat) {
    case "TD":
      return "TD";
    case "TS":
      return "TS";
    default:
      return `Cat ${cat}`;
  }
}

function cyclonesToPointGeoJSON(
  cyclones: TropicalCyclone[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cyclones.map((c) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [c.lon, c.lat],
      },
      properties: {
        id: c.id,
        name: c.name,
        category: c.category,
        maxWind: c.maxWind,
        minPressure: c.minPressure,
        movement: c.movement,
        color: categoryToColor(c.category),
        radius: categoryToRadius(c.category),
        label: `${c.name} (${categoryLabel(c.category)})`,
      },
    })),
  };
}

function cyclonesToTrackGeoJSON(
  cyclones: TropicalCyclone[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cyclones
      .filter((c) => c.forecastTrack.length > 0)
      .map((c) => {
        // Prepend current position to forecast track
        const coords: [number, number][] = [
          [c.lon, c.lat],
          ...c.forecastTrack.map((fp) => [fp.lon, fp.lat] as [number, number]),
        ];

        return {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: coords,
          },
          properties: {
            id: c.id,
            name: c.name,
            color: categoryToColor(c.category),
          },
        };
      }),
  };
}

export function TropicalCycloneLayer2D({ map }: TropicalCycloneLayer2DProps) {
  const { cyclones } = useTropicalCyclones();

  // Sync data into sources, creating layers on first pass
  useEffect(() => {
    if (!map.getStyle()) return;

    const pointGeoJSON = cyclonesToPointGeoJSON(cyclones);
    const trackGeoJSON = cyclonesToTrackGeoJSON(cyclones);

    // --- Track source + layer (rendered behind points) ---
    const trackSource = map.getSource(TRACK_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (trackSource) {
      trackSource.setData(trackGeoJSON);
    } else {
      map.addSource(TRACK_SOURCE, { type: "geojson", data: trackGeoJSON });
      map.addLayer({
        id: TRACK_LAYER,
        type: "line",
        source: TRACK_SOURCE,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-opacity": 0.7,
          "line-dasharray": [4, 3],
        },
      });
    }

    // --- Point source + circle layer + label layer ---
    const pointSource = map.getSource(POINT_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (pointSource) {
      pointSource.setData(pointGeoJSON);
    } else {
      map.addSource(POINT_SOURCE, { type: "geojson", data: pointGeoJSON });

      // Circle markers
      map.addLayer({
        id: POINT_LAYER,
        type: "circle",
        source: POINT_SOURCE,
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.85,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Name + category labels
      map.addLayer({
        id: LABEL_LAYER,
        type: "symbol",
        source: POINT_SOURCE,
        layout: {
          "text-field": ["get", "label"],
          "text-size": 12,
          "text-offset": [0, -1.5],
          "text-anchor": "bottom",
          "text-font": ["Open Sans Bold"],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#000000",
          "text-halo-width": 1.5,
        },
      });
    }
  }, [map, cyclones]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (map.getLayer(LABEL_LAYER)) map.removeLayer(LABEL_LAYER);
        if (map.getLayer(POINT_LAYER)) map.removeLayer(POINT_LAYER);
        if (map.getLayer(TRACK_LAYER)) map.removeLayer(TRACK_LAYER);
        if (map.getSource(POINT_SOURCE)) map.removeSource(POINT_SOURCE);
        if (map.getSource(TRACK_SOURCE)) map.removeSource(TRACK_SOURCE);
      } catch {
        // Map already destroyed
      }
    };
  }, [map]);

  return null;
}

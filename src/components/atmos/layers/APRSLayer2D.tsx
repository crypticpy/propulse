/**
 * APRSLayer2D — Renders nearby APRS stations as GeoJSON circle markers
 * Green markers differentiate from repeater purple. Click popup shows station details.
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useAPRSStations } from "@/hooks/useAPRSStations";
import type { APRSStation } from "@/lib/api/aprs";

interface APRSLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "aprs-stations-source";
const LAYER_ID = "aprs-stations-layer";

function stationsToGeoJSON(stations: APRSStation[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [s.lon, s.lat],
      },
      properties: {
        name: s.name,
        comment: s.comment,
        lastTime: s.lastTime,
        speed: s.speed,
        course: s.course,
        path: s.path,
        symbol: s.symbol,
      },
    })),
  };
}

function formatLastHeard(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function APRSLayer2D({ map }: APRSLayer2DProps) {
  const { stations } = useAPRSStations();
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Update source data when stations change
  useEffect(() => {
    const geojson = stationsToGeoJSON(stations);

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
          "circle-radius": 4,
          "circle-color": "#22c55e",
          "circle-opacity": 0.8,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#15803d",
        },
      });
    }
  }, [map, stations]);

  // Click handler for popups
  useEffect(() => {
    const handleClick = (
      e: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [LAYER_ID],
      });
      if (features.length === 0) return;

      const props = features[0].properties;
      if (!props) return;

      // Close existing popup
      if (popupRef.current) {
        popupRef.current.remove();
      }

      const coords = (
        features[0].geometry as GeoJSON.Point
      ).coordinates.slice() as [number, number];

      const name = String(props.name ?? "");
      const comment = String(props.comment ?? "");
      const lastTime = String(props.lastTime ?? "");
      const speed =
        props.speed != null && props.speed !== "" && props.speed !== "null"
          ? Number(props.speed)
          : null;

      let details = "";
      if (comment)
        details += `<div style="color: #ccc; margin-top: 2px;">${comment}</div>`;
      details += `<div style="color: #aaa; font-size: 11px; margin-top: 4px;">Last heard: ${formatLastHeard(lastTime)}</div>`;
      if (speed != null && speed > 0) {
        details += `<div style="color: #aaa; font-size: 11px;">Speed: ${speed} km/h</div>`;
      }

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "240px",
        className: "atmos-aprs-popup",
      })
        .setLngLat(coords)
        .setHTML(
          `<div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #e0e0e0; background: #111; padding: 8px; border-radius: 6px; border: 1px solid #22c55e;">
            <div style="font-weight: 700; color: #22c55e; margin-bottom: 2px;">${name}</div>
            ${details}
          </div>`,
        )
        .addTo(map);
    };

    map.on("click", LAYER_ID, handleClick);

    // Pointer cursor on hover
    const handleEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("mouseenter", LAYER_ID, handleEnter);
    map.on("mouseleave", LAYER_ID, handleLeave);

    return () => {
      map.off("click", LAYER_ID, handleClick);
      map.off("mouseenter", LAYER_ID, handleEnter);
      map.off("mouseleave", LAYER_ID, handleLeave);
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [map]);

  return null;
}

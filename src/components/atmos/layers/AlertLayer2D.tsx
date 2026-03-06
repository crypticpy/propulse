/**
 * AlertLayer2D — Renders NWS weather alerts as colored circle markers
 * Color-coded by severity with click-to-popup for alert details
 */

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import type { WeatherAlert } from "@/lib/api/weather";

interface AlertLayer2DProps {
  map: maplibregl.Map;
}

const SOURCE_ID = "nws-alerts";
const LAYER_ID = "nws-alert-circles";

/** Severity-to-color mapping */
const SEVERITY_COLORS: Record<WeatherAlert["severity"], string> = {
  Extreme: "#ff0040",
  Severe: "#ff6600",
  Moderate: "#ffaa00",
  Minor: "#ffdd44",
  Unknown: "#888888",
};

function alertsToGeoJSON(alerts: WeatherAlert[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: alerts.map((a) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [a.lon, a.lat],
      },
      properties: {
        id: a.id,
        event: a.event,
        headline: a.headline,
        severity: a.severity,
        areaDesc: a.areaDesc,
        color: SEVERITY_COLORS[a.severity] ?? "#888888",
      },
    })),
  };
}

export function AlertLayer2D({ map }: AlertLayer2DProps) {
  const { alerts } = useWeatherAlerts();
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Update data
  useEffect(() => {
    if (!map.getStyle()) return;
    const geojson = alertsToGeoJSON(alerts);

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
          "circle-radius": 7,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.6,
        },
      });
    }
  }, [map, alerts]);

  // Click handler for popups
  useEffect(() => {
    if (!map.getStyle()) return;
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
      const severity = props.severity as string;
      const color =
        SEVERITY_COLORS[severity as WeatherAlert["severity"]] ?? "#888";

      popupRef.current = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "320px",
        className: "atmos-alert-popup",
      })
        .setLngLat(coords)
        .setHTML(
          `<div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #e0e0e0; background: #111; padding: 8px; border-radius: 6px; border: 1px solid ${color};">
            <div style="font-weight: 700; color: ${color}; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">${severity}</div>
            <div style="font-weight: 600; margin-bottom: 4px;">${props.event}</div>
            <div style="color: #aaa; font-size: 11px; line-height: 1.4;">${props.headline}</div>
            <div style="color: #666; font-size: 10px; margin-top: 6px; border-top: 1px solid #333; padding-top: 4px;">${props.areaDesc}</div>
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
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // Map already destroyed
      }
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
    };
  }, [map]);

  return null;
}

/**
 * AtlasView — Main 2D MapLibre GL map container for AtmosPulse
 * Renders the dark basemap with conditionally visible data layers
 */

import { useRef, useEffect, useState } from "react";
import maplibregl, { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import cspWorkerUrl from "maplibre-gl/dist/maplibre-gl-csp-worker.js?url";

// Use dedicated CSP worker to avoid blob-based worker breakage in production builds
setWorkerUrl(cspWorkerUrl);
import { useAtmosStore } from "@/stores/atmosStore";
import { DARK_BASEMAP_STYLE } from "@/lib/atmos/mapStyles";
import { RadarLayer2D } from "@/components/atmos/layers/RadarLayer2D";
import { RadarScrubber2D } from "@/components/atmos/RadarScrubber2D";
import { LightningLayer2D } from "@/components/atmos/layers/LightningLayer2D";
import { AlertLayer2D } from "@/components/atmos/layers/AlertLayer2D";
import { FireLayer2D } from "@/components/atmos/layers/FireLayer2D";
import { TECLayer2D } from "@/components/atmos/layers/TECLayer2D";
import { GOESCloudLayer2D } from "@/components/atmos/layers/GOESCloudLayer2D";
import { RepeaterLayer2D } from "@/components/atmos/layers/RepeaterLayer2D";
import { RiverGaugeLayer2D } from "@/components/atmos/layers/RiverGaugeLayer2D";
import { APRSLayer2D } from "@/components/atmos/layers/APRSLayer2D";
import { ShadowZoneLayer2D } from "@/components/atmos/layers/ShadowZoneLayer2D";
import { TropicalCycloneLayer2D } from "@/components/atmos/layers/TropicalCycloneLayer2D";
import { SSTLayer2D } from "@/components/atmos/layers/SSTLayer2D";

export function AtlasView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapCenter = useAtmosStore((s) => s.mapCenter);
  const setMapCenter = useAtmosStore((s) => s.setMapCenter);
  const layerVisibility = useAtmosStore((s) => s.layerVisibility);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_BASEMAP_STYLE,
      center: [mapCenter.lon, mapCenter.lat],
      zoom: mapCenter.zoom,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      "top-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    map.on("load", () => {
      setMapReady(true);
    });

    // Sync map position back to store (debounced)
    let moveTimer: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        const center = map.getCenter();
        setMapCenter({
          lat: center.lat,
          lon: center.lng,
          zoom: map.getZoom(),
        });
      }, 300);
    });

    mapRef.current = map;

    return () => {
      clearTimeout(moveTimer);
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />
      {mapReady && mapRef.current && (
        <>
          {layerVisibility.radar && <RadarLayer2D map={mapRef.current} />}
          {layerVisibility.lightning && (
            <LightningLayer2D map={mapRef.current} />
          )}
          {layerVisibility.alerts && <AlertLayer2D map={mapRef.current} />}
          {layerVisibility.fires && <FireLayer2D map={mapRef.current} />}
          {layerVisibility.tec && <TECLayer2D map={mapRef.current} />}
          {layerVisibility.goesCloud && (
            <GOESCloudLayer2D map={mapRef.current} />
          )}
          {layerVisibility.repeaters && (
            <RepeaterLayer2D map={mapRef.current} />
          )}
          {layerVisibility.riverGauges && (
            <RiverGaugeLayer2D map={mapRef.current} />
          )}
          {layerVisibility.aprs && <APRSLayer2D map={mapRef.current} />}
          {layerVisibility.shadowZones && (
            <ShadowZoneLayer2D map={mapRef.current} />
          )}
          {layerVisibility.tropical && (
            <TropicalCycloneLayer2D map={mapRef.current} />
          )}
          {layerVisibility.sst && <SSTLayer2D map={mapRef.current} />}
        </>
      )}
      {layerVisibility.radar && <RadarScrubber2D />}
    </div>
  );
}

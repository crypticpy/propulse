import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  MAP_RENDERER_HANDOFF_MS,
  buildGlobeFallbackStyle,
} from "@/lib/map/mapExplorerStyle";
import { ALL_PROVIDERS } from "@/lib/tiles/providers";

interface SatelliteGlobeFallbackProps {
  className?: string;
}

/** Free Esri globe used when Google Photorealistic 3D tiles are not configured. */
export function SatelliteGlobeFallback({
  className = "",
}: SatelliteGlobeFallbackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const provider = ALL_PROVIDERS["esri-world"];

  useEffect(() => {
    if (!containerRef.current) return;
    let map: maplibregl.Map | undefined;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled || !containerRef.current) return;
      try {
        map = new maplibregl.Map({
          container: containerRef.current,
          style: buildGlobeFallbackStyle(provider, provider.nativeMaxZoom),
          center: [0, 18],
          zoom: 1.6,
          maxZoom: provider.nativeMaxZoom,
          attributionControl: false,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 1.75),
        });
        map.setProjection({ type: "globe" });
        map.on("load", () => map?.resize());
        map.on("error", () => {
          /* Tile misses are expected at the poles; constructor success is enough. */
        });
      } catch {
        setFailed(true);
      }
    }, MAP_RENDERER_HANDOFF_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      map?.remove();
    };
  }, [provider]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center bg-deep-space px-6 text-center text-sm text-gray-400">
        The fallback globe could not start in this graphics context.
      </div>
    );
  }

  return <div ref={containerRef} className={`absolute inset-0 ${className}`} />;
}

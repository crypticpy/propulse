import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ImageryAttribution } from "@/components/map/ImageryAttribution";
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
  const errorBurstRef = useRef({ count: 0, lastAt: 0 });
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
        map.on("load", () => {
          errorBurstRef.current = { count: 0, lastAt: 0 };
          map?.resize();
        });
        map.on("sourcedata", (event) => {
          if (event.sourceId === "basemap" && event.isSourceLoaded) {
            errorBurstRef.current = { count: 0, lastAt: 0 };
          }
        });
        map.on("error", () => {
          const now = Date.now();
          const current = errorBurstRef.current;
          const count = now - current.lastAt > 5_000 ? 1 : current.count + 1;
          errorBurstRef.current = { count, lastAt: now };
          if (count >= 3) setFailed(true);
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

  return (
    <>
      <div ref={containerRef} className={`absolute inset-0 ${className}`} />
      {failed ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-deep-space px-6 text-center text-sm text-gray-400">
          The fallback globe could not load imagery.
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-3 left-3 z-20">
          <ImageryAttribution provider={provider} className="self-start" />
        </div>
      )}
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LayoutModeDropdown } from "@/components/map/LayoutModeDropdown";
import { ImageryAttribution } from "@/components/map/ImageryAttribution";
import { useMapStore } from "@/stores/mapStore";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useProfileStore } from "@/stores/profileStore";
import { ALL_PROVIDERS, selectTileProvider } from "@/lib/tiles/providers";
import type { TileProviderConfig } from "@/lib/tiles/types";
import {
  DISPLAY_QUALITY_OPTIONS,
  resolveDisplayQuality,
} from "@/lib/map/displayQuality";
import { getAccessToken } from "@/lib/api/authFetch";

type ExplorerStyle = "satellite" | "light" | "dark" | "contrast";

const REGIONS = [
  { label: "World", center: [0, 18] as [number, number], zoom: 1.5 },
  {
    label: "Continental US",
    center: [-98.5, 39.5] as [number, number],
    zoom: 3.4,
  },
  { label: "Europe", center: [15, 50] as [number, number], zoom: 3.5 },
  { label: "Japan", center: [138, 37] as [number, number], zoom: 4.4 },
] as const;

function numberParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function explorerProvider(
  style: ExplorerStyle,
  subscriptionTier: "free" | "pro",
  forceFallback: boolean,
): TileProviderConfig {
  if (style === "satellite") {
    return forceFallback
      ? ALL_PROVIDERS["esri-world"]
      : selectTileProvider("satellite", subscriptionTier);
  }
  if (style === "dark") return ALL_PROVIDERS["carto-dark"];
  return ALL_PROVIDERS.osm;
}

function buildStyle(
  provider: TileProviderConfig,
  style: ExplorerStyle,
  maxZoom: number,
): StyleSpecification {
  return {
    version: 8,
    name: `PropSphere ${style}`,
    sources: {
      basemap: {
        type: "raster",
        tiles: [provider.url],
        tileSize: provider.tileSize,
        minzoom: 0,
        maxzoom: maxZoom,
        attribution: provider.attribution,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": style === "light" ? "#dce9ee" : "#050914",
        },
      },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        minzoom: 0,
        maxzoom: maxZoom,
        paint:
          style === "contrast"
            ? {
                "raster-saturation": -1,
                "raster-contrast": 0.75,
                "raster-brightness-min": 0.05,
                "raster-brightness-max": 0.95,
              }
            : { "raster-fade-duration": 180 },
      },
    ],
  };
}

/** Dedicated MapLibre regional explorer for provider-native deep zoom. */
export default function MapExplorerPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const errorCountRef = useRef(0);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialViewRef = useRef({
    lat: Math.max(-85, Math.min(85, numberParam(searchParams.get("lat"), 39.5))),
    lon: Math.max(
      -180,
      Math.min(180, numberParam(searchParams.get("lon"), -98.5)),
    ),
    zoom: Math.max(0, Math.min(22, numberParam(searchParams.get("z"), 3.4))),
  });
  const initialStyle = searchParams.get("style");
  const [style, setStyle] = useState<ExplorerStyle>(
    initialStyle === "light" ||
      initialStyle === "dark" ||
      initialStyle === "contrast"
      ? initialStyle
      : "satellite",
  );
  const [forceFallback, setForceFallback] = useState(false);
  const [authToken, setAuthToken] = useState<string | null | undefined>();
  const [ready, setReady] = useState(false);

  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const setDisplayQuality = useDisplayQualityStore(
    (s) => s.setDisplayQuality,
  );
  const setMapStyle = useMapStore((s) => s.setMapStyle);
  const quality = resolveDisplayQuality(displayQuality);
  const provider = useMemo(
    () => explorerProvider(style, subscriptionTier, forceFallback),
    [forceFallback, style, subscriptionTier],
  );
  const maxZoom =
    quality.effective === "data-saver"
      ? Math.min(12, provider.nativeMaxZoom)
      : provider.nativeMaxZoom;

  useEffect(() => {
    let cancelled = false;
    if (!provider.requiresAuth) {
      setAuthToken(null);
      return;
    }
    setAuthToken(undefined);
    void getAccessToken().then((token) => {
      if (!cancelled) setAuthToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  useEffect(() => {
    if (!containerRef.current || authToken === undefined) return;
    const absoluteUrl = provider.url.startsWith("/")
      ? `${window.location.origin}${provider.url}`
      : provider.url;
    const initial = initialViewRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle({ ...provider, url: absoluteUrl }, style, maxZoom),
      center: [initial.lon, initial.lat],
      zoom: Math.min(initial.zoom, maxZoom),
      maxZoom,
      attributionControl: false,
      pixelRatio: Math.min(
        window.devicePixelRatio || 1,
        quality.maxDevicePixelRatio,
      ),
      transformRequest: (url) =>
        authToken && url.includes("/api/tiles/proxy")
          ? { url, headers: { Authorization: `Bearer ${authToken}` } }
          : { url },
    });
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      "bottom-right",
    );
    map.on("load", () => {
      map.resize();
      setReady(true);
    });
    map.on("moveend", () => {
      const center = map.getCenter();
      initialViewRef.current = {
        lat: center.lat,
        lon: center.lng,
        zoom: map.getZoom(),
      };
      const next = new URLSearchParams(window.location.search);
      next.set("lat", center.lat.toFixed(5));
      next.set("lon", center.lng.toFixed(5));
      next.set("z", map.getZoom().toFixed(2));
      next.set("style", style);
      setSearchParams(next, { replace: true });
    });
    map.on("error", () => {
      if (!provider.requiresPro) return;
      errorCountRef.current += 1;
      if (errorCountRef.current >= 3) setForceFallback(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [
    authToken,
    maxZoom,
    provider,
    quality.maxDevicePixelRatio,
    setSearchParams,
    style,
  ]);

  const selectStyle = (nextStyle: ExplorerStyle) => {
    errorCountRef.current = 0;
    setStyle(nextStyle);
    setForceFallback(false);
    setMapStyle(nextStyle === "satellite" ? "satellite" : "standard");
  };

  const flyToRegion = (region: (typeof REGIONS)[number]) => {
    mapRef.current?.flyTo({
      center: region.center,
      zoom: region.zoom,
      duration: 1200,
      essential: true,
    });
  };

  return (
    <div className="relative h-[calc(100dvh-4rem)] min-h-[520px] overflow-hidden bg-deep-space">
      <div ref={containerRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute top-3 right-3 left-3 z-20 flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-void-black/85 p-2 shadow-xl backdrop-blur-md">
          <LayoutModeDropdown activeDestination="explorer" />
          <div className="h-6 w-px bg-white/10" />
          {(["satellite", "light", "dark", "contrast"] as const).map(
            (option) => (
              <button
                key={option}
                type="button"
                onClick={() => selectStyle(option)}
                className={`rounded-lg px-2.5 py-1.5 text-xs capitalize transition-colors ${
                  style === option
                    ? "bg-plasma-orange text-white"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {option}
              </button>
            ),
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/15 bg-void-black/85 p-2 shadow-xl backdrop-blur-md">
          {DISPLAY_QUALITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              title={option.description}
              onClick={() => setDisplayQuality(option.id)}
              className={`rounded px-2 py-1.5 text-[10px] ${
                displayQuality === option.id
                  ? "bg-cosmic-cyan/20 text-cosmic-cyan"
                  : "text-gray-500 hover:bg-white/10 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex flex-col gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-void-black/80 p-2 backdrop-blur-md">
          {REGIONS.map((region) => (
            <button
              key={region.label}
              type="button"
              onClick={() => flyToRegion(region)}
              className="rounded-lg px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/10 hover:text-white"
            >
              {region.label}
            </button>
          ))}
        </div>
        <ImageryAttribution provider={provider} className="self-start" />
      </div>

      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-deep-space">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-plasma-orange border-t-transparent" />
            <p className="mt-3 text-sm text-gray-400">
              Resolving regional imagery…
            </p>
          </div>
        </div>
      )}

      {forceFallback && (
        <div className="absolute top-20 left-1/2 z-30 -translate-x-1/2 rounded-lg border border-amber-400/30 bg-amber-400/15 px-3 py-2 text-xs text-amber-400">
          HD provider unavailable. Continuing with Esri World Imagery.
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate("/map")}
        className="absolute right-14 bottom-3 z-20 rounded-lg border border-white/15 bg-void-black/80 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white"
      >
        Return to PropSphere
      </button>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ImageryAttribution } from "@/components/map/ImageryAttribution";
import { LayoutModeDropdown } from "@/components/map/LayoutModeDropdown";
import { getAccessToken } from "@/lib/api/authFetch";
import {
  DISPLAY_QUALITY_OPTIONS,
} from "@/lib/map/displayQuality";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";
import { selectAvailableTileProvider } from "@/lib/tiles/providers";
import {
  buildExplorerStyle,
  resolveExplorerProvider,
  type ExplorerStyle,
} from "@/lib/map/mapExplorerStyle";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useMapStore } from "@/stores/mapStore";
import { useKioskStore } from "@/stores/kioskStore";
import type { KioskHeaderScale } from "@/stores/kioskStore";
import { useProfileStore } from "@/stores/profileStore";

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

export const MAP_EXPLORER_AUTH_REFRESH_MS = 15 * 60 * 1000;

const KIOSK_VIEWPORT_HEIGHT_CLASSES: Record<KioskHeaderScale, string> = {
  compact: "h-[calc(100dvh-2.5rem)]",
  standard: "h-[calc(100dvh-3rem)]",
  large: "h-[calc(100dvh-4rem)]",
};

function numberParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Dedicated MapLibre regional explorer for provider-native deep zoom. */
export default function MapExplorerPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const errorBurstRef = useRef({ count: 0, lastAt: 0 });
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
  const [failedProviderIds, setFailedProviderIds] = useState<readonly string[]>(
    [],
  );
  const [authToken, setAuthToken] = useState<string | null | undefined>();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [mapboxFeedbackUrl, setMapboxFeedbackUrl] = useState(() => {
    const initial = initialViewRef.current;
    return `https://apps.mapbox.com/feedback/#/${initial.lon}/${initial.lat}/${initial.zoom}`;
  });

  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const setDisplayQuality = useDisplayQualityStore((s) => s.setDisplayQuality);
  const setMapStyle = useMapStore((s) => s.setMapStyle);
  const setLayoutMode = useMapStore((s) => s.setLayoutMode);
  const kioskActive = useKioskStore((s) => s.active);
  const kioskHeaderScale = useKioskStore(
    (s) => s.presentation.headerScale,
  );
  const stopKiosk = useKioskStore((s) => s.stop);
  const quality = useResolvedDisplayQuality(displayQuality);
  const requestedProvider = useMemo(
    () => resolveExplorerProvider(style, subscriptionTier),
    [style, subscriptionTier],
  );
  const provider = useMemo(
    () =>
      selectAvailableTileProvider(
        requestedProvider,
        new Set(failedProviderIds),
      ),
    [failedProviderIds, requestedProvider],
  );
  const usingFallback =
    provider !== null && provider.id !== requestedProvider.id;
  const maxZoom =
    quality.effective === "data-saver"
      ? Math.min(12, provider?.nativeMaxZoom ?? 12)
      : (provider?.nativeMaxZoom ?? 22);

  const retryProviders = useCallback(() => {
    errorBurstRef.current = { count: 0, lastAt: 0 };
    setFailedProviderIds([]);
    setLoadError(null);
    setRetryNonce((value) => value + 1);
  }, []);

  const exit = useCallback(() => {
    stopKiosk();
    setLayoutMode("normal");
    navigate("/map");
  }, [navigate, setLayoutMode, stopKiosk]);

  useEffect(() => {
    let cancelled = false;
    if (!provider) {
      authTokenRef.current = null;
      setAuthToken(null);
      return;
    }
    if (!provider.requiresAuth) {
      authTokenRef.current = null;
      setAuthToken(null);
      return;
    }
    setAuthToken(undefined);
    const refreshToken = async (initial: boolean) => {
      const token = await getAccessToken();
      if (cancelled) return;
      authTokenRef.current = token;
      if (initial) setAuthToken(token);
      if (!token) {
        setFailedProviderIds((current) =>
          current.includes(provider.id) ? current : [...current, provider.id],
        );
      }
    };
    void refreshToken(true);
    const intervalId = window.setInterval(
      () => void refreshToken(false),
      MAP_EXPLORER_AUTH_REFRESH_MS,
    );
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [provider]);

  useEffect(() => {
    if (
      !containerRef.current ||
      !provider ||
      authToken === undefined ||
      (provider.requiresAuth && !authToken)
    ) {
      return;
    }
    const absoluteUrl = provider.url.startsWith("/")
      ? `${window.location.origin}${provider.url}`
      : provider.url;
    const initial = initialViewRef.current;
    errorBurstRef.current = { count: 0, lastAt: 0 };
    setLoadError(null);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: buildExplorerStyle(
          { ...provider, url: absoluteUrl },
          style,
          maxZoom,
        ),
        center: [initial.lon, initial.lat],
        zoom: Math.min(initial.zoom, maxZoom),
        maxZoom,
        attributionControl: false,
        pixelRatio: Math.min(
          quality.renderDevicePixelRatio,
          quality.maxDevicePixelRatio,
        ),
        transformRequest: (url) =>
          authTokenRef.current && url.includes("/api/tiles/proxy")
            ? {
                url,
                headers: {
                  Authorization: `Bearer ${authTokenRef.current}`,
                },
              }
            : { url },
      });
    } catch {
      setLoadError(
        "The deep-zoom renderer could not start in this browser or graphics context.",
      );
      return;
    }
    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      "bottom-right",
    );
    map.on("load", () => {
      map.resize();
      errorBurstRef.current = { count: 0, lastAt: 0 };
      setReady(true);
    });
    map.on("sourcedata", (event) => {
      if (event.sourceId === "basemap" && event.isSourceLoaded) {
        errorBurstRef.current = { count: 0, lastAt: 0 };
      }
    });
    map.on("moveend", () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      initialViewRef.current = {
        lat: center.lat,
        lon: center.lng,
        zoom,
      };
      setMapboxFeedbackUrl(
        `https://apps.mapbox.com/feedback/#/${center.lng.toFixed(5)}/${center.lat.toFixed(5)}/${zoom.toFixed(2)}`,
      );
      const next = new URLSearchParams(window.location.search);
      next.set("lat", center.lat.toFixed(5));
      next.set("lon", center.lng.toFixed(5));
      next.set("z", zoom.toFixed(2));
      next.set("style", style);
      setSearchParams(next, { replace: true });
    });
    map.on("error", () => {
      const now = Date.now();
      const current = errorBurstRef.current;
      const count = now - current.lastAt > 5_000 ? 1 : current.count + 1;
      errorBurstRef.current = { count, lastAt: now };
      if (count >= 3) {
        setFailedProviderIds((current) =>
          current.includes(provider.id) ? current : [...current, provider.id],
        );
      }
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
    quality.renderDevicePixelRatio,
    retryNonce,
    setSearchParams,
    style,
  ]);

  useEffect(() => {
    mapRef.current?.resize();
  }, [kioskActive, kioskHeaderScale]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exit]);

  const selectStyle = (nextStyle: ExplorerStyle) => {
    errorBurstRef.current = { count: 0, lastAt: 0 };
    setStyle(nextStyle);
    setFailedProviderIds([]);
    setLoadError(null);
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
    <div
      data-testid="map-explorer-viewport"
      data-kiosk-header-scale={kioskActive ? kioskHeaderScale : "normal"}
      className={`relative min-h-0 overflow-hidden bg-deep-space ${
        kioskActive
          ? KIOSK_VIEWPORT_HEIGHT_CLASSES[kioskHeaderScale]
          : "h-[calc(100dvh-4rem)]"
      }`}
    >
      <div ref={containerRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute top-3 right-3 left-3 z-20 flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-void-black/85 p-2 shadow-xl backdrop-blur-md">
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

        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-white/15 bg-void-black/85 p-2 shadow-xl backdrop-blur-md">
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

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-11rem)] flex-col gap-2">
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
        {provider && (
          <ImageryAttribution
            provider={provider}
            mapboxFeedbackUrl={mapboxFeedbackUrl}
            className="self-start"
          />
        )}
      </div>

      {!ready && provider && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-deep-space">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-plasma-orange border-t-transparent" />
            <p className="mt-3 text-sm text-gray-400">
              Resolving regional imagery…
            </p>
          </div>
        </div>
      )}

      {usingFallback && (
        <div className="absolute top-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/15 px-3 py-2 text-xs text-amber-300">
          <span>
            HD provider unavailable. Continuing with Esri&apos;s de-clouded
            world mosaic.
          </span>
          <button
            type="button"
            onClick={retryProviders}
            className="rounded border border-amber-300/30 px-2 py-1 text-[10px] hover:bg-amber-300/10"
          >
            Retry HD
          </button>
        </div>
      )}

      {(!provider || loadError) && (
        <div className="absolute top-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/15 px-3 py-2 text-xs text-red-200">
          <span>
            {loadError ??
              `${requestedProvider.name} and its configured fallback are unavailable.`} {" "}
            Try another style or return to PropSphere.
          </span>
          <button
            type="button"
            onClick={retryProviders}
            className="rounded border border-red-200/30 px-2 py-1 text-[10px] hover:bg-red-200/10"
          >
            Try again
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={exit}
        className="absolute right-14 bottom-3 z-20 rounded-lg border border-white/15 bg-void-black/80 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white"
      >
        Return to PropSphere
      </button>
    </div>
  );
}

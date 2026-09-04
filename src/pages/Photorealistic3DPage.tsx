import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LayoutModeDropdown } from "@/components/map/LayoutModeDropdown";
import { SatelliteGlobeFallback } from "@/components/map/SatelliteGlobeFallback";
import { authHeaders } from "@/lib/api/authFetch";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";
import {
  getPhotorealistic3DConfig,
  photorealisticFallbackMessage,
  shouldAttemptGooglePhotorealistic,
  supportsPhotorealistic3D,
} from "@/lib/map/photorealistic3d";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";

const PhotorealisticGoogleTiles = lazy(
  () => import("@/components/map/PhotorealisticGoogleTiles"),
);

interface PhotorealisticChromeProps {
  label?: string;
  onExit: () => void;
}

function PhotorealisticChrome({ label, onExit }: PhotorealisticChromeProps) {
  return (
    <>
      <div className="absolute top-3 left-3 z-20 flex max-w-[calc(100%-10rem)] flex-wrap items-center gap-2">
        <LayoutModeDropdown activeDestination="photorealistic" />
        {label && (
          <div className="rounded-lg border border-white/15 bg-black/65 px-3 py-2 backdrop-blur-md">
            <span className="text-xs text-white">Photorealistic 3D</span>
            <span className="ml-2 text-[9px] uppercase tracking-wider text-amber-300">
              Experimental · {label}
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onExit}
        className="absolute top-3 right-3 z-20 rounded-lg border border-white/15 bg-black/65 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white"
      >
        Exit to PropSphere
      </button>
    </>
  );
}

function CrashToFallback({ onCrash }: { onCrash: () => void }) {
  useEffect(() => {
    onCrash();
  }, [onCrash]);
  return (
    <div className="flex h-full items-center justify-center bg-black">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-cosmic-cyan border-t-transparent" />
    </div>
  );
}

/** Experimental Google Photorealistic 3D, with a free Esri globe fallback. */
export default function Photorealistic3DPage() {
  const navigate = useNavigate();
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const stopKiosk = useKioskStore((s) => s.stop);
  const setLayoutMode = useMapStore((s) => s.setLayoutMode);
  const quality = useResolvedDisplayQuality(displayQuality);
  const config = useMemo(() => getPhotorealistic3DConfig(), []);
  const attemptGoogle = shouldAttemptGooglePhotorealistic(
    subscriptionTier,
    config,
  );
  const supported = useMemo(() => supportsPhotorealistic3D(), []);
  const [apiKey, setApiKey] = useState<string | null | undefined>(
    attemptGoogle ? undefined : null,
  );
  const [keyError, setKeyError] = useState<string | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const exit = useCallback(() => {
    stopKiosk();
    setLayoutMode("normal");
    navigate("/map");
  }, [navigate, setLayoutMode, stopKiosk]);

  const openExplorer = useCallback(() => {
    stopKiosk();
    setLayoutMode("normal");
    navigate("/map/explorer");
  }, [navigate, setLayoutMode, stopKiosk]);

  const retry = useCallback(() => {
    setGoogleFailed(false);
    setApiKey(undefined);
    setKeyError(null);
    setRetryNonce((value) => value + 1);
  }, []);

  const handleGoogleCrash = useCallback(() => {
    setGoogleFailed(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exit]);

  useEffect(() => {
    if (!attemptGoogle) {
      setApiKey(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const response = await fetch("/api/tiles/google-key", {
          headers,
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          apiKey?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !payload.apiKey) {
          setApiKey(null);
          setKeyError(payload.error ?? "Google provider key is unavailable.");
          return;
        }
        setApiKey(payload.apiKey);
      } catch {
        if (!cancelled) {
          setApiKey(null);
          setKeyError("Google provider configuration could not be loaded.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptGoogle, retryNonce]);

  const useGoogle =
    Boolean(apiKey) && supported && !googleFailed && attemptGoogle;
  const showRetry =
    attemptGoogle &&
    !useGoogle &&
    apiKey !== undefined &&
    supported &&
    (googleFailed || apiKey === null);
  const fallbackBanner = photorealisticFallbackMessage({
    googleFailed,
    webglSupported: supported,
    attemptedGoogle: attemptGoogle,
  });

  const errorTarget =
    quality.effective === "extreme"
      ? 8
      : quality.effective === "uhd"
        ? 12
        : quality.effective === "data-saver"
          ? 28
          : 18;
  const pixelRatio = Math.min(
    quality.renderDevicePixelRatio,
    config.maxDevicePixelRatio,
  );

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden bg-black">
      {useGoogle && apiKey ? (
        <ErrorBoundary fallback={<CrashToFallback onCrash={handleGoogleCrash} />}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cosmic-cyan border-t-transparent" />
              </div>
            }
          >
            <PhotorealisticGoogleTiles
              apiKey={apiKey}
              errorTarget={errorTarget}
              pixelRatio={pixelRatio}
              onRootLoadError={handleGoogleCrash}
            />
          </Suspense>
        </ErrorBoundary>
      ) : apiKey === undefined ? (
        <div className="flex h-full items-center justify-center bg-deep-space">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cosmic-cyan border-t-transparent" />
            <p className="mt-3 text-sm text-gray-400">
              Verifying metered 3D access…
            </p>
          </div>
        </div>
      ) : (
        <SatelliteGlobeFallback />
      )}

      <PhotorealisticChrome
        label={useGoogle ? quality.label : "Fallback"}
        onExit={exit}
      />

      {useGoogle ? (
        <>
          <div className="pointer-events-none absolute bottom-0 left-0 z-20 px-[10px] pt-[10px] pb-[5px]">
            <img
              src="/google-maps-logo-light-outline.svg"
              alt="Google Maps"
              width="105"
              height="22"
              className="h-[18px] w-auto"
            />
          </div>
          <span className="absolute top-16 right-3 z-20 rounded bg-black/60 px-2 py-1 text-[10px] text-gray-400">
            Metered provider · GPU cap {pixelRatio.toFixed(1)}×
          </span>
        </>
      ) : apiKey !== undefined ? (
        <div className="absolute top-16 right-3 z-20 flex max-w-sm flex-col items-end gap-2">
          <span className="rounded bg-black/60 px-2 py-1 text-[10px] text-caution-amber">
            {fallbackBanner}
          </span>
          {keyError && (
            <span className="rounded bg-black/60 px-2 py-1 text-[10px] text-gray-400">
              {keyError}
            </span>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {showRetry && (
              <button
                type="button"
                onClick={retry}
                className="rounded-lg border border-cosmic-cyan/40 bg-cosmic-cyan/15 px-3 py-1.5 text-xs text-cosmic-cyan hover:bg-cosmic-cyan/25"
              >
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={openExplorer}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:text-white"
            >
              Open 2D Explorer
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

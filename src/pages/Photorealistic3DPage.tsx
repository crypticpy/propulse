import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  GlobeControls,
  TilesAttributionOverlay,
  TilesPlugin,
  TilesRenderer,
} from "3d-tiles-renderer/r3f";
import { GoogleCloudAuthPlugin } from "3d-tiles-renderer/plugins";
import { useNavigate } from "react-router-dom";
import { LayoutModeDropdown } from "@/components/map/LayoutModeDropdown";
import { authHeaders } from "@/lib/api/authFetch";
import { useResolvedDisplayQuality } from "@/hooks/useResolvedDisplayQuality";
import {
  getPhotorealistic3DConfig,
  supportsPhotorealistic3D,
} from "@/lib/map/photorealistic3d";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useKioskStore } from "@/stores/kioskStore";
import { useMapStore } from "@/stores/mapStore";
import { useProfileStore } from "@/stores/profileStore";

interface PhotorealisticChromeProps {
  label?: string;
  onExit: () => void;
}

function PhotorealisticChrome({
  label,
  onExit,
}: PhotorealisticChromeProps) {
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

function UnavailableView({
  reason,
  onExit,
  onOpenExplorer,
  onRetry,
}: {
  reason: string;
  onExit: () => void;
  onOpenExplorer: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-deep-space p-6">
      <PhotorealisticChrome onExit={onExit} />
      <div className="max-w-lg rounded-2xl border border-white/10 bg-void-black/85 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-xl text-amber-300">
          3D
        </div>
        <h1 className="font-orbitron text-xl text-white">
          Photorealistic 3D is unavailable
        </h1>
        <p className="mt-3 text-sm text-gray-400">{reason}</p>
        <p className="mt-3 text-xs text-gray-500">
          Satellite Globe and Deep-Zoom Map remain fully available and do not
          depend on Google.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-cosmic-cyan/40 bg-cosmic-cyan/15 px-4 py-2 text-cosmic-cyan hover:bg-cosmic-cyan/25"
            >
              Try again
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-plasma-orange/40 bg-plasma-orange/20 px-4 py-2 text-plasma-orange"
          >
            Open Satellite Globe
          </button>
          <button
            type="button"
            onClick={onOpenExplorer}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-gray-300 hover:text-white"
          >
            Open 2D Explorer
          </button>
        </div>
      </div>
    </div>
  );
}

/** Experimental, isolated Google Photorealistic 3D Tiles presentation. */
export default function Photorealistic3DPage() {
  const navigate = useNavigate();
  const subscriptionTier = useProfileStore((s) => s.subscriptionTier);
  const displayQuality = useDisplayQualityStore((s) => s.displayQuality);
  const stopKiosk = useKioskStore((s) => s.stop);
  const setLayoutMode = useMapStore((s) => s.setLayoutMode);
  const quality = useResolvedDisplayQuality(displayQuality);
  const config = useMemo(() => getPhotorealistic3DConfig(), []);
  const supported = useMemo(() => supportsPhotorealistic3D(), []);
  const [providerSessionFailed, setProviderSessionFailed] = useState(false);
  const [apiKey, setApiKey] = useState<string | null | undefined>();
  const [keyError, setKeyError] = useState<string | null>(null);
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
    setProviderSessionFailed(false);
    setApiKey(undefined);
    setKeyError(null);
    setRetryNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exit]);

  useEffect(() => {
    if (subscriptionTier !== "pro" || !config.enabled) return;
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
  }, [config.enabled, retryNonce, subscriptionTier]);

  if (subscriptionTier !== "pro") {
    return (
      <UnavailableView
        onExit={exit}
        onOpenExplorer={openExplorer}
        reason="This experimental provider is limited to Pro accounts because every 3D tile consumes metered quota."
      />
    );
  }
  if (!config.enabled) {
    return (
      <UnavailableView
        onExit={exit}
        onOpenExplorer={openExplorer}
        reason={
          config.unavailableReason ?? "Provider configuration is incomplete."
        }
      />
    );
  }
  if (apiKey === null) {
    return (
      <UnavailableView
        onExit={exit}
        onOpenExplorer={openExplorer}
        onRetry={retry}
        reason={keyError ?? "Provider configuration is incomplete."}
      />
    );
  }
  if (!supported) {
    return (
      <UnavailableView
        onExit={exit}
        onOpenExplorer={openExplorer}
        reason="This browser or GPU does not expose the WebGL features needed for photorealistic 3D tiles."
      />
    );
  }
  if (providerSessionFailed) {
    return (
      <UnavailableView
        onExit={exit}
        onOpenExplorer={openExplorer}
        onRetry={retry}
        reason="Google tiles could not be loaded. The key, quota, network, or provider may be unavailable."
      />
    );
  }
  if (apiKey === undefined) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-deep-space">
        <PhotorealisticChrome onExit={exit} />
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cosmic-cyan border-t-transparent" />
          <p className="mt-3 text-sm text-gray-400">
            Verifying metered 3D access…
          </p>
        </div>
      </div>
    );
  }

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
      <Canvas
        dpr={[1, pixelRatio]}
        camera={{ position: [0, 0, 1e8], near: 1, far: 1e10 }}
      >
        <TilesRenderer
          key={apiKey}
          errorTarget={errorTarget}
          onLoadTileSet={() => setProviderSessionFailed(false)}
          onLoadError={(event) => {
            // Individual detail tiles can legitimately fail while the user
            // moves. Only a root/session failure should eject a working view.
            if (event.tile === null) setProviderSessionFailed(true);
          }}
        >
          <TilesPlugin
            plugin={GoogleCloudAuthPlugin}
            args={
              {
                apiToken: apiKey,
                autoRefreshToken: true,
                useRecommendedSettings: false,
              } as any // eslint-disable-line @typescript-eslint/no-explicit-any
            }
          />
          <GlobeControls />
          <TilesAttributionOverlay
            style={{
              left: "auto",
              right: 0,
              zIndex: 10,
              maxWidth: "calc(100vw - 145px)",
              textAlign: "right",
              background: "rgba(0, 0, 0, 0.55)",
            }}
          />
        </TilesRenderer>
      </Canvas>

      <PhotorealisticChrome label={quality.label} onExit={exit} />
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
    </div>
  );
}

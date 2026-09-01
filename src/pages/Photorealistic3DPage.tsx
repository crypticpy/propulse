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
import { useProfileStore } from "@/stores/profileStore";
import { useDisplayQualityStore } from "@/stores/displayQualityStore";
import { useKioskStore } from "@/stores/kioskStore";
import { resolveDisplayQuality } from "@/lib/map/displayQuality";
import {
  getPhotorealistic3DConfig,
  supportsPhotorealistic3D,
} from "@/lib/map/photorealistic3d";
import { authHeaders } from "@/lib/api/authFetch";

const ERROR_LIMIT = 5;

function UnavailableView({ reason }: { reason: string }) {
  const navigate = useNavigate();
  const isKiosk = useKioskStore((s) => s.active);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-deep-space p-6">
      {!isKiosk && (
        <div className="absolute top-3 left-3">
          <LayoutModeDropdown activeDestination="photorealistic" />
        </div>
      )}
      <div className="max-w-lg rounded-2xl border border-white/10 bg-void-black/85 p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-xl text-amber-400">
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
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/map")}
            className="rounded-lg border border-plasma-orange/40 bg-plasma-orange/20 px-4 py-2 text-plasma-orange"
          >
            Open Satellite Globe
          </button>
          <button
            type="button"
            onClick={() => navigate("/map/explorer")}
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
  const isKiosk = useKioskStore((s) => s.active);
  const quality = resolveDisplayQuality(displayQuality);
  const config = useMemo(() => getPhotorealistic3DConfig(), []);
  const supported = useMemo(() => supportsPhotorealistic3D(), []);
  const [loadErrors, setLoadErrors] = useState(0);
  const [apiKey, setApiKey] = useState<string | null | undefined>();
  const [keyError, setKeyError] = useState<string | null>(null);

  const exit = useCallback(() => navigate("/map"), [navigate]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isKiosk) exit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exit, isKiosk]);

  useEffect(() => {
    if (subscriptionTier !== "pro" || !config.enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const headers = await authHeaders();
        const response = await fetch("/api/tiles/google-key", { headers });
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
  }, [config.enabled, subscriptionTier]);

  if (subscriptionTier !== "pro") {
    return (
      <UnavailableView reason="This experimental provider is limited to Pro accounts because every 3D tile consumes metered quota." />
    );
  }
  if (!config.enabled) {
    return (
      <UnavailableView
        reason={
          config.unavailableReason ?? "Provider configuration is incomplete."
        }
      />
    );
  }
  if (apiKey === null) {
    return (
      <UnavailableView
        reason={keyError ?? "Provider configuration is incomplete."}
      />
    );
  }
  if (!supported) {
    return (
      <UnavailableView reason="This browser or GPU does not expose the WebGL features needed for photorealistic 3D tiles." />
    );
  }
  if (loadErrors >= ERROR_LIMIT) {
    return (
      <UnavailableView reason="Google tiles could not be loaded. The key, quota, network, or provider may be unavailable." />
    );
  }
  if (apiKey === undefined) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-deep-space">
        {!isKiosk && (
          <div className="absolute top-3 left-3">
            <LayoutModeDropdown activeDestination="photorealistic" />
          </div>
        )}
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
    quality.maxDevicePixelRatio,
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
          onLoadError={() => setLoadErrors((count) => count + 1)}
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
              maxWidth: "70vw",
              textAlign: "right",
              background: "rgba(0, 0, 0, 0.55)",
            }}
          />
        </TilesRenderer>
      </Canvas>

      {!isKiosk && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <LayoutModeDropdown activeDestination="photorealistic" />
          <div className="rounded-lg border border-white/15 bg-black/65 px-3 py-2 backdrop-blur-md">
            <span className="text-xs text-white">Photorealistic 3D</span>
            <span className="ml-2 text-[9px] uppercase tracking-wider text-amber-400">
              Experimental · {quality.label}
            </span>
          </div>
        </div>
      )}

      {!isKiosk && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <span className="rounded bg-black/60 px-2 py-1 text-[10px] text-gray-400">
            Metered provider · GPU cap {pixelRatio.toFixed(1)}×
          </span>
          <button
            type="button"
            onClick={exit}
            className="rounded-lg border border-white/15 bg-black/65 px-3 py-2 text-xs text-gray-300 hover:bg-white/10 hover:text-white"
          >
            Exit to Satellite
          </button>
        </div>
      )}
    </div>
  );
}

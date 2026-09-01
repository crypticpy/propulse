import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  useKioskStore,
  type KioskHeaderScale,
  type KioskScene,
} from "@/stores/kioskStore";
import { useAlertsStore } from "@/stores/alertsStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUserStore } from "@/stores/userStore";
import { useWakeLock } from "@/hooks/useWakeLock";
import { KioskQr } from "@/components/kiosk/KioskQr";
import { LayoutModeDropdown } from "@/components/map/LayoutModeDropdown";
import { shouldDimWallDisplay } from "@/lib/kiosk/wallPresentation";
import type { SolarAlert } from "@/types/alerts";

async function applySceneToMap(scene: KioskScene): Promise<void> {
  const module = await import("@/lib/kiosk/applySceneToMap");
  module.applySceneToMap(scene);
}

const CONTROLS_HIDE_MS = 4000;
const HEADER_SIZE_CLASSES: Record<KioskHeaderScale, string> = {
  compact: "h-10 px-3",
  standard: "h-12 px-4",
  large: "h-16 px-6",
};
const HEADER_CLOCK_CLASSES: Record<KioskHeaderScale, string> = {
  compact: "text-xl",
  standard: "text-2xl",
  large: "text-3xl",
};
const HEADER_SCENE_CLASSES: Record<KioskHeaderScale, string> = {
  compact: "text-xs",
  standard: "text-sm",
  large: "text-base",
};
const CONTROLS_TOP_CLASSES: Record<KioskHeaderScale, string> = {
  compact: "top-12",
  standard: "top-14",
  large: "top-[4.5rem]",
};

/**
 * KioskChrome - the wall-display shell rendered by Layout instead of the
 * normal header while kiosk mode is active.
 *
 * Owns the kiosk runtime: big clock strip, scene rotation timer, wake lock,
 * alert break-in takeover, and the pointer-revealed exit/step controls.
 */
export function KioskChrome() {
  const navigate = useNavigate();
  const location = useLocation();

  const scenes = useKioskStore((s) => s.scenes);
  const rotation = useKioskStore((s) => s.rotation);
  const breakInLevel = useKioskStore((s) => s.breakInLevel);
  const presentation = useKioskStore((s) => s.presentation);
  const activeSceneId = useKioskStore((s) => s.activeSceneId);
  const advance = useKioskStore((s) => s.advance);
  const stop = useKioskStore((s) => s.stop);

  const [paused, setPaused] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [transitionVisible, setTransitionVisible] = useState(false);
  const [ambientNow, setAmbientNow] = useState(() => new Date());
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const station = useUserStore((state) => state.station);

  useWakeLock(true);

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) ?? null,
    [scenes, activeSceneId],
  );
  const enabledScenes = useMemo(
    () => scenes.filter((scene) => scene.enabled !== false),
    [scenes],
  );
  const nightDimmed = useMemo(
    () =>
      shouldDimWallDisplay(
        presentation.autoNightDim,
        station,
        ambientNow,
      ),
    [presentation.autoNightDim, station, ambientNow],
  );

  // Sunset changes slowly, so a minute cadence is ample and avoids adding
  // another one-second subscription to every wall scene.
  useEffect(() => {
    const timer = setInterval(() => setAmbientNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Alert break-in: highest-priority active alert at or above the threshold
  const alerts = useAlertsStore((s) => s.alerts);
  const dismissAlert = useAlertsStore((s) => s.dismissAlert);
  const breakInAlert = useMemo<SolarAlert | null>(() => {
    if (breakInLevel === "off") return null;
    const qualifying = alerts.filter(
      (a) =>
        a.status === "ACTIVE" &&
        (a.priority === "CRITICAL" ||
          (breakInLevel === "WARNING" && a.priority === "WARNING")),
    );
    return (
      qualifying.find((a) => a.priority === "CRITICAL") ?? qualifying[0] ?? null
    );
  }, [alerts, breakInLevel]);

  const goToScene = useCallback(
    (direction: 1 | -1) => {
      const scene = advance(direction);
      if (!scene) return;
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (scene.transition === "cut" || reduceMotion) {
        void applySceneToMap(scene).then(() => navigate(scene.route));
        return;
      }

      transitionTimers.current.forEach(clearTimeout);
      transitionTimers.current = [];
      setTransitionVisible(true);
      transitionTimers.current.push(
        setTimeout(() => {
          void applySceneToMap(scene).then(() => navigate(scene.route));
        }, 210),
        setTimeout(() => setTransitionVisible(false), 420),
      );
    },
    [advance, navigate],
  );

  // On mount/resume (e.g. daily kiosk-browser reload), restore the active scene
  useEffect(() => {
    if (activeScene && location.pathname !== activeScene.route) {
      void applySceneToMap(activeScene).then(() =>
        navigate(activeScene.route),
      );
    }
    // Intentionally mount-only: mid-session route changes are made by the
    // rotation engine itself and must not re-trigger a restore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotation engine — paused manually or while an alert takeover is showing
  useEffect(() => {
    if (
      !rotation.enabled ||
      paused ||
      breakInAlert ||
      enabledScenes.length < 2
    ) {
      return;
    }
    const timer = setTimeout(
      () => goToScene(1),
      (activeScene?.durationSec ?? rotation.intervalSec) * 1000,
    );
    return () => clearTimeout(timer);
  }, [
    rotation.enabled,
    rotation.intervalSec,
    paused,
    breakInAlert,
    enabledScenes.length,
    activeScene?.durationSec,
    goToScene,
  ]);

  useEffect(
    () => () => {
      transitionTimers.current.forEach(clearTimeout);
    },
    [],
  );

  const exitKiosk = useCallback(() => {
    stop();
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    navigate("/kiosk");
  }, [stop, navigate]);

  // Reveal controls on pointer activity; Escape exits
  useEffect(() => {
    const reveal = () => {
      setControlsVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(
        () => setControlsVisible(false),
        CONTROLS_HIDE_MS,
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitKiosk();
      else reveal();
    };
    window.addEventListener("pointermove", reveal);
    window.addEventListener("pointerdown", reveal);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", reveal);
      window.removeEventListener("pointerdown", reveal);
      window.removeEventListener("keydown", onKeyDown);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [exitKiosk]);

  return (
    <>
      {/* Dim page content after QTH sunset while keeping controls and alert
          break-ins crisp above this layer. */}
      <div
        className={`pointer-events-none fixed inset-0 z-[500] bg-black transition-opacity duration-1000 ${
          nightDimmed ? "opacity-[0.45]" : "opacity-0"
        }`}
        aria-hidden="true"
        data-night-dimmed={nightDimmed}
      />

      <KioskClockBar
        sceneName={activeScene?.name ?? ""}
        sceneIndex={enabledScenes.findIndex((s) => s.id === activeSceneId)}
        sceneCount={enabledScenes.length}
        rotating={rotation.enabled && !paused && enabledScenes.length > 1}
        headerScale={presentation.headerScale}
        slashedZero={presentation.slashedZero}
      />

      <div
        className={`pointer-events-none fixed inset-0 z-[510] bg-black transition-opacity duration-200 ${
          transitionVisible ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />

      {/* Pointer-revealed controls */}
      <div
        className={`fixed right-4 z-[520] flex items-center gap-2 transition-opacity duration-300 ${CONTROLS_TOP_CLASSES[presentation.headerScale]} ${
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <LayoutModeDropdown
          align="right"
          className="bg-void-black/80 backdrop-blur-md rounded-lg"
        />
        <button
          onClick={() => goToScene(-1)}
          className="px-3 py-1.5 rounded-lg bg-void-black/80 border border-white/15 text-gray-200 hover:bg-white/10 text-sm font-mono"
          aria-label="Previous scene"
        >
          ‹
        </button>
        <button
          onClick={() => setPaused((p) => !p)}
          className="px-3 py-1.5 rounded-lg bg-void-black/80 border border-white/15 text-gray-200 hover:bg-white/10 text-sm font-mono"
          aria-label={paused ? "Resume rotation" : "Pause rotation"}
        >
          {paused ? "▶" : "❚❚"}
        </button>
        <button
          onClick={() => goToScene(1)}
          className="px-3 py-1.5 rounded-lg bg-void-black/80 border border-white/15 text-gray-200 hover:bg-white/10 text-sm font-mono"
          aria-label="Next scene"
        >
          ›
        </button>
        <button
          onClick={exitKiosk}
          className="px-3 py-1.5 rounded-lg bg-plasma-orange/20 border border-plasma-orange/40 text-plasma-orange hover:bg-plasma-orange/30 text-sm font-medium"
        >
          Exit wall
        </button>
      </div>

      {/* Corner QR — pull this view up on a phone */}
      <KioskQr />

      {/* Alert break-in takeover */}
      {breakInAlert && (
        <div
          className="fixed inset-0 z-[700] flex items-center justify-center bg-void-black/85 backdrop-blur-sm"
          role="alertdialog"
          aria-label={breakInAlert.title}
        >
          <div
            className={`max-w-3xl mx-6 p-10 rounded-2xl border-2 text-center ${
              breakInAlert.priority === "CRITICAL"
                ? "border-alert-red bg-alert-red/10 animate-pulse"
                : "border-caution-amber bg-caution-amber/10"
            }`}
          >
            <div
              className={`font-mono text-sm tracking-[0.3em] uppercase mb-4 ${
                breakInAlert.priority === "CRITICAL"
                  ? "text-alert-red"
                  : "text-caution-amber"
              }`}
            >
              {breakInAlert.priority} ALERT
            </div>
            <h1 className="font-orbitron text-4xl text-white mb-4">
              {breakInAlert.title}
            </h1>
            <p className="text-xl text-gray-300 mb-8">{breakInAlert.message}</p>
            <button
              onClick={() => dismissAlert(breakInAlert.id)}
              className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 font-medium"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}
    </>
  );
}

interface KioskClockBarProps {
  sceneName: string;
  sceneIndex: number;
  sceneCount: number;
  rotating: boolean;
  headerScale: KioskHeaderScale;
  slashedZero: boolean;
}

function KioskClockBar({
  sceneName,
  sceneIndex,
  sceneCount,
  rotating,
  headerScale,
  slashedZero,
}: KioskClockBarProps) {
  const hour12 = useSettingsStore((s) => s.timeFormat !== "24h");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const utc = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  const local = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  });
  const date = now.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  const numeralClass = slashedZero ? "font-slashed-zero" : "tabular-nums";

  return (
    <div
      className={`relative z-[510] flex items-center justify-between bg-void-black/70 backdrop-blur border-b border-white/10 select-none ${HEADER_SIZE_CLASSES[headerScale]}`}
    >
      <div className="flex items-baseline gap-3 font-mono">
        <span className={`${HEADER_CLOCK_CLASSES[headerScale]} ${numeralClass} text-white`}>
          {utc}
        </span>
        <span className="text-xs text-plasma-orange tracking-widest">UTC</span>
        <span className={`text-sm text-gray-400 ${numeralClass}`}>
          {local} local
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className={`font-orbitron text-gray-200 tracking-wide ${HEADER_SCENE_CLASSES[headerScale]}`}>
          {sceneName}
        </span>
        {sceneCount > 1 && (
          <span className="flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: sceneCount }, (_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${
                  i === sceneIndex
                    ? "bg-plasma-orange"
                    : rotating
                      ? "bg-white/25"
                      : "bg-white/10"
                }`}
              />
            ))}
          </span>
        )}
      </div>

      <div className="font-mono text-sm text-gray-400">{date}</div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useKioskStore,
  applySceneToMap,
  KIOSK_ROUTES,
  type BreakInLevel,
  type KioskScene,
} from "@/stores/kioskStore";
import type { LayoutMode, PresetName } from "@/stores/mapStore";

const LAYOUT_MODES: LayoutMode[] = ["normal", "pro", "lite", "hamclock"];
const PRESETS: Array<PresetName | ""> = [
  "",
  "dx-hunter",
  "contest",
  "vhf",
  "emergency",
  "science",
];

const inputClass =
  "bg-deep-space border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-plasma-orange/60";

/**
 * KioskPage - configure and launch wall-display kiosk mode.
 *
 * Kiosk devices (Pi, Fire TV, mini PC) point their browser at /kiosk?start=1
 * to boot straight into rotation; interactive users configure scenes here
 * and press Start.
 */
export function KioskPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const scenes = useKioskStore((s) => s.scenes);
  const rotation = useKioskStore((s) => s.rotation);
  const breakInLevel = useKioskStore((s) => s.breakInLevel);
  const addScene = useKioskStore((s) => s.addScene);
  const removeScene = useKioskStore((s) => s.removeScene);
  const setRotation = useKioskStore((s) => s.setRotation);
  const setBreakInLevel = useKioskStore((s) => s.setBreakInLevel);
  const start = useKioskStore((s) => s.start);

  const [newName, setNewName] = useState("");
  const [newRoute, setNewRoute] = useState<string>(KIOSK_ROUTES[0].route);
  const [newLayout, setNewLayout] = useState<LayoutMode>("hamclock");
  const [newPreset, setNewPreset] = useState<PresetName | "">("");
  const [newAutoRotate, setNewAutoRotate] = useState(false);

  const launch = (sceneId?: string, requestFullscreen = true) => {
    const scene = start(sceneId);
    if (!scene) return;
    applySceneToMap(scene);
    if (requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
    navigate(scene.route);
  };

  // Device autostart contract: /kiosk?start=1 (kiosk browsers are already
  // fullscreen, and a fullscreen request without a user gesture would fail).
  // Optional &scene=<id> picks the starting scene.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (searchParams.get("start") === "1" && !autoStarted.current) {
      autoStarted.current = true;
      launch(searchParams.get("scene") ?? undefined, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleAddScene = () => {
    const name = newName.trim();
    if (!name) return;
    const scene: Omit<KioskScene, "id"> = {
      name,
      route: newRoute,
      ...(newRoute === "/map" && {
        map: {
          layoutMode: newLayout,
          ...(newPreset && { preset: newPreset }),
          autoRotate: newAutoRotate,
        },
      }),
    };
    addScene(scene);
    setNewName("");
  };

  const routeLabel = (route: string) =>
    KIOSK_ROUTES.find((r) => r.route === route)?.label ?? route;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="font-orbitron text-2xl text-white mb-1">Kiosk Mode</h1>
        <p className="text-sm text-gray-400 max-w-xl">
          Turn this screen into a wall display: scenes rotate on a timer,
          critical alerts break through, and the screen stays awake. Press{" "}
          <span className="font-mono text-gray-300">Esc</span> anytime to exit.
        </p>
      </div>

      {/* Scenes */}
      <section className="bg-deep-space/60 border border-white/10 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider mb-3">
          Scenes
        </h2>
        <ul className="space-y-2 mb-4">
          {scenes.map((scene) => (
            <li
              key={scene.id}
              className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2"
            >
              <button
                onClick={() => launch(scene.id)}
                className="w-8 h-8 rounded-lg bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 flex items-center justify-center shrink-0"
                title={`Start kiosk at ${scene.name}`}
                aria-label={`Start kiosk at ${scene.name}`}
              >
                ▶
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">{scene.name}</div>
                <div className="text-xs text-gray-500 font-mono">
                  {routeLabel(scene.route)}
                  {scene.map && ` · ${scene.map.layoutMode}`}
                  {scene.map?.preset && ` · ${scene.map.preset}`}
                  {scene.map?.autoRotate && " · auto-rotate"}
                </div>
              </div>
              {scenes.length > 1 && (
                <button
                  onClick={() => removeScene(scene.id)}
                  className="text-gray-500 hover:text-alert-red text-sm px-2"
                  aria-label={`Remove scene ${scene.name}`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* Add scene */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New scene name"
            className={`${inputClass} flex-1 min-w-[140px]`}
          />
          <select
            value={newRoute}
            onChange={(e) => setNewRoute(e.target.value)}
            className={inputClass}
            aria-label="Scene page"
          >
            {KIOSK_ROUTES.map((r) => (
              <option key={r.route} value={r.route}>
                {r.label}
              </option>
            ))}
          </select>
          {newRoute === "/map" && (
            <>
              <select
                value={newLayout}
                onChange={(e) => setNewLayout(e.target.value as LayoutMode)}
                className={inputClass}
                aria-label="Map layout"
              >
                {LAYOUT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={newPreset}
                onChange={(e) =>
                  setNewPreset(e.target.value as PresetName | "")
                }
                className={inputClass}
                aria-label="Layer preset"
              >
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p === "" ? "keep layers" : p}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-gray-400">
                <input
                  type="checkbox"
                  checked={newAutoRotate}
                  onChange={(e) => setNewAutoRotate(e.target.checked)}
                  className="accent-plasma-orange"
                />
                auto-rotate
              </label>
            </>
          )}
          <button
            onClick={handleAddScene}
            disabled={!newName.trim()}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-sm text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add scene
          </button>
        </div>
      </section>

      {/* Rotation + alerts */}
      <section className="bg-deep-space/60 border border-white/10 rounded-xl p-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={rotation.enabled}
            onChange={(e) => setRotation({ enabled: e.target.checked })}
            className="accent-plasma-orange"
          />
          Rotate scenes every
          <input
            type="number"
            min={15}
            max={3600}
            value={rotation.intervalSec}
            onChange={(e) =>
              setRotation({ intervalSec: Number(e.target.value) })
            }
            className={`${inputClass} w-20 text-center`}
            aria-label="Rotation interval in seconds"
          />
          seconds
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-300">
          Alert break-in:
          <select
            value={breakInLevel}
            onChange={(e) => setBreakInLevel(e.target.value as BreakInLevel)}
            className={inputClass}
          >
            <option value="CRITICAL">Critical only</option>
            <option value="WARNING">Warning and up</option>
            <option value="off">Off</option>
          </select>
        </label>
      </section>

      {/* Launch */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <button
          onClick={() => launch()}
          className="px-6 py-3 rounded-xl bg-plasma-orange/20 border border-plasma-orange/40 text-plasma-orange hover:bg-plasma-orange/30 font-orbitron tracking-wide"
        >
          Start Kiosk
        </button>
        <p className="text-xs text-gray-500 font-mono">
          Dedicated device? Point its browser at{" "}
          <span className="text-gray-300">
            {window.location.origin}/kiosk?start=1
          </span>
        </p>
      </div>
    </div>
  );
}

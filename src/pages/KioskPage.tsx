import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  useKioskStore,
  KIOSK_ROUTES,
  isKioskMapRoute,
  kioskSceneSupportsLiveClouds,
  type BreakInLevel,
  type KioskHeaderScale,
  type KioskScene,
  type KioskTransition,
} from "@/stores/kioskStore";
import { applySceneToMap } from "@/lib/kiosk/applySceneToMap";
import {
  useMapStore,
  type LayoutMode,
  type MapStyle,
  type PresetName,
  type ViewMode,
} from "@/stores/mapStore";
import {
  useDisplayQualityStore,
  type DisplayQuality,
} from "@/stores/displayQualityStore";
import { useThemeStore } from "@/stores/themeStore";
import type { ThemeId } from "@/lib/themes";
import { useUserStore } from "@/stores/userStore";
import { LaunchWallSection } from "@/components/kiosk/LaunchWallSection";
import { DISPLAY_QUALITY_OPTIONS } from "@/lib/map/displayQuality";

const LAYOUT_MODES: LayoutMode[] = ["normal", "pro", "lite", "hamclock"];
const VIEW_MODES: ViewMode[] = ["globe", "flat", "azimuthal"];
const MAP_STYLES: MapStyle[] = ["satellite", "standard"];
const THEMES: ThemeId[] = ["light", "dark", "midnight", "high-contrast"];
const PRESETS: Array<PresetName | ""> = [
  "",
  "dx-hunter",
  "contest",
  "vhf",
  "emergency",
  "science",
];
const HEADER_SCALES: ReadonlyArray<{
  value: KioskHeaderScale;
  label: string;
}> = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "large", label: "Large" },
];

const inputClass =
  "bg-deep-space border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-plasma-orange/60";

interface SceneTemplate {
  id: string;
  label: string;
  description: string;
  scenes: Array<Omit<KioskScene, "id">>;
}

const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: "geochron",
    label: "Geochron Earth",
    description: "De-clouded Earth, greyline, and wall-readable detail",
    scenes: [
      {
        name: "Geochron Earth",
        route: "/map",
        map: {
          layoutMode: "pro",
          viewMode: "flat",
          preset: "dx-hunter",
          mapStyle: "satellite",
          theme: "dark",
          showLiveClouds: false,
          quality: "uhd",
        },
        transition: "fade",
      },
    ],
  },
  {
    id: "observatory",
    label: "Observatory Globe",
    description: "Slow-turning science globe for a 4K wall",
    scenes: [
      {
        name: "Observatory Globe",
        route: "/map",
        map: {
          layoutMode: "pro",
          viewMode: "globe",
          preset: "science",
          autoRotate: true,
          autoRotateSpeed: 900,
          mapStyle: "satellite",
          theme: "midnight",
          quality: "uhd",
        },
        transition: "fade",
      },
    ],
  },
  {
    id: "hamclock",
    label: "HamClock Operations",
    description: "Dense radio conditions and live activity",
    scenes: [
      {
        name: "HamClock Operations",
        route: "/map",
        map: {
          layoutMode: "hamclock",
          viewMode: "flat",
          mapStyle: "satellite",
          theme: "dark",
          quality: "uhd",
        },
        transition: "fade",
      },
    ],
  },
  {
    id: "photorealistic",
    label: "Photorealistic 3D",
    description: "Experimental metered 3D with a safe exit",
    scenes: [
      {
        name: "Photorealistic 3D",
        route: "/map/photorealistic",
        map: {
          layoutMode: "pro",
          viewMode: "globe",
          theme: "dark",
          quality: "uhd",
        },
        durationSec: 120,
        transition: "fade",
      },
    ],
  },
];

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
  const presentation = useKioskStore((s) => s.presentation);
  const addScene = useKioskStore((s) => s.addScene);
  const updateScene = useKioskStore((s) => s.updateScene);
  const duplicateScene = useKioskStore((s) => s.duplicateScene);
  const moveScene = useKioskStore((s) => s.moveScene);
  const removeScene = useKioskStore((s) => s.removeScene);
  const setRotation = useKioskStore((s) => s.setRotation);
  const setBreakInLevel = useKioskStore((s) => s.setBreakInLevel);
  const setPresentation = useKioskStore((s) => s.setPresentation);
  const start = useKioskStore((s) => s.start);
  const station = useUserStore((s) => s.station);
  const currentLayout = useMapStore((s) => s.layoutMode);
  const currentView = useMapStore((s) => s.viewMode);
  const currentPreset = useMapStore((s) => s.activePreset);
  const currentAutoRotate = useMapStore((s) => s.autoRotate);
  const currentAutoRotateSpeed = useMapStore((s) => s.autoRotateSpeed);
  const currentMapStyle = useMapStore((s) => s.mapStyle);
  const currentLiveClouds = useMapStore((s) => s.layers.goesCloud);
  const currentQuality = useDisplayQualityStore((s) => s.displayQuality);
  const currentTheme = useThemeStore((s) => s.themeId);

  const [newName, setNewName] = useState("");
  const [newRoute, setNewRoute] = useState<string>(KIOSK_ROUTES[0].route);
  const [newLayout, setNewLayout] = useState<LayoutMode>("hamclock");
  const [newView, setNewView] = useState<ViewMode>("globe");
  const [newPreset, setNewPreset] = useState<PresetName | "">("");
  const [newAutoRotate, setNewAutoRotate] = useState(false);
  const [newAutoRotateSpeed, setNewAutoRotateSpeed] = useState(900);
  const [newDurationSec, setNewDurationSec] = useState(120);
  const [newTransition, setNewTransition] =
    useState<KioskTransition>("fade");
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);

  const enabledScenes = scenes.filter((scene) => scene.enabled !== false);

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
      durationSec: newDurationSec,
      transition: newTransition,
      ...(isKioskMapRoute(newRoute) && {
        map: {
          layoutMode: newLayout,
          viewMode: newView,
          ...(newPreset && { preset: newPreset }),
          autoRotate: newAutoRotate,
          ...(newAutoRotate && { autoRotateSpeed: newAutoRotateSpeed }),
        },
      }),
    };
    addScene(scene);
    setNewName("");
  };

  const handleAddTemplate = (template: SceneTemplate) => {
    let firstCreatedId: string | null = null;
    for (const scene of template.scenes) {
      const created = addScene(scene);
      firstCreatedId ??= created.id;
    }
    setExpandedSceneId(firstCreatedId);
  };

  const handleSaveCurrentView = () => {
    const created = addScene({
      name: `Saved ${currentView} view`,
      route: "/map",
      map: {
        layoutMode: currentLayout,
        viewMode: currentView,
        ...(currentPreset && { preset: currentPreset }),
        autoRotate: currentAutoRotate,
        autoRotateSpeed: currentAutoRotateSpeed,
        quality: currentQuality,
        mapStyle: currentMapStyle,
        theme: currentTheme,
        ...(currentView === "globe" && {
          showLiveClouds: currentLiveClouds,
        }),
      },
      durationSec: rotation.intervalSec,
      transition: "fade",
    });
    setExpandedSceneId(created.id);
  };

  const routeLabel = (route: string) =>
    KIOSK_ROUTES.find((r) => r.route === route)?.label ?? route;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 font-orbitron text-2xl text-white">
            Wall Display Center
          </h1>
          <p className="max-w-xl text-sm text-gray-400">
            Build a 4K-ready scene playlist, launch it fullscreen, and keep a
            view switcher available whenever the wall controls wake up.
          </p>
        </div>
        <Link
          to="/displays"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 hover:border-white/20 hover:text-white"
        >
          Configure paired displays
        </Link>
      </div>

      {/* Scenes */}
      <section className="space-y-4 rounded-xl border border-white/10 bg-deep-space/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-200">
              Scene playlist
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {enabledScenes.length} of {scenes.length} scenes enabled
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gray-500">
            Rotation order
          </span>
        </div>
        <ul className="space-y-2">
          {scenes.map((scene, index) => {
            const isEnabled = scene.enabled !== false;
            const isExpanded = expandedSceneId === scene.id;
            return (
              <li
                key={scene.id}
                className={`rounded-lg border bg-white/5 transition-colors ${
                  isExpanded ? "border-plasma-orange/30" : "border-white/10"
                } ${isEnabled ? "" : "opacity-60"}`}
              >
                <div className="flex items-center gap-2 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(event) =>
                      updateScene(scene.id, { enabled: event.target.checked })
                    }
                    className="shrink-0 accent-plasma-orange"
                    aria-label={`${isEnabled ? "Disable" : "Enable"} scene ${scene.name}`}
                  />
                  <button
                    onClick={() => launch(scene.id)}
                    disabled={!isEnabled}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Start wall at ${scene.name}`}
                  >
                    ▶
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{scene.name}</div>
                    <div className="truncate font-mono text-xs text-gray-500">
                      {routeLabel(scene.route)}
                      {scene.map && ` · ${scene.map.layoutMode}`}
                      {scene.map?.viewMode && ` · ${scene.map.viewMode}`}
                      {scene.map?.quality && ` · ${scene.map.quality}`}
                      {` · ${scene.durationSec ?? rotation.intervalSec}s`}
                      {` · ${scene.transition ?? "fade"}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveScene(scene.id, -1)}
                      disabled={index === 0}
                      className="rounded p-1.5 text-gray-500 hover:bg-white/10 hover:text-white disabled:opacity-20"
                      aria-label={`Move ${scene.name} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveScene(scene.id, 1)}
                      disabled={index === scenes.length - 1}
                      className="rounded p-1.5 text-gray-500 hover:bg-white/10 hover:text-white disabled:opacity-20"
                      aria-label={`Move ${scene.name} down`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateScene(scene.id)}
                      className="rounded p-1.5 text-xs text-gray-500 hover:bg-white/10 hover:text-white"
                      aria-label={`Duplicate scene ${scene.name}`}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSceneId(isExpanded ? null : scene.id)
                      }
                      className="rounded p-1.5 text-xs text-gray-400 hover:bg-white/10 hover:text-white"
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "Done" : "Edit"}
                    </button>
                    {scenes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeScene(scene.id)}
                        className="p-1.5 text-sm text-gray-500 hover:text-alert-red"
                        aria-label={`Remove scene ${scene.name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="grid grid-cols-2 gap-3 border-t border-white/10 bg-black/10 px-3 py-3 lg:grid-cols-4">
                    <label className="col-span-2 flex flex-col gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                      Scene name
                      <input
                        value={scene.name}
                        onChange={(event) =>
                          updateScene(scene.id, { name: event.target.value })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                      Page
                      <select
                        value={scene.route}
                        onChange={(event) => {
                          const route = event.target.value;
                          updateScene(scene.id, {
                            route,
                            map: isKioskMapRoute(route)
                              ? (scene.map ?? { layoutMode: "hamclock" })
                              : undefined,
                          });
                        }}
                        className={inputClass}
                      >
                        {KIOSK_ROUTES.map((route) => (
                          <option key={route.route} value={route.route}>
                            {route.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                      Duration
                      <input
                        type="number"
                        min={15}
                        max={3600}
                        value={scene.durationSec ?? rotation.intervalSec}
                        onChange={(event) =>
                          updateScene(scene.id, {
                            durationSec: Number(event.target.value),
                          })
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                      Transition
                      <select
                        value={scene.transition ?? "fade"}
                        onChange={(event) =>
                          updateScene(scene.id, {
                            transition: event.target.value as KioskTransition,
                          })
                        }
                        className={inputClass}
                      >
                        <option value="fade">Fade</option>
                        <option value="cut">Cut</option>
                      </select>
                    </label>

                    {isKioskMapRoute(scene.route) && scene.map && (
                      <>
                        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                          Layout
                          <select
                            value={scene.map.layoutMode}
                            onChange={(event) =>
                              updateScene(scene.id, {
                                map: {
                                  ...scene.map!,
                                  layoutMode: event.target.value as LayoutMode,
                                },
                              })
                            }
                            className={inputClass}
                          >
                            {LAYOUT_MODES.map((mode) => (
                              <option key={mode}>{mode}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                          Projection
                          <select
                            value={scene.map.viewMode ?? "globe"}
                            onChange={(event) => {
                              const viewMode = event.target.value as ViewMode;
                              updateScene(scene.id, {
                                map: {
                                  ...scene.map!,
                                  viewMode,
                                  ...(viewMode !== "globe" && {
                                    showLiveClouds: undefined,
                                  }),
                                },
                              });
                            }}
                            className={inputClass}
                          >
                            {VIEW_MODES.map((mode) => (
                              <option key={mode}>{mode}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                          Image quality
                          <select
                            value={scene.map.quality ?? "auto"}
                            onChange={(event) =>
                              updateScene(scene.id, {
                                map: {
                                  ...scene.map!,
                                  quality: event.target.value as DisplayQuality,
                                },
                              })
                            }
                            className={inputClass}
                          >
                            {DISPLAY_QUALITY_OPTIONS.map((quality) => (
                              <option key={quality.id} value={quality.id}>
                                {quality.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                          Basemap
                          <select
                            value={scene.map.mapStyle ?? "satellite"}
                            onChange={(event) =>
                              updateScene(scene.id, {
                                map: {
                                  ...scene.map!,
                                  mapStyle: event.target.value as MapStyle,
                                },
                              })
                            }
                            className={inputClass}
                          >
                            {MAP_STYLES.map((style) => (
                              <option key={style}>{style}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                          Theme
                          <select
                            value={scene.map.theme ?? "dark"}
                            onChange={(event) =>
                              updateScene(scene.id, {
                                map: {
                                  ...scene.map!,
                                  theme: event.target.value as ThemeId,
                                },
                              })
                            }
                            className={inputClass}
                          >
                            {THEMES.map((theme) => (
                              <option key={theme}>{theme}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-end gap-2 pb-2 text-xs text-gray-400">
                          <input
                            type="checkbox"
                            checked={scene.map.autoRotate ?? false}
                            onChange={(event) =>
                              updateScene(scene.id, {
                                map: {
                                  ...scene.map!,
                                  autoRotate: event.target.checked,
                                },
                              })
                            }
                            className="accent-plasma-orange"
                          />
                          Auto-rotate
                        </label>
                        {scene.map.autoRotate && (
                          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-gray-500">
                            Rotation seconds / orbit
                            <input
                              type="number"
                              min={30}
                              max={3600}
                              value={scene.map.autoRotateSpeed ?? 900}
                              onChange={(event) =>
                                updateScene(scene.id, {
                                  map: {
                                    ...scene.map!,
                                    autoRotateSpeed: Number(event.target.value),
                                  },
                                })
                              }
                              className={inputClass}
                            />
                          </label>
                        )}
                        {kioskSceneSupportsLiveClouds(
                          scene.route,
                          scene.map,
                        ) ? (
                          <label className="flex items-end gap-2 pb-2 text-xs text-gray-400">
                            <input
                              type="checkbox"
                              checked={scene.map.showLiveClouds ?? false}
                              onChange={(event) =>
                                updateScene(scene.id, {
                                  map: {
                                    ...scene.map!,
                                    showLiveClouds: event.target.checked,
                                  },
                                })
                              }
                              className="accent-plasma-orange"
                            />
                            Live clouds
                          </label>
                        ) : (
                          <p className="self-end pb-2 text-[10px] text-gray-500">
                            Live clouds are available on Globe scenes.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="border-t border-white/10 pt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Add a polished template
            </h3>
            <button
              type="button"
              onClick={handleSaveCurrentView}
              className="rounded-lg border border-cosmic-cyan/30 bg-cosmic-cyan/10 px-2.5 py-1.5 text-xs text-cosmic-cyan hover:bg-cosmic-cyan/20"
            >
              Save current PropSphere view
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SCENE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => handleAddTemplate(template)}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-plasma-orange/30 hover:bg-white/[0.07]"
              >
                <span className="block text-sm text-white">{template.label}</span>
                <span className="mt-1 block text-xs text-gray-500">
                  {template.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Add scene */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
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
          {isKioskMapRoute(newRoute) && (
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
                value={newView}
                onChange={(e) => setNewView(e.target.value as ViewMode)}
                className={inputClass}
                aria-label="Map projection"
              >
                {VIEW_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
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
              {newAutoRotate && (
                <input
                  type="number"
                  min={30}
                  max={3600}
                  value={newAutoRotateSpeed}
                  onChange={(event) =>
                    setNewAutoRotateSpeed(Number(event.target.value))
                  }
                  className={`${inputClass} w-28`}
                  aria-label="Rotation seconds per orbit"
                  title="Rotation seconds per orbit"
                />
              )}
            </>
          )}
          <input
            type="number"
            min={15}
            max={3600}
            value={newDurationSec}
            onChange={(event) => setNewDurationSec(Number(event.target.value))}
            className={`${inputClass} w-24`}
            aria-label="New scene duration in seconds"
          />
          <select
            value={newTransition}
            onChange={(event) =>
              setNewTransition(event.target.value as KioskTransition)
            }
            className={inputClass}
            aria-label="New scene transition"
          >
            <option value="fade">fade</option>
            <option value="cut">cut</option>
          </select>
          <button
            onClick={handleAddScene}
            disabled={!newName.trim()}
            className="px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-sm text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add scene
          </button>
        </div>
      </section>

      {/* Launch Wall (E7): every monitor becomes a kiosk in one click */}
      <LaunchWallSection scenes={enabledScenes} />

      {/* Wall appearance */}
      <section className="bg-deep-space/60 border border-white/10 rounded-xl p-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-200 uppercase tracking-wider">
            Wall appearance
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Tune high-distance readability without changing the normal app.
          </p>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Header size"
        >
          <span className="mr-1 text-sm text-gray-300">Header size</span>
          {HEADER_SCALES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                setPresentation({ headerScale: option.value })
              }
              aria-pressed={presentation.headerScale === option.value}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                presentation.headerScale === option.value
                  ? "border-plasma-orange/50 bg-plasma-orange/15 text-plasma-orange"
                  : "border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.07] hover:text-gray-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={presentation.slashedZero}
              onChange={(event) =>
                setPresentation({ slashedZero: event.target.checked })
              }
              className="accent-plasma-orange"
            />
            Slashed zero numerals
          </label>

          <label
            className={`flex items-center gap-2 text-sm ${
              station ? "text-gray-300" : "text-gray-600"
            }`}
            title={
              station
                ? "Uses the configured station coordinates"
                : "Configure your station QTH to enable sunset dimming"
            }
          >
            <input
              type="checkbox"
              checked={presentation.autoNightDim}
              onChange={(event) =>
                setPresentation({ autoNightDim: event.target.checked })
              }
              disabled={!station}
              className="accent-plasma-orange disabled:cursor-not-allowed"
            />
            Auto-dim after QTH sunset
          </label>
        </div>
        {!station && (
          <p className="text-xs text-caution-amber/75">
            Configure your station QTH to enable automatic night dimming.
          </p>
        )}
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
          Default scene duration
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
        <div>
          <button
            onClick={() => launch()}
            disabled={enabledScenes.length === 0}
            className="rounded-xl border border-plasma-orange/40 bg-plasma-orange/20 px-6 py-3 font-orbitron tracking-wide text-plasma-orange hover:bg-plasma-orange/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Start Wall Display
          </button>
          {enabledScenes.length === 0 && (
            <p className="mt-2 text-xs text-alert-red">
              Enable at least one scene before launch.
            </p>
          )}
        </div>
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

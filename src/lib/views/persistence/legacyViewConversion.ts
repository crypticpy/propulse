import { createViewConfiguration } from "../defaults";
import { contractIdSchema } from "../spotContracts";
import { sceneSnapshotSchema, type PresetRecipe, type ViewConfiguration, type ViewFamily } from "../contracts";
import { normalizeMode } from "../../spots/presentation/modes";
import { legacyObject, legacyState, type LegacyViewCapture } from "./legacyCapture";
import { legacyMigrationPlanSchema, type LegacyMigrationPlan } from "./legacyMigration";
import { migrateLegacyKioskPins } from "./legacyKioskMigration";
import { viewDraftSchema, type ViewDraft } from "./schema";

const FAMILIES = ["normal", "pro", "lite", "hamclock"] as const;
// Legacy default panel placements at the stable 1920x1080 migration fallback.
// Saved geometry takes precedence; do not consult the current window's viewport.
const PANEL_FALLBACK: Record<string, { x: number; y: number; width: number; height: number }> = {
  "band-conditions": { x: 19, y: 86, width: 256, height: 400 },
  "path-analysis": { x: 1536, y: 86, width: 288, height: 400 },
  "dx-spots": { x: 384, y: 778, width: 600, height: 200 },
  satellites: { x: 1536, y: 540, width: 260, height: 360 },
};
const draft = (family: typeof FAMILIES[number], config: ViewConfiguration): ViewDraft => ({
  id: `legacy-v1-${family}`, name: `Imported ${family === "hamclock" ? "HamClock" : family === "normal" ? "PropSphere" : family === "pro" ? "Pro" : "Lite"}`,
  schemaVersion: 1, sourcePreset: null, config,
});
const get = (object: unknown, path: string[]): unknown => path.reduce<unknown>((value, key) => legacyObject(value)[key], object);

/** Apply each supported field against the full schema. Invalid values retain stable defaults. */
function projector(initial: ViewConfiguration, warnings: Set<string>) {
  let config = structuredClone(initial);
  const set = (path: string[], value: unknown) => {
    if (value === undefined) return;
    const candidate = structuredClone(config);
    let object = candidate as unknown as Record<string, unknown>;
    for (const key of path.slice(0, -1)) object = legacyObject(object[key]);
    object[path[path.length - 1]] = structuredClone(value);
    const parsed = viewDraftSchema.safeParse({ id: "legacy-validation", name: "Legacy", schemaVersion: 1, sourcePreset: null, config: candidate });
    if (parsed.success) config = parsed.data.config;
    else warnings.add(`Invalid legacy ${path.join(".")}; retained the default or captured baseline value`);
  };
  const matching = (path: string[], raw: unknown) => {
    const source = legacyObject(raw);
    for (const key of Object.keys(legacyObject(get(config, path)))) {
      if (source[key] !== undefined) set([...path, key], source[key]);
    }
  };
  return { set, matching, result: () => config };
}

function familySeed(family: typeof FAMILIES[number], capture: LegacyViewCapture, warnings: Set<string>): ViewConfiguration {
  const local = capture.local;
  const settings = legacyState(local["propulse-settings"]);
  const ui = legacyObject(settings.uiInteraction);
  const p = projector(createViewConfiguration(family), warnings);
  const set = (path: string, value: unknown) => p.set(path.split("."), value);
  for (const key of ["textScale"] as const) set(`presentation.${key}`, settings[key]);
  set("presentation.controls.timeFormat", settings.timeFormat);
  p.matching(["presentation", "controls"], ui);
  p.matching(["presentation", "controls", "compassRose"], settings.compassRose);
  p.matching(["presentation", "forecast"], settings.forecastDisplay);
  set("presentation.ticker.position", settings.tickerPosition);
  set("presentation.ticker.coverageArea", settings.tickerCoverageArea);
  set("presentation.spotColorMode", ui.spotColorMode);
  set("presentation.visualStyle", ui.visualStyle);
  set("presentation.labels.callsigns", ui.showSpotCallsignLabels);
  set("presentation.labels.endpoints", ui.showSpotterLabels);
  set("presentation.labels.scale", ui.labelScale);
  const theme = legacyObject(local["propulse-theme"]);
  set("presentation.theme.id", theme.themeId ?? settings.theme);
  set("presentation.theme.accentId", theme.accentId);
  set("presentation.theme.customPrimary", theme.customPrimary);
  p.matching(["presentation", "layers"], local["propulse-map-layers"]);
  p.matching(["presentation", "labels"], local["propulse-label-options"]);
  const scalar: Record<string, string> = {
    "propulse-map-style": "mapStyle", "propulse-tile-provider-id": "tileProviderId",
    "propulse-display-quality": "quality", "propulse-night-darkness": "nightDarkness",
    "propulse-display-fit": "fit", "propulse-pro-ribbon-expanded": "proRibbonExpanded",
    "propulse-grid-label-detail": "labels.gridDetail", "propulse-globe-orientation": "controls.globeOrientation",
    "propulse-grid-activity-endpoint": "overlays.gridActivityEndpoint",
    "propulse-beacon-inactive-opacity": "overlays.beaconInactiveOpacity", "propulse-nvis-opacity": "overlays.nvisOpacity",
  };
  for (const [key, path] of Object.entries(scalar)) set(`presentation.${path}`, local[key]);
  // Legacy speed is already seconds per revolution; it does not enable rotation.
  set("presentation.autoRotate.secondsPerRevolution", local["propulse-auto-rotate-speed"]);
  const age = legacyObject(settings.spotAge);
  set("spots.filters.maxAgeMinutes", age.maxAgeMinutes);
  set("presentation.controls.spotAgeDecay", age.enabled);
  set("presentation.controls.showAgeColumn", age.showAgeColumn);
  const grouping = legacyObject(settings.spotClustering);
  set("spots.grouping.enabled", grouping.enabled);
  set("spots.grouping.minGroupSize", grouping.minClusterSize);
  if (grouping.gridSize !== undefined || grouping.radius !== undefined || grouping.angularRadius !== undefined) {
    warnings.add("Legacy angular clustering has no geographic equivalent; Regions grouping was used");
  }
  const mapFilters = legacyObject(local["propulse-spot-filters"]);
  const dx = legacyState(local["propulse-dx-filters"] ?? local["propulse-dx-cluster"]);
  const filters = { ...legacyObject(dx.filters), ...mapFilters };
  set("spots.filters.bands", filters.bands);
  if (age.maxAgeMinutes === undefined) set("spots.filters.maxAgeMinutes", filters.maxAge);
  if (Array.isArray(filters.modes) && filters.modes.length > 0) {
    const normalized = filters.modes.map((mode) => typeof mode === "string" ? normalizeMode(mode) : normalizeMode(null));
    const valid = normalized.filter((mode) => mode.category !== "unknown");
    if (valid.length !== normalized.length) warnings.add("Unrecognized legacy modes were retained in backup; unsupported filters were omitted");
    if (valid.length) {
      const categories = [...new Set(valid.filter((mode) => ["PHONE", "DIGITAL"].includes(mode.name)).map((mode) => mode.category))];
      set("spots.filters.modes", {
        all: false, categories, modes: [...new Set(valid.filter((mode) => !["PHONE", "DIGITAL"].includes(mode.name)).map((mode) => mode.name))],
        includeUnknown: false, includeInferred: true,
      });
    }
  }
  const layout = legacyObject(local["propulse-pro-panel-layout"]);
  const collapsed = legacyObject(local["propulse-panel-states"]);
  const aliases: Record<string, string> = { bandConditions: "band-conditions", pathAnalysis: "path-analysis", dxSpotList: "dx-spots", satellites: "satellites" };
  const panels: Record<string, unknown>[] = Object.entries(layout).map(([id, raw]) => {
    const panel = legacyObject(raw);
    return { id, visible: true, collapsed: false, dockedEdge: null, dockedOrder: 0, ...panel };
  });
  for (const [key, value] of Object.entries(collapsed)) {
    const id = aliases[key];
    const existing = panels.find((panel) => panel.id === id);
    // Pro's saved layout owns its collapse state. Generic panel controls are
    // only a fallback for panels without a persisted Pro entry.
    if (!existing && id && typeof value === "boolean") {
      panels.push({ id, visible: true, collapsed: value, dockedEdge: null, dockedOrder: 0, ...PANEL_FALLBACK[id] });
      warnings.add("Panel geometry was absent; stable legacy 1920x1080 default placements were used");
    }
  }
  for (const panel of panels) set("presentation.panels", [...p.result().presentation.panels, panel]);
  if (Array.isArray(local["propulse-dock-groups"])) {
    set("presentation.dockGroups", local["propulse-dock-groups"].map((raw) => {
      const group = legacyObject(raw);
      return { id: group.id, panelIds: group.panelIds, sharedX: group.sharedX, sharedWidth: group.sharedWidth };
    }));
  }
  if (family === "hamclock") {
    const oldWall = legacyState(local["propulse-hamclock-layout"]);
    const display = legacyState(capture.session["propulse-hamclock-display"]);
    // An explicitly invalid newer field retains defaults; it must not revive an older value.
    const wall = { ...oldWall, ...display };
    const defaults = p.result().presentation.hamclock;
    for (const key of Object.keys(defaults)) {
      if (["railLayout", "initialPageId", "widgets"].includes(key)) continue;
      if (key === "panelCollapsed") set(`presentation.hamclock.${key}`, wall[key]);
      else if (key === "reliability" || key === "autoPage") p.matching(["presentation", "hamclock", key], wall[key]);
      else set(`presentation.hamclock.${key}`, wall[key]);
    }
    set("presentation.hamclock.mode", oldWall.hamclockMode);
    set("presentation.projection", oldWall.preferredViewMode);
    const text = display.textSize === "inherit" ? settings.textScale : display.textSize;
    set("presentation.textScale", text);
    set("presentation.smartScaling", display.smartScaling);
    if (wall.railLayout !== undefined) {
      const rail = legacyObject(wall.railLayout);
      const first = Array.isArray(rail.left) ? legacyObject(rail.left[0]).pageId : undefined;
      set("presentation.hamclock", { ...p.result().presentation.hamclock, railLayout: wall.railLayout, initialPageId: first ?? null });
    }
    // Explicit wall follow choice is intent; never copy the current radio's band/mode here.
    set("context.followRadio", display.followRadio);
    const widgetState = legacyState(local["propulse-hamclock-widget-config"]);
    const widgets = legacyObject(widgetState.widgets);
    for (const [tileId, config] of Object.entries(widgets)) {
      set("presentation.hamclock.widgets", [...p.result().presentation.hamclock.widgets, { tileId, schemaVersion: 1, config }]);
    }
  }
  return p.result();
}

export interface LegacyConversionOptions {
  ownerId: string;
  /** Agent 4's accepted pure legacy-profile adapter is supplied by the integration layer. */
  convertProfiles?: (profiles: readonly unknown[], baseline: ViewConfiguration) => PresetRecipe[];
  /** Explicit shipped legacy table, not the active preset or a live layer snapshot. */
  layerPresets?: Readonly<Record<string, Partial<ViewConfiguration["presentation"]["layers"]>>>;
}

/** Pure conversion: uses the captured baseline for every scene, never the previous scene. */
export function convertLegacyViewCapture(capture: LegacyViewCapture, options: LegacyConversionOptions): LegacyMigrationPlan {
  const maxVersions: Record<string, number> = {
    "propulse-settings": 37, "propulse-hamclock-layout": 4, "propulse-hamclock-display": 8,
    "propulse-hamclock-widget-config": 1, "propulse-kiosk": 7,
    "propulse-dx-filters": 0, "propulse-dx-cluster": 1,
  };
  for (const [key, value] of Object.entries({ ...capture.local, ...capture.session })) {
    const version = legacyObject(value).version;
    if (version !== undefined && maxVersions[key] !== undefined &&
        (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0 || version > maxVersions[key])) {
      throw new Error(`Unsupported legacy version in ${key}; no migration committed`);
    }
  }
  const warnings = new Set(capture.warnings);
  const configs = Object.fromEntries(FAMILIES.map((family) => [family, familySeed(family, capture, warnings)])) as Record<typeof FAMILIES[number], ViewConfiguration>;
  const views = { normal: draft("normal", configs.normal), pro: draft("pro", configs.pro), lite: draft("lite", configs.lite), hamclock: draft("hamclock", configs.hamclock) };
  const kiosk = migrateLegacyKioskPins(capture.local["propulse-kiosk"]);
  const rotation = legacyObject(kiosk.rotation);
  const scenes = (Array.isArray(kiosk.scenes) ? kiosk.scenes : []).map((raw, index) => {
    const scene = legacyObject(raw);
    const map = legacyObject(scene.map);
    const family: ViewFamily = scene.route === "/map" ? (FAMILIES.includes(map.layoutMode as typeof FAMILIES[number]) ? map.layoutMode as typeof FAMILIES[number] : "pro") : "route";
    const seed = family === "route" ? { ...structuredClone(configs.pro), family, route: scene.route } : configs[family];
    // Validate route/seed first; invalid scenes remain only in backup for explicit recovery.
    const checked = viewDraftSchema.safeParse({ id: "legacy-scene", name: "Legacy scene", schemaVersion: 1, sourcePreset: null, config: seed });
    if (!checked.success) throw new Error(`Legacy scene ${index + 1} has an unsupported route; no migration committed`);
    const p = projector(checked.data.config, warnings);
    for (const [from, to] of Object.entries({ viewMode: "projection", autoRotateSpeed: "autoRotate.secondsPerRevolution", quality: "quality", mapStyle: "mapStyle" })) p.set(["presentation", ...to.split(".")], map[from]);
    p.set(["presentation", "autoRotate", "enabled"], map.autoRotate);
    p.set(["presentation", "theme", "id"], map.theme);
    p.set(["presentation", "hamclock", "mode"], map.hamclockMode);
    const wall = legacyObject(map.hamclock);
    p.set(["presentation", "hamclock", "theme"], wall.theme);
    if (map.preset !== undefined) {
      if (typeof map.preset !== "string" || !options.layerPresets || !Object.prototype.hasOwnProperty.call(options.layerPresets, map.preset)) {
        throw new Error(`Legacy scene ${index + 1} needs its shipped layer preset; no migration committed`);
      }
      p.matching(["presentation", "layers"], options.layerPresets[map.preset]);
    }
    if (map.showLiveClouds !== undefined || map.viewMode !== undefined || family === "hamclock") {
      p.set(["presentation", "layers", "goesCloud"], p.result().presentation.projection === "globe" && map.showLiveClouds === true);
    }
    const pinnedPage = wall.leftPage ?? wall.rightPage;
    if (pinnedPage !== undefined) p.set(["presentation", "hamclock", "initialPageId"], pinnedPage);
    return sceneSnapshotSchema.parse({
      id: scene.id, name: scene.name, enabled: scene.enabled ?? true,
      durationSec: scene.durationSec ?? rotation.intervalSec ?? 120,
      transition: scene.transition ?? "fade", config: p.result(), sourceView: null,
    });
  });
  const rawProfiles = capture.local["propulse-custom-profiles"];
  if (rawProfiles !== undefined && !Array.isArray(rawProfiles)) throw new Error("Invalid legacy profile library; no migration committed");
  const profiles = rawProfiles ?? [];
  if (profiles.length && !options.convertProfiles) throw new Error("Legacy profile conversion adapter is required; no migration committed");
  const presets = profiles.length ? options.convertProfiles!(structuredClone(profiles), structuredClone(configs.pro)) : [];
  if (presets.length !== profiles.length) throw new Error("Legacy profile adapter omitted entries; no migration committed");
  for (const profile of profiles) {
    const id = legacyObject(profile).id;
    if (contractIdSchema.safeParse(id).success && !presets.some((preset) => preset.id === id)) {
      throw new Error("Legacy profile adapter changed a valid identity; no migration committed");
    }
  }
  return legacyMigrationPlanSchema.parse({ version: 1, ownerId: options.ownerId, source: "device", backup: capture, views, presets, scenes, warnings: [...warnings] });
}

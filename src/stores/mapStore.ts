import { create } from "zustand";
import { type RegionPreset, DEFAULT_REGION_PRESETS } from "@/types/map";
import type {
  OverlayLayerModel,
  MapInteractionMode,
} from "@/types/mapOverlays";
import type { OperatingProfile, SpotFilters } from "@/types/operatingProfile";
import type { SatelliteCategory } from "@/types/satellite";
import { useSettingsStore } from "@/stores/settingsStore";

export type ViewMode = "globe" | "flat" | "azimuthal";
export type MapStyle = "satellite" | "standard";
export type LayoutMode = "normal" | "pro" | "lite" | "hamclock";

// Layer preset configurations for common use cases
export const LAYER_PRESETS = {
  "dx-hunter": {
    terminator: true,
    greyline: true,
    aurora: false,
    muf: true,
    nvis: false,
    spots: true,
    spotTraces: false,
    nightLights: true,
    labels: false,
    satellites: false,
    earthquakes: false,
    weather: false,
    lightning: false,
    wspr: false,
    contestQsos: false,
    loggedQsos: false,
    fires: false,
    radar: false,
    issTracker: false,
    gridActivity: true,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: false,
    beacons: true,
    spectrumRing: false,
    ducting: false,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: true,
    goesCloud: false,
    tec: false,
    repeaters: false,
    riverGauges: false,
    aprs: false,
  },
  contest: {
    terminator: true,
    greyline: false,
    aurora: false,
    muf: false,
    nvis: false,
    spots: true,
    spotTraces: false,
    nightLights: false,
    labels: false,
    satellites: false,
    earthquakes: false,
    weather: false,
    lightning: false,
    wspr: false,
    contestQsos: true,
    loggedQsos: false,
    fires: false,
    radar: false,
    issTracker: false,
    gridActivity: false,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: false,
    beacons: false,
    spectrumRing: false,
    ducting: false,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: false,
    goesCloud: false,
    tec: false,
    repeaters: false,
    riverGauges: false,
    aprs: false,
  },
  vhf: {
    terminator: true,
    greyline: false,
    aurora: true,
    muf: false,
    nvis: false,
    spots: false,
    spotTraces: false,
    nightLights: false,
    labels: false,
    satellites: true,
    earthquakes: false,
    weather: false,
    lightning: false,
    wspr: false,
    contestQsos: false,
    loggedQsos: false,
    fires: false,
    radar: false,
    issTracker: true,
    gridActivity: false,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: true,
    beacons: false,
    spectrumRing: false,
    ducting: true,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: false,
    goesCloud: false,
    tec: false,
    repeaters: false,
    riverGauges: false,
    aprs: false,
  },
  emergency: {
    terminator: true,
    greyline: true,
    aurora: false,
    muf: false,
    nvis: true,
    spots: false,
    spotTraces: false,
    nightLights: true,
    labels: true,
    satellites: false,
    earthquakes: true,
    weather: true,
    lightning: true,
    wspr: false,
    contestQsos: false,
    loggedQsos: false,
    fires: true,
    radar: true,
    issTracker: false,
    gridActivity: false,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: false,
    beacons: false,
    spectrumRing: false,
    ducting: false,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: false,
    goesCloud: false,
    tec: false,
    repeaters: true,
    riverGauges: true,
    aprs: false,
  },
  science: {
    terminator: true,
    greyline: false,
    aurora: true,
    muf: false,
    nvis: false,
    spots: false,
    spotTraces: false,
    nightLights: false,
    labels: false,
    satellites: false,
    earthquakes: false,
    weather: false,
    lightning: false,
    wspr: false,
    contestQsos: false,
    loggedQsos: false,
    fires: false,
    radar: false,
    issTracker: false,
    gridActivity: false,
    ionosphere: true,
    rayPath: false,
    drap: true,
    geomagField: true,
    noiseFloor: true,
    meteorShowers: false,
    beacons: false,
    spectrumRing: false,
    ducting: false,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: false,
    goesCloud: false,
    tec: true,
    repeaters: false,
    riverGauges: false,
    aprs: false,
  },
} as const;

export type PresetName = keyof typeof LAYER_PRESETS;

export interface TargetLocation {
  lat: number;
  lon: number;
  name?: string;
  grid?: string;
}

/** Center location for Q2 double-click centering (not a target) */
export interface CenterLocation {
  lat: number;
  lon: number;
  timestamp: number; // Used to trigger re-centering even to same location
}

/** Time scenario for saving favorite times */
export interface TimeScenario {
  id: string;
  name: string;
  time: string; // ISO string
  target?: TargetLocation;
  createdAt: string;
}

/** Position for tooltip overlay */
export interface TooltipPosition {
  x: number;
  y: number;
  grid: string;
}

/** Position for flyout menu overlay */
export interface FlyoutPosition {
  x: number;
  y: number;
  lat: number;
  lon: number;
  grid: string;
}

/** Panel collapse states for persistence */
export interface PanelStates {
  bandConditions: boolean; // true = collapsed
  pathAnalysis: boolean;
  dxSpotList: boolean;
  satellites: boolean;
}

/** Pro mode floating panel layout (persisted separately) */
export interface ProPanelLayoutEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  dockedEdge?: "left" | "right"; // which screen edge when minimized
  dockedOrder?: number; // vertical sort position (panel's y-center at minimize time)
}

export type PanelId = keyof PanelStates;

/** Dock group for magnetically-linked floating panels */
export interface DockGroup {
  id: string;
  orientation: "vertical";
  panelIds: string[]; // ordered top→bottom
  sharedX: number;
  sharedWidth: number;
}

/** Label layer sub-options */
export interface LabelOptions {
  borders: boolean;
  stateBorders: boolean;
  countryNames: boolean;
  cities: boolean;
  maidenheadGrid: boolean;
  gridLabels: boolean;
  wasOverlay: boolean;
  tileLabels: boolean;
}

interface MapState {
  // View settings
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Time offset in hours from current time (-24 to +24)
  timeOffset: number;
  setTimeOffset: (offset: number) => void;

  // Absolute time (ISO string) - when set, overrides timeOffset
  absoluteTime: string | null;
  setAbsoluteTime: (time: string | null) => void;

  // Time scenarios for saving/recalling favorite times
  timeScenarios: TimeScenario[];
  addTimeScenario: (
    name: string,
    time: Date,
    target?: TargetLocation | null,
  ) => void;
  removeTimeScenario: (id: string) => void;
  applyTimeScenario: (id: string) => void;

  // Target location for path analysis
  target: TargetLocation | null;
  setTarget: (target: TargetLocation | null) => void;

  // Recent targets history (max 10)
  recentTargets: TargetLocation[];
  clearRecentTargets: () => void;

  // Globe rotation state
  rotation: { x: number; y: number };
  setRotation: (rotation: { x: number; y: number }) => void;

  // Zoom level (1 = default)
  zoom: number;
  setZoom: (zoom: number) => void;

  // Auto-rotate globe
  autoRotate: boolean;
  setAutoRotate: (autoRotate: boolean) => void;

  // Auto-rotate speed (seconds per full revolution, 60–86400)
  autoRotateSpeed: number;
  setAutoRotateSpeed: (speed: number) => void;

  // Observatory mode (lean-back fullscreen auto-rotate, zoom only)
  observatoryMode: boolean;
  observatoryPreviousState: {
    layoutMode: LayoutMode;
    autoRotate: boolean;
    viewMode: ViewMode;
  } | null;
  enterObservatory: () => void;
  exitObservatory: () => void;

  // Layer visibility
  layers: {
    terminator: boolean;
    greyline: boolean;
    aurora: boolean;
    muf: boolean;
    nvis: boolean;
    spots: boolean;
    spotTraces: boolean;
    nightLights: boolean;
    labels: boolean;
    satellites: boolean;
    earthquakes: boolean;
    weather: boolean;
    lightning: boolean;
    wspr: boolean;
    contestQsos: boolean;
    loggedQsos: boolean;
    fires: boolean;
    radar: boolean;
    issTracker: boolean;
    gridActivity: boolean;
    ionosphere: boolean;
    rayPath: boolean;
    drap: boolean;
    geomagField: boolean;
    noiseFloor: boolean;
    meteorShowers: boolean;
    beacons: boolean;
    spectrumRing: boolean;
    ducting: boolean;
    sporadicE: boolean;
    satelliteFootprints: boolean;
    ft8Spotter: boolean;
    goesCloud: boolean;
    tec: boolean;
    repeaters: boolean;
    riverGauges: boolean;
    aprs: boolean;
  };
  toggleLayer: (layer: keyof MapState["layers"]) => void;

  // NVIS mode controls
  nvisEnabled: boolean;
  toggleNVIS: () => void;
  setNVISEnabled: (enabled: boolean) => void;

  // Layer presets
  activePreset: PresetName | null;
  applyPreset: (preset: PresetName) => void;
  clearPreset: () => void;

  // Operating profiles
  activeProfile: OperatingProfile | null;
  spotFilters: SpotFilters;
  customProfiles: OperatingProfile[];
  applyProfile: (profile: OperatingProfile) => void;
  clearProfile: () => void;
  setSpotFilters: (filters: SpotFilters) => void;
  clearSpotFilters: () => void;
  saveCustomProfile: (profile: OperatingProfile) => void;
  deleteCustomProfile: (id: string) => void;

  // Fullscreen mode
  isFullscreen: boolean;
  setFullscreen: (value: boolean) => void;
  toggleFullscreen: () => void;

  // Lite mode (minimized panels)
  isLiteMode: boolean;
  setLiteMode: (value: boolean) => void;
  toggleLiteMode: () => void;

  // Unified layout mode (normal/pro/lite/hamclock)
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;

  // DX Console expanded state
  isDXConsoleExpanded: boolean;
  setDXConsoleExpanded: (value: boolean) => void;
  toggleDXConsoleExpanded: () => void;

  // Renderer-agnostic interaction and overlays (used by Contest overlays, etc.)
  interactionMode: MapInteractionMode;
  setInteractionMode: (mode: MapInteractionMode) => void;
  overlayLayers: Record<string, OverlayLayerModel>;
  addOverlayLayer: (layerId: string, layerModel: OverlayLayerModel) => void;
  updateOverlayLayer: (layerId: string, layerModel: OverlayLayerModel) => void;
  removeOverlayLayer: (layerId: string) => void;
  clearOverlayLayers: () => void;

  // Globe interaction overlays
  tooltipPosition: TooltipPosition | null;
  setTooltipPosition: (pos: TooltipPosition | null) => void;
  flyoutPosition: FlyoutPosition | null;
  setFlyoutPosition: (pos: FlyoutPosition | null) => void;

  // Path mode (short/long path display)
  pathMode: "short" | "long";
  setPathMode: (mode: "short" | "long") => void;
  togglePathMode: () => void;

  // Panel collapse states (persisted)
  panelStates: PanelStates;
  togglePanel: (panelId: PanelId) => void;
  setPanelCollapsed: (panelId: PanelId, collapsed: boolean) => void;
  resetPanelStates: () => void;

  // Map style (satellite vs standard/grayscale, persisted)
  mapStyle: MapStyle;
  setMapStyle: (style: MapStyle) => void;

  // Label layer sub-options (persisted)
  labelOptions: LabelOptions;
  setLabelOption: (key: keyof LabelOptions, value: boolean) => void;

  // Center location (Q2: double-click centering without setting target)
  centerLocation: CenterLocation | null;
  setCenterLocation: (lat: number, lon: number) => void;
  clearCenterLocation: () => void;

  // Region view presets
  regionPresets: RegionPreset[];
  activePresetId: string | null;
  setActivePreset: (id: string) => void;
  clearActivePreset: () => void;
  addRegionPreset: (
    preset: Omit<RegionPreset, "id" | "isBuiltIn" | "createdAt">,
  ) => void;
  updateRegionPreset: (
    id: string,
    updates: Partial<
      Pick<
        RegionPreset,
        "name" | "icon" | "center" | "zoom" | "rotation" | "viewMode"
      >
    >,
  ) => void;
  deleteRegionPreset: (id: string) => void;
  reorderRegionPresets: (orderedIds: string[]) => void;
  saveCurrentAsPreset: (name: string, icon?: string) => void;
  exportRegionPresets: () => string;
  importRegionPresets: (json: string) => boolean;

  // Arc display density (persisted)
  displayDensity: number;
  setDisplayDensity: (density: number) => void;

  // Grid label detail level (1=field, 2=square, 3=subsquare) — persisted
  gridLabelDetail: number;
  setGridLabelDetail: (detail: number) => void;

  // Spot replay (time machine past-time replay)
  replayEnabled: boolean;
  setReplayEnabled: (enabled: boolean) => void;

  // Phase 3 feature layer toggles
  showEsLayer: boolean;
  setShowEsLayer: (show: boolean) => void;
  toggleEsLayer: () => void;

  showObservedMUF: boolean;
  observedMUFMode: "observed" | "divergence" | "off";
  setObservedMUFMode: (mode: "observed" | "divergence" | "off") => void;

  showCorrelation: boolean;
  setShowCorrelation: (show: boolean) => void;
  toggleCorrelation: () => void;

  // Pro toolbar ribbon (persisted)
  proRibbonExpanded: boolean;
  setProRibbonExpanded: (expanded: boolean) => void;
  toggleProRibbon: () => void;

  // Pro mode floating panel layout (persisted)
  proPanelLayout: Record<string, ProPanelLayoutEntry>;
  updateProPanelLayout: (
    panelId: string,
    layout: { x: number; y: number; width: number; height: number },
  ) => void;
  toggleProPanelCollapse: (panelId: string) => void;
  resetProPanelLayout: () => void;

  // Panel docking (persisted)
  dockGroups: DockGroup[];
  setDockGroups: (groups: DockGroup[]) => void;
  addDockGroup: (group: DockGroup) => void;
  removeDockGroup: (groupId: string) => void;
  updateDockGroup: (groupId: string, updates: Partial<DockGroup>) => void;
  removePanelFromDockGroup: (panelId: string) => void;

  // Satellite UI state (ephemeral — not persisted to localStorage)
  selectedSatelliteId: number | null;
  setSelectedSatelliteId: (noradId: number | null) => void;

  satelliteCategoryFilter: SatelliteCategory | "all";
  setSatelliteCategoryFilter: (cat: SatelliteCategory | "all") => void;

  satelliteShowAll: boolean;
  setSatelliteShowAll: (show: boolean) => void;

  // Beacon inactive opacity (0-1, persisted)
  beaconInactiveOpacity: number;
  setBeaconInactiveOpacity: (opacity: number) => void;

  // NVIS dome opacity (0.1-0.8, persisted)
  nvisOpacity: number;
  setNvisOpacity: (opacity: number) => void;

  // Reset to defaults
  reset: () => void;
}

// Maximum number of recent targets to keep
const MAX_RECENT_TARGETS = 10;

// Load saved time scenarios from localStorage
function loadTimeScenarios(): TimeScenario[] {
  try {
    const saved = localStorage.getItem("propulse-time-scenarios");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveTimeScenarios(scenarios: TimeScenario[]): void {
  try {
    localStorage.setItem("propulse-time-scenarios", JSON.stringify(scenarios));
  } catch {
    // Ignore storage errors
  }
}

// Load saved recent targets from localStorage
function loadRecentTargets(): TargetLocation[] {
  try {
    const saved = localStorage.getItem("propulse-recent-targets");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveRecentTargets(targets: TargetLocation[]): void {
  try {
    localStorage.setItem("propulse-recent-targets", JSON.stringify(targets));
  } catch {
    // Ignore storage errors
  }
}

// Default panel states (all expanded)
const DEFAULT_PANEL_STATES: PanelStates = {
  bandConditions: false,
  pathAnalysis: false,
  dxSpotList: false,
  satellites: false,
};

// Load saved panel states from localStorage
function loadPanelStates(): PanelStates {
  try {
    const saved = localStorage.getItem("propulse-panel-states");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to handle any new panels added in the future
      return { ...DEFAULT_PANEL_STATES, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_PANEL_STATES };
}

function savePanelStates(states: PanelStates): void {
  try {
    localStorage.setItem("propulse-panel-states", JSON.stringify(states));
  } catch {
    // Ignore storage errors
  }
}

// Default label options
const DEFAULT_LABEL_OPTIONS: LabelOptions = {
  borders: true,
  stateBorders: false,
  countryNames: true,
  cities: true,
  maidenheadGrid: false,
  gridLabels: false,
  wasOverlay: false,
  tileLabels: false,
};

// Load saved label options from localStorage
function loadLabelOptions(): LabelOptions {
  try {
    const saved = localStorage.getItem("propulse-label-options");
    if (saved) return { ...DEFAULT_LABEL_OPTIONS, ...JSON.parse(saved) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_LABEL_OPTIONS };
}

function saveLabelOptions(options: LabelOptions) {
  localStorage.setItem("propulse-label-options", JSON.stringify(options));
}

// Spot filters persistence
function loadSpotFilters(): SpotFilters {
  try {
    const saved = localStorage.getItem("propulse-spot-filters");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        bands: Array.isArray(parsed.bands)
          ? parsed.bands.filter((v: unknown) => typeof v === "string")
          : [],
        modes: Array.isArray(parsed.modes)
          ? parsed.modes.filter((v: unknown) => typeof v === "string")
          : [],
      };
    }
  } catch {
    // Ignore parse errors
  }
  return { bands: [], modes: [] };
}

function saveSpotFilters(filters: SpotFilters): void {
  try {
    localStorage.setItem("propulse-spot-filters", JSON.stringify(filters));
  } catch {
    // Ignore storage errors
  }
}

// Custom profiles persistence
function loadCustomProfiles(): OperatingProfile[] {
  try {
    const saved = localStorage.getItem("propulse-custom-profiles");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveCustomProfiles(profiles: OperatingProfile[]): void {
  try {
    localStorage.setItem("propulse-custom-profiles", JSON.stringify(profiles));
  } catch {
    // Ignore storage errors
  }
}

// Active profile persistence
function loadActiveProfile(): OperatingProfile | null {
  try {
    const saved = localStorage.getItem("propulse-active-profile");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveActiveProfile(profile: OperatingProfile | null): void {
  try {
    if (profile) {
      localStorage.setItem("propulse-active-profile", JSON.stringify(profile));
    } else {
      localStorage.removeItem("propulse-active-profile");
    }
  } catch {
    // Ignore storage errors
  }
}

// Map style persistence
function loadMapStyle(): MapStyle {
  try {
    const saved = localStorage.getItem("propulse-map-style");
    if (saved === "satellite" || saved === "standard") return saved;
  } catch {
    /* ignore */
  }
  return "satellite";
}

function saveMapStyle(style: MapStyle) {
  localStorage.setItem("propulse-map-style", style);
}

// Layout mode persistence
function loadLayoutMode(): LayoutMode {
  try {
    const saved = localStorage.getItem("propulse-layout-mode");
    if (
      saved === "normal" ||
      saved === "pro" ||
      saved === "lite" ||
      saved === "hamclock"
    ) {
      // Don't restore fullscreen modes on page load — start in normal
      if (saved === "pro" || saved === "hamclock") return "normal";
      return saved;
    }
  } catch {
    /* ignore */
  }
  return "normal";
}

function saveLayoutMode(mode: LayoutMode) {
  localStorage.setItem("propulse-layout-mode", mode);
}

// Load saved region presets from localStorage, merging user presets with built-in defaults
function loadRegionPresets(): RegionPreset[] {
  const builtIns = DEFAULT_REGION_PRESETS.map((p) => ({ ...p }));
  try {
    const saved = localStorage.getItem("propulse-region-presets");
    if (saved) {
      const userPresets: RegionPreset[] = JSON.parse(saved);
      return [...builtIns, ...userPresets];
    }
  } catch {
    // Ignore parse errors
  }
  return builtIns;
}

// Save only non-built-in (user) presets to localStorage
function saveRegionPresets(presets: RegionPreset[]): void {
  try {
    const userPresets = presets.filter((p) => !p.isBuiltIn);
    localStorage.setItem(
      "propulse-region-presets",
      JSON.stringify(userPresets),
    );
  } catch {
    // Ignore storage errors
  }
}

// Load the active region preset id from localStorage
function loadActivePresetId(): string | null {
  try {
    const saved = localStorage.getItem("propulse-active-preset-id");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

// Save the active region preset id to localStorage
function saveActivePresetId(id: string | null): void {
  try {
    localStorage.setItem("propulse-active-preset-id", JSON.stringify(id));
  } catch {
    // Ignore storage errors
  }
}

// ── Pro panel layout persistence ─────────────────────────────────────────────

const PRO_PANEL_LAYOUT_KEY = "propulse-pro-panel-layout";

// Compute pixel positions from viewport percentages at load time
function pctToPx(xPct: number, yPct: number): { x: number; y: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
  return { x: Math.round((xPct / 100) * vw), y: Math.round((yPct / 100) * vh) };
}

function buildDefaultProPanelLayout(): Record<string, ProPanelLayoutEntry> {
  const bc = pctToPx(1, 8);
  const pa = pctToPx(80, 8);
  const dx = pctToPx(20, 72);
  const rec = pctToPx(1, 62);
  const sat = pctToPx(80, 50);
  return {
    "band-conditions": { ...bc, width: 256, height: 400, collapsed: false },
    "path-analysis": { ...pa, width: 288, height: 400, collapsed: false },
    "dx-spots": { ...dx, width: 600, height: 200, collapsed: false },
    recommendations: { ...rec, width: 320, height: 180, collapsed: false },
    satellites: { ...sat, width: 260, height: 360, collapsed: true },
  };
}

const DEFAULT_PRO_PANEL_LAYOUT = buildDefaultProPanelLayout();

function loadProPanelLayout(): Record<string, ProPanelLayoutEntry> {
  try {
    const saved = localStorage.getItem(PRO_PANEL_LAYOUT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Check if saved data has stale tiny-pixel positions from old defaults
      // (old defaults used percentage-like values 1-80 as raw pixels)
      const hasStalePositions = Object.values(parsed).some((entry: unknown) => {
        const e = entry as ProPanelLayoutEntry;
        return e && !e.collapsed && e.x < 100 && e.y < 100 && e.width > 100;
      });
      if (hasStalePositions) {
        // Reset to fresh computed defaults
        const fresh = buildDefaultProPanelLayout();
        saveProPanelLayout(fresh);
        return fresh;
      }
      // Merge with defaults so new panels get default positions
      return { ...DEFAULT_PRO_PANEL_LAYOUT, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_PRO_PANEL_LAYOUT };
}

function saveProPanelLayout(layout: Record<string, ProPanelLayoutEntry>): void {
  try {
    localStorage.setItem(PRO_PANEL_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Ignore storage errors
  }
}

// ── Pro ribbon expanded persistence ──────────────────────────────────────────

const PRO_RIBBON_KEY = "propulse-pro-ribbon-expanded";

function loadProRibbonExpanded(): boolean {
  try {
    const saved = localStorage.getItem(PRO_RIBBON_KEY);
    if (saved !== null) return JSON.parse(saved) === true;
  } catch {
    // Ignore parse errors
  }
  return true; // expanded by default
}

function saveProRibbonExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(PRO_RIBBON_KEY, JSON.stringify(expanded));
  } catch {
    // Ignore storage errors
  }
}

// ── Auto-rotate speed persistence ─────────────────────────────────────────────

const AUTO_ROTATE_SPEED_KEY = "propulse-auto-rotate-speed";
const DEFAULT_AUTO_ROTATE_SPEED = 86_400; // real-time (1 rev per 24 hours)

function loadAutoRotateSpeed(): number {
  try {
    const saved = localStorage.getItem(AUTO_ROTATE_SPEED_KEY);
    if (saved) {
      const parsed = Number(saved);
      if (Number.isFinite(parsed) && parsed >= 60 && parsed <= 86_400) {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_AUTO_ROTATE_SPEED;
}

function saveAutoRotateSpeed(speed: number): void {
  try {
    localStorage.setItem(AUTO_ROTATE_SPEED_KEY, String(speed));
  } catch {
    // Ignore storage errors
  }
}

// ── Beacon inactive opacity persistence ────────────────────────────────────────

const BEACON_INACTIVE_OPACITY_KEY = "propulse-beacon-inactive-opacity";

function loadBeaconInactiveOpacity(): number {
  try {
    const saved = localStorage.getItem(BEACON_INACTIVE_OPACITY_KEY);
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;
    }
  } catch {
    /* ignore */
  }
  return 0.6;
}

function saveBeaconInactiveOpacity(opacity: number): void {
  try {
    localStorage.setItem(BEACON_INACTIVE_OPACITY_KEY, String(opacity));
  } catch {
    /* ignore */
  }
}

// ── NVIS dome opacity persistence ────────────────────────────────────────────

const NVIS_OPACITY_KEY = "propulse-nvis-opacity";

function loadNvisOpacity(): number {
  try {
    const saved = localStorage.getItem(NVIS_OPACITY_KEY);
    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 0.8)
        return parsed;
    }
  } catch {
    /* ignore */
  }
  return 0.35;
}

function saveNvisOpacity(opacity: number): void {
  try {
    localStorage.setItem(NVIS_OPACITY_KEY, String(opacity));
  } catch {
    /* ignore */
  }
}

// ── Dock groups persistence ───────────────────────────────────────────────────

const DOCK_GROUPS_KEY = "propulse-dock-groups";

function loadDockGroups(): DockGroup[] {
  try {
    const saved = localStorage.getItem(DOCK_GROUPS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

function saveDockGroups(groups: DockGroup[]): void {
  try {
    localStorage.setItem(DOCK_GROUPS_KEY, JSON.stringify(groups));
  } catch {
    // Ignore storage errors
  }
}

const initialState = {
  viewMode: "globe" as ViewMode,
  timeOffset: 0,
  absoluteTime: null as string | null,
  timeScenarios: loadTimeScenarios(),
  target: null,
  recentTargets: loadRecentTargets(),
  rotation: { x: 23.5, y: 0 }, // Earth's axial tilt
  zoom: 1,
  autoRotate: false,
  autoRotateSpeed: loadAutoRotateSpeed(),
  observatoryMode: false,
  observatoryPreviousState: null as {
    layoutMode: LayoutMode;
    autoRotate: boolean;
    viewMode: ViewMode;
  } | null,
  layers: {
    terminator: true,
    greyline: true,
    aurora: false,
    muf: false,
    nvis: false,
    spots: true,
    spotTraces: false,
    nightLights: true,
    labels: false,
    satellites: false,
    earthquakes: false,
    weather: false,
    lightning: false,
    wspr: false,
    contestQsos: false,
    loggedQsos: false,
    fires: false,
    radar: false,
    issTracker: false,
    gridActivity: false,
    ionosphere: false,
    rayPath: false,
    drap: false,
    geomagField: false,
    noiseFloor: false,
    meteorShowers: false,
    beacons: false,
    spectrumRing: false,
    ducting: false,
    sporadicE: false,
    satelliteFootprints: false,
    ft8Spotter: false,
    goesCloud: false,
    tec: false,
    repeaters: false,
    riverGauges: false,
    aprs: false,
  },
  nvisEnabled: false,
  activePreset: null as PresetName | null,
  activeProfile: loadActiveProfile(),
  spotFilters: loadSpotFilters(),
  customProfiles: loadCustomProfiles(),
  isFullscreen: false,
  isLiteMode: false,
  layoutMode: loadLayoutMode(),
  isDXConsoleExpanded: false,
  interactionMode: "normal" as MapInteractionMode,
  overlayLayers: {} as Record<string, OverlayLayerModel>,
  tooltipPosition: null as TooltipPosition | null,
  flyoutPosition: null as FlyoutPosition | null,
  pathMode: "short" as "short" | "long",
  panelStates: loadPanelStates(),
  mapStyle: loadMapStyle(),
  labelOptions: loadLabelOptions(),
  centerLocation: null as CenterLocation | null,
  regionPresets: loadRegionPresets(),
  activePresetId: loadActivePresetId(),

  // Arc display density
  displayDensity: 50,

  // Grid label detail level (1=field, 2=square, 3=subsquare)
  gridLabelDetail: (() => {
    try {
      const saved = localStorage.getItem("propulse-grid-label-detail");
      if (saved) return Math.max(1, Math.min(3, parseInt(saved, 10)));
    } catch {
      /* ignore */
    }
    return 2;
  })(),

  // Spot replay (time machine)
  replayEnabled: false,

  // Phase 3 feature layer toggles
  showEsLayer: false,
  showObservedMUF: false,
  observedMUFMode: "off" as "observed" | "divergence" | "off",
  showCorrelation: true, // On by default

  // Pro toolbar ribbon
  proRibbonExpanded: loadProRibbonExpanded(),

  // Pro mode floating panel layout (persisted)
  proPanelLayout: loadProPanelLayout(),

  // Panel docking
  dockGroups: loadDockGroups(),

  // Satellite UI state (ephemeral — resets on page refresh)
  selectedSatelliteId: null as number | null,
  satelliteCategoryFilter: "all" as SatelliteCategory | "all",
  satelliteShowAll: false,

  // Beacon inactive opacity (persisted)
  beaconInactiveOpacity: loadBeaconInactiveOpacity(),

  // NVIS dome opacity (persisted)
  nvisOpacity: loadNvisOpacity(),
};

export const useMapStore = create<MapState>((set, get) => ({
  ...initialState,

  setViewMode: (viewMode) =>
    set((state) => {
      if (state.activePresetId) {
        saveActivePresetId(null);
      }
      return { viewMode, activePresetId: null };
    }),

  setTimeOffset: (timeOffset) =>
    set({
      timeOffset: Math.max(-24, Math.min(24, timeOffset)),
      absoluteTime: null,
    }),

  setAbsoluteTime: (absoluteTime) => set({ absoluteTime }),

  addTimeScenario: (name, time, target) =>
    set((state) => {
      const newScenario: TimeScenario = {
        id: crypto.randomUUID(),
        name,
        time: time.toISOString(),
        target: target || undefined,
        createdAt: new Date().toISOString(),
      };
      const updated = [...state.timeScenarios, newScenario];
      saveTimeScenarios(updated);
      return { timeScenarios: updated };
    }),

  removeTimeScenario: (id) =>
    set((state) => {
      const updated = state.timeScenarios.filter((s) => s.id !== id);
      saveTimeScenarios(updated);
      return { timeScenarios: updated };
    }),

  applyTimeScenario: (id) =>
    set((state) => {
      const scenario = state.timeScenarios.find((s) => s.id === id);
      if (!scenario) {
        return {};
      }
      return {
        absoluteTime: scenario.time,
        target: scenario.target || state.target,
      };
    }),

  setTarget: (target) =>
    set((state) => {
      // If target is null, just clear it without affecting recent targets
      if (!target) {
        return { target: null };
      }

      // Add to recent targets (avoiding duplicates by lat/lon)
      const existingIndex = state.recentTargets.findIndex(
        (t) => t.lat === target.lat && t.lon === target.lon,
      );

      let updatedRecent: TargetLocation[];
      if (existingIndex >= 0) {
        // Move existing target to the front
        updatedRecent = [
          target,
          ...state.recentTargets.filter((_, i) => i !== existingIndex),
        ];
      } else {
        // Add new target to front, keep max limit
        updatedRecent = [target, ...state.recentTargets].slice(
          0,
          MAX_RECENT_TARGETS,
        );
      }

      saveRecentTargets(updatedRecent);
      return { target, recentTargets: updatedRecent };
    }),

  clearRecentTargets: () =>
    set(() => {
      saveRecentTargets([]);
      return { recentTargets: [] };
    }),

  setRotation: (rotation) =>
    set((state) => {
      if (state.activePresetId) {
        saveActivePresetId(null);
      }
      const updates: Partial<MapState> = { rotation };
      if (state.activePresetId !== null) updates.activePresetId = null;
      return updates;
    }),

  setZoom: (zoom) =>
    set((state) => {
      if (state.activePresetId) {
        saveActivePresetId(null);
      }
      return { zoom: Math.max(1, Math.min(10, zoom)), activePresetId: null };
    }),

  setAutoRotate: (autoRotate) => set({ autoRotate }),

  setAutoRotateSpeed: (speed) => {
    const clamped = Math.max(60, Math.min(86_400, Math.round(speed)));
    saveAutoRotateSpeed(clamped);
    set({ autoRotateSpeed: clamped });
  },

  enterObservatory: () =>
    set((state) => {
      // Guard against double-entry — don't overwrite saved state
      if (state.observatoryMode) return {};
      return {
        observatoryPreviousState: {
          layoutMode: state.layoutMode,
          autoRotate: state.autoRotate,
          viewMode: state.viewMode,
        },
        observatoryMode: true,
        layoutMode: "pro" as LayoutMode,
        isFullscreen: true,
        autoRotate: true,
        viewMode: "globe" as ViewMode,
      };
    }),

  exitObservatory: () =>
    set((state) => {
      const prev = state.observatoryPreviousState;
      return {
        observatoryMode: false,
        observatoryPreviousState: null,
        layoutMode: prev?.layoutMode ?? ("normal" as LayoutMode),
        isFullscreen: prev?.layoutMode === "pro",
        isLiteMode: prev?.layoutMode === "lite",
        autoRotate: prev?.autoRotate ?? false,
        viewMode: prev?.viewMode ?? ("globe" as ViewMode),
      };
    }),

  setMapStyle: (mapStyle) =>
    set(() => {
      saveMapStyle(mapStyle);
      return { mapStyle };
    }),

  toggleLayer: (layer) =>
    set((state) => {
      // Clear active profile when layers are manually changed
      if (state.activeProfile) {
        saveActiveProfile(null);
      }
      const updates: Partial<MapState> = {
        layers: {
          ...state.layers,
          [layer]: !state.layers[layer],
        },
      };
      if (state.activePreset !== null) updates.activePreset = null;
      if (state.activeProfile !== null) updates.activeProfile = null;
      return updates;
    }),

  applyPreset: (preset) => {
    saveActiveProfile(null);
    return set({
      layers: { ...LAYER_PRESETS[preset] },
      activePreset: preset,
      activeProfile: null,
    });
  },

  clearPreset: () => set({ activePreset: null }),

  // ── Operating profile actions ─────────────────────────────────────────────

  applyProfile: (profile) => {
    // 1. Set layers
    // 2. Set spot filters (persisted)
    const spotFilters = { ...profile.spotFilters };
    saveSpotFilters(spotFilters);

    // 3. Set map style (persisted)
    saveMapStyle(profile.mapStyle);

    // 4. Set panel states from profile panel config (persisted)
    const panelStates: PanelStates = {
      bandConditions: profile.panelConfig.bandConditions.collapsed,
      pathAnalysis: profile.panelConfig.pathAnalysis.collapsed,
      dxSpotList: profile.panelConfig.dxCluster.collapsed,
      satellites: profile.panelConfig.satellites.collapsed,
    };
    savePanelStates(panelStates);

    // 5. Persist active profile
    saveActiveProfile(profile);

    // 6. Apply all state at once
    set({
      layers: {
        ...get().layers,
        ...profile.layers,
      },
      spotFilters,
      // profile.autoFollow now handled by watchStore.autoPan
      mapStyle: profile.mapStyle,
      panelStates,
      activeProfile: profile,
      activePreset: null,
    });

    // 7. Set spotColorMode and visualStyle via settingsStore
    useSettingsStore.getState().updateUIInteraction({
      spotColorMode: profile.spotColorMode,
      visualStyle: profile.visualStyle,
    });
  },

  clearProfile: () => {
    saveActiveProfile(null);
    set({ activeProfile: null });
  },

  setSpotFilters: (filters) => {
    saveSpotFilters(filters);
    saveActiveProfile(null);
    set({ spotFilters: filters, activeProfile: null });
  },

  clearSpotFilters: () => {
    const empty: SpotFilters = { bands: [], modes: [] };
    saveSpotFilters(empty);
    saveActiveProfile(null);
    set({ spotFilters: empty, activeProfile: null });
  },

  saveCustomProfile: (profile) =>
    set((state) => {
      const updated = [
        ...state.customProfiles.filter((p) => p.id !== profile.id),
        profile,
      ];
      saveCustomProfiles(updated);
      return { customProfiles: updated };
    }),

  deleteCustomProfile: (id) =>
    set((state) => {
      const updated = state.customProfiles.filter((p) => p.id !== id);
      saveCustomProfiles(updated);
      // If the deleted profile was active, clear it
      const clearActive = state.activeProfile?.id === id;
      if (clearActive) {
        saveActiveProfile(null);
      }
      return {
        customProfiles: updated,
        ...(clearActive ? { activeProfile: null } : {}),
      };
    }),

  toggleNVIS: () =>
    set((state) => ({
      nvisEnabled: !state.nvisEnabled,
      layers: {
        ...state.layers,
        nvis: !state.nvisEnabled,
      },
      activePreset: null,
    })),

  setNVISEnabled: (enabled) =>
    set((state) => ({
      nvisEnabled: enabled,
      layers: {
        ...state.layers,
        nvis: enabled,
      },
      activePreset: null,
    })),

  setFullscreen: (isFullscreen) =>
    set({
      isFullscreen,
      layoutMode: isFullscreen ? "pro" : "normal",
    }),

  toggleFullscreen: () =>
    set((state) => ({
      isFullscreen: !state.isFullscreen,
      layoutMode: !state.isFullscreen ? "pro" : "normal",
    })),

  setLiteMode: (isLiteMode) =>
    set({
      isLiteMode,
      layoutMode: isLiteMode ? "lite" : "normal",
      ...(isLiteMode && { isDXConsoleExpanded: false }),
    }),

  toggleLiteMode: () =>
    set((state) => ({
      isLiteMode: !state.isLiteMode,
      layoutMode: !state.isLiteMode ? "lite" : "normal",
      ...(!state.isLiteMode && { isDXConsoleExpanded: false }),
    })),

  setLayoutMode: (layoutMode) => {
    saveLayoutMode(layoutMode);
    set({
      layoutMode,
      isFullscreen: layoutMode === "pro",
      isLiteMode: layoutMode === "lite",
      ...(layoutMode === "lite" && { isDXConsoleExpanded: false }),
    });
  },

  setDXConsoleExpanded: (isDXConsoleExpanded) => set({ isDXConsoleExpanded }),

  toggleDXConsoleExpanded: () =>
    set((state) => ({ isDXConsoleExpanded: !state.isDXConsoleExpanded })),

  setInteractionMode: (interactionMode) => set({ interactionMode }),

  addOverlayLayer: (layerId, layerModel) =>
    set((state) => ({
      overlayLayers: { ...state.overlayLayers, [layerId]: layerModel },
    })),

  updateOverlayLayer: (layerId, layerModel) =>
    set((state) => ({
      overlayLayers: { ...state.overlayLayers, [layerId]: layerModel },
    })),

  removeOverlayLayer: (layerId) =>
    set((state) => {
      const { [layerId]: _removed, ...rest } = state.overlayLayers;
      return { overlayLayers: rest };
    }),

  clearOverlayLayers: () => set({ overlayLayers: {} }),

  setTooltipPosition: (tooltipPosition) => set({ tooltipPosition }),

  setFlyoutPosition: (flyoutPosition) => set({ flyoutPosition }),

  setPathMode: (pathMode) => set({ pathMode }),

  togglePathMode: () =>
    set((state) => ({
      pathMode: state.pathMode === "short" ? "long" : "short",
    })),

  togglePanel: (panelId) =>
    set((state) => {
      const updated = {
        ...state.panelStates,
        [panelId]: !state.panelStates[panelId],
      };
      savePanelStates(updated);
      return { panelStates: updated };
    }),

  setPanelCollapsed: (panelId, collapsed) =>
    set((state) => {
      const updated = {
        ...state.panelStates,
        [panelId]: collapsed,
      };
      savePanelStates(updated);
      return { panelStates: updated };
    }),

  resetPanelStates: () =>
    set(() => {
      savePanelStates(DEFAULT_PANEL_STATES);
      return { panelStates: { ...DEFAULT_PANEL_STATES } };
    }),

  setLabelOption: (key, value) =>
    set((state) => {
      const updated = { ...state.labelOptions, [key]: value };
      saveLabelOptions(updated);
      return { labelOptions: updated };
    }),

  // Q2: Double-click center location (animates camera without setting target)
  setCenterLocation: (lat, lon) =>
    set({
      centerLocation: { lat, lon, timestamp: Date.now() },
    }),

  clearCenterLocation: () => set({ centerLocation: null }),

  // Region view preset actions
  setActivePreset: (id) =>
    set((state) => {
      const preset = state.regionPresets.find((p) => p.id === id);
      if (!preset) {
        return {};
      }
      const now = new Date().toISOString();
      const updatedPresets = state.regionPresets.map((p) =>
        p.id === id ? { ...p, lastUsed: now } : p,
      );
      saveRegionPresets(updatedPresets);
      saveActivePresetId(id);
      return {
        regionPresets: updatedPresets,
        activePresetId: id,
        rotation: preset.rotation ?? {
          x: preset.center.lat,
          y: -preset.center.lon,
        },
        zoom: preset.zoom,
        ...(preset.viewMode ? { viewMode: preset.viewMode } : {}),
      };
    }),

  clearActivePreset: () =>
    set(() => {
      saveActivePresetId(null);
      return { activePresetId: null };
    }),

  addRegionPreset: (preset) =>
    set((state) => {
      const newPreset: RegionPreset = {
        ...preset,
        id: `preset-user-${crypto.randomUUID()}`,
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
      };
      const updated = [...state.regionPresets, newPreset];
      saveRegionPresets(updated);
      return { regionPresets: updated };
    }),

  updateRegionPreset: (id, updates) =>
    set((state) => {
      const preset = state.regionPresets.find((p) => p.id === id);
      if (!preset || preset.isBuiltIn) {
        return {};
      }
      const updated = state.regionPresets.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      );
      saveRegionPresets(updated);
      return { regionPresets: updated };
    }),

  deleteRegionPreset: (id) =>
    set((state) => {
      const preset = state.regionPresets.find((p) => p.id === id);
      if (!preset || preset.isBuiltIn) {
        return {};
      }
      const updated = state.regionPresets.filter((p) => p.id !== id);
      saveRegionPresets(updated);
      const clearActive = state.activePresetId === id;
      if (clearActive) {
        saveActivePresetId(null);
      }
      return {
        regionPresets: updated,
        ...(clearActive ? { activePresetId: null } : {}),
      };
    }),

  reorderRegionPresets: (orderedIds) =>
    set((state) => {
      const presetMap = new Map(state.regionPresets.map((p) => [p.id, p]));
      const reordered: RegionPreset[] = [];
      for (const id of orderedIds) {
        const preset = presetMap.get(id);
        if (preset) {
          reordered.push(preset);
          presetMap.delete(id);
        }
      }
      // Append any presets not included in orderedIds (safety fallback)
      for (const preset of presetMap.values()) {
        reordered.push(preset);
      }
      saveRegionPresets(reordered);
      return { regionPresets: reordered };
    }),

  saveCurrentAsPreset: (name, icon) =>
    set((state) => {
      const newPreset: RegionPreset = {
        id: `preset-user-${crypto.randomUUID()}`,
        name,
        icon,
        center: {
          lat: state.rotation.x,
          lon: -state.rotation.y,
        },
        zoom: state.zoom,
        rotation: { ...state.rotation },
        viewMode: state.viewMode,
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
      };
      const updated = [...state.regionPresets, newPreset];
      saveRegionPresets(updated);
      return { regionPresets: updated };
    }),

  exportRegionPresets: (): string => {
    const { regionPresets } = get();
    const userPresets = regionPresets.filter((p) => !p.isBuiltIn);
    return JSON.stringify(userPresets, null, 2);
  },

  importRegionPresets: (json): boolean => {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        return false;
      }
      // Validate each entry has minimum required fields
      for (const item of parsed) {
        if (
          typeof item !== "object" ||
          item === null ||
          typeof item.name !== "string" ||
          typeof item.center !== "object" ||
          typeof item.center?.lat !== "number" ||
          typeof item.center?.lon !== "number" ||
          typeof item.zoom !== "number"
        ) {
          return false;
        }
      }
      const { regionPresets } = get();
      const importedPresets: RegionPreset[] = parsed.map(
        (item: Record<string, unknown>) => ({
          id: `preset-user-${crypto.randomUUID()}`,
          name: String(item.name).slice(0, 64),
          icon: item.icon ? String(item.icon).slice(0, 8) : undefined,
          center: {
            lat: Number((item.center as { lat: number }).lat),
            lon: Number((item.center as { lon: number }).lon),
          },
          zoom: Number(item.zoom),
          rotation: item.rotation as { x: number; y: number } | undefined,
          viewMode: item.viewMode as "globe" | "flat" | "azimuthal" | undefined,
          isBuiltIn: false,
          createdAt: new Date().toISOString(),
        }),
      );
      const updated = [...regionPresets, ...importedPresets];
      saveRegionPresets(updated);
      set({ regionPresets: updated });
      return true;
    } catch {
      return false;
    }
  },

  // Arc display density
  setDisplayDensity: (density) =>
    set({ displayDensity: Math.max(10, Math.min(200, density)) }),

  // Grid label detail level
  setGridLabelDetail: (detail) => {
    const clamped = Math.max(1, Math.min(3, detail));
    try {
      localStorage.setItem("propulse-grid-label-detail", String(clamped));
    } catch {
      /* ignore */
    }
    set({ gridLabelDetail: clamped });
  },

  // Spot replay
  setReplayEnabled: (enabled) => set({ replayEnabled: enabled }),

  // Phase 3 feature layer toggles
  setShowEsLayer: (show) => set({ showEsLayer: show }),
  toggleEsLayer: () => set((state) => ({ showEsLayer: !state.showEsLayer })),

  setObservedMUFMode: (mode) =>
    set({
      observedMUFMode: mode,
      showObservedMUF: mode !== "off",
    }),

  setShowCorrelation: (show) => set({ showCorrelation: show }),
  toggleCorrelation: () =>
    set((state) => ({ showCorrelation: !state.showCorrelation })),

  // Pro toolbar ribbon
  setProRibbonExpanded: (expanded) => {
    saveProRibbonExpanded(expanded);
    set({ proRibbonExpanded: expanded });
  },
  toggleProRibbon: () =>
    set((state) => {
      const next = !state.proRibbonExpanded;
      saveProRibbonExpanded(next);
      return { proRibbonExpanded: next };
    }),

  // Pro panel layout actions
  updateProPanelLayout: (panelId, layout) =>
    set((state) => {
      const existing = state.proPanelLayout[panelId];
      const updated = {
        ...state.proPanelLayout,
        [panelId]: {
          ...layout,
          collapsed: existing?.collapsed ?? false,
        },
      };
      saveProPanelLayout(updated);
      return { proPanelLayout: updated };
    }),

  toggleProPanelCollapse: (panelId) =>
    set((state) => {
      const existing = state.proPanelLayout[panelId];
      if (!existing) return {};
      const nowCollapsed = !existing.collapsed;

      // Compute docked edge and order when collapsing
      let dockedEdge: "left" | "right" | undefined;
      let dockedOrder: number | undefined;
      if (nowCollapsed) {
        const panelCenterX = existing.x + existing.width / 2;
        const viewportCenterX =
          typeof window !== "undefined" ? window.innerWidth / 2 : 960;
        dockedEdge = panelCenterX < viewportCenterX ? "left" : "right";
        dockedOrder = existing.y + existing.height / 2;
      }

      const updated = {
        ...state.proPanelLayout,
        [panelId]: {
          ...existing,
          collapsed: nowCollapsed,
          dockedEdge,
          dockedOrder,
        },
      };
      saveProPanelLayout(updated);

      // Collapsing a docked panel removes it from its dock group
      if (nowCollapsed) {
        const dockGroups = state.dockGroups
          .map((g) => {
            if (!g.panelIds.includes(panelId)) return g;
            const remaining = g.panelIds.filter((id) => id !== panelId);
            return { ...g, panelIds: remaining };
          })
          .filter((g) => g.panelIds.length >= 2);
        saveDockGroups(dockGroups);
        return { proPanelLayout: updated, dockGroups };
      }

      return { proPanelLayout: updated };
    }),

  resetProPanelLayout: () =>
    set(() => {
      const fresh = { ...DEFAULT_PRO_PANEL_LAYOUT };
      saveProPanelLayout(fresh);
      return { proPanelLayout: fresh, dockGroups: [] };
    }),

  // ── Dock group actions ──────────────────────────────────────────────────

  setDockGroups: (groups) => {
    saveDockGroups(groups);
    set({ dockGroups: groups });
  },

  addDockGroup: (group) =>
    set((state) => {
      const updated = [...state.dockGroups, group];
      saveDockGroups(updated);
      return { dockGroups: updated };
    }),

  removeDockGroup: (groupId) =>
    set((state) => {
      const updated = state.dockGroups.filter((g) => g.id !== groupId);
      saveDockGroups(updated);
      return { dockGroups: updated };
    }),

  updateDockGroup: (groupId, updates) =>
    set((state) => {
      const updated = state.dockGroups.map((g) =>
        g.id === groupId ? { ...g, ...updates } : g,
      );
      saveDockGroups(updated);
      return { dockGroups: updated };
    }),

  removePanelFromDockGroup: (panelId) =>
    set((state) => {
      const updated: DockGroup[] = [];
      for (const group of state.dockGroups) {
        const filtered = group.panelIds.filter((id) => id !== panelId);
        // Dissolve groups with fewer than 2 panels
        if (filtered.length >= 2) {
          updated.push({ ...group, panelIds: filtered });
        }
      }
      saveDockGroups(updated);
      return { dockGroups: updated };
    }),

  // Satellite UI state setters (ephemeral — no persistence)
  setSelectedSatelliteId: (noradId) => set({ selectedSatelliteId: noradId }),
  setSatelliteCategoryFilter: (cat) => set({ satelliteCategoryFilter: cat }),
  setSatelliteShowAll: (show) => set({ satelliteShowAll: show }),

  // Beacon inactive opacity
  setBeaconInactiveOpacity: (opacity) => {
    const clamped = Math.max(0, Math.min(1, opacity));
    saveBeaconInactiveOpacity(clamped);
    set({ beaconInactiveOpacity: clamped });
  },

  // NVIS dome opacity
  setNvisOpacity: (opacity) => {
    const clamped = Math.max(0.1, Math.min(0.8, opacity));
    saveNvisOpacity(clamped);
    set({ nvisOpacity: clamped });
  },

  reset: () => set(initialState),
}));

/**
 * Get the display time based on current time settings.
 * If absoluteTime is set, returns that. Otherwise, returns now + timeOffset.
 */
export function getDisplayTime(): Date {
  const state = useMapStore.getState();
  if (state.absoluteTime) {
    return new Date(state.absoluteTime);
  }
  const now = new Date();
  return new Date(now.getTime() + state.timeOffset * 60 * 60 * 1000);
}

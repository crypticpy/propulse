import { create } from "zustand";
import { type RegionPreset, DEFAULT_REGION_PRESETS } from "@/types/map";

export type ViewMode = "globe" | "flat" | "azimuthal";
export type MapStyle = "satellite" | "standard";

// Layer preset configurations for common use cases
export const LAYER_PRESETS = {
  "dx-hunter": {
    terminator: true,
    greyline: true,
    aurora: false,
    muf: true,
    nvis: false,
    spots: true,
    nightLights: true,
    labels: false,
    satellites: false,
  },
  contest: {
    terminator: true,
    greyline: false,
    aurora: false,
    muf: false,
    nvis: false,
    spots: true,
    nightLights: false,
    labels: false,
    satellites: false,
  },
  vhf: {
    terminator: true,
    greyline: false,
    aurora: true,
    muf: false,
    nvis: false,
    spots: false,
    nightLights: false,
    labels: false,
    satellites: true,
  },
  emergency: {
    terminator: true,
    greyline: true,
    aurora: false,
    muf: false,
    nvis: true,
    spots: false,
    nightLights: true,
    labels: true,
    satellites: false,
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
}

export type PanelId = keyof PanelStates;

/** Label layer sub-options */
export interface LabelOptions {
  borders: boolean;
  stateBorders: boolean;
  countryNames: boolean;
  cities: boolean;
  maidenheadGrid: boolean;
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

  // Layer visibility
  layers: {
    terminator: boolean;
    greyline: boolean;
    aurora: boolean;
    muf: boolean;
    nvis: boolean;
    spots: boolean;
    nightLights: boolean;
    labels: boolean;
    satellites: boolean;
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

  // Fullscreen mode
  isFullscreen: boolean;
  setFullscreen: (value: boolean) => void;
  toggleFullscreen: () => void;

  // Lite mode (minimized panels)
  isLiteMode: boolean;
  setLiteMode: (value: boolean) => void;
  toggleLiteMode: () => void;

  // DX Console expanded state
  isDXConsoleExpanded: boolean;
  setDXConsoleExpanded: (value: boolean) => void;
  toggleDXConsoleExpanded: () => void;

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
  layers: {
    terminator: true,
    greyline: true,
    aurora: false,
    muf: false,
    nvis: false,
    spots: true,
    nightLights: true,
    labels: false,
    satellites: false,
  },
  nvisEnabled: false,
  activePreset: null as PresetName | null,
  isFullscreen: false,
  isLiteMode: false,
  isDXConsoleExpanded: false,
  tooltipPosition: null as TooltipPosition | null,
  flyoutPosition: null as FlyoutPosition | null,
  pathMode: "short" as "short" | "long",
  panelStates: loadPanelStates(),
  mapStyle: loadMapStyle(),
  labelOptions: loadLabelOptions(),
  centerLocation: null as CenterLocation | null,
  regionPresets: loadRegionPresets(),
  activePresetId: loadActivePresetId(),

  // Phase 3 feature layer toggles
  showEsLayer: false,
  showObservedMUF: false,
  observedMUFMode: "off" as "observed" | "divergence" | "off",
  showCorrelation: true, // On by default
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
      return { rotation, activePresetId: null };
    }),

  setZoom: (zoom) =>
    set((state) => {
      if (state.activePresetId) {
        saveActivePresetId(null);
      }
      return { zoom: Math.max(0.5, Math.min(4, zoom)), activePresetId: null };
    }),

  setAutoRotate: (autoRotate) => set({ autoRotate }),

  setMapStyle: (mapStyle) =>
    set(() => {
      saveMapStyle(mapStyle);
      return { mapStyle };
    }),

  toggleLayer: (layer) =>
    set((state) => ({
      layers: {
        ...state.layers,
        [layer]: !state.layers[layer],
      },
      // Clear active preset when layers are manually changed
      activePreset: null,
    })),

  applyPreset: (preset) =>
    set({
      layers: { ...LAYER_PRESETS[preset] },
      activePreset: preset,
    }),

  clearPreset: () => set({ activePreset: null }),

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

  setFullscreen: (isFullscreen) => set({ isFullscreen }),

  toggleFullscreen: () =>
    set((state) => ({ isFullscreen: !state.isFullscreen })),

  setLiteMode: (isLiteMode) =>
    set({
      isLiteMode,
      // Auto-collapse DX Console when entering lite mode
      ...(isLiteMode && { isDXConsoleExpanded: false }),
    }),

  toggleLiteMode: () =>
    set((state) => ({
      isLiteMode: !state.isLiteMode,
      // Auto-collapse DX Console when entering lite mode
      ...(!state.isLiteMode && { isDXConsoleExpanded: false }),
    })),

  setDXConsoleExpanded: (isDXConsoleExpanded) => set({ isDXConsoleExpanded }),

  toggleDXConsoleExpanded: () =>
    set((state) => ({ isDXConsoleExpanded: !state.isDXConsoleExpanded })),

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

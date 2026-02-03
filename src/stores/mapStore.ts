import { create } from "zustand";

export type ViewMode = "globe" | "flat" | "azimuthal";

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

  // Center location (Q2: double-click centering without setting target)
  centerLocation: CenterLocation | null;
  setCenterLocation: (lat: number, lon: number) => void;
  clearCenterLocation: () => void;

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
  centerLocation: null as CenterLocation | null,
};

export const useMapStore = create<MapState>((set) => ({
  ...initialState,

  setViewMode: (viewMode) => set({ viewMode }),

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
      if (!scenario) return {};
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

  setRotation: (rotation) => set({ rotation }),

  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(3, zoom)) }),

  setAutoRotate: (autoRotate) => set({ autoRotate }),

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

  // Q2: Double-click center location (animates camera without setting target)
  setCenterLocation: (lat, lon) =>
    set({
      centerLocation: { lat, lon, timestamp: Date.now() },
    }),

  clearCenterLocation: () => set({ centerLocation: null }),

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

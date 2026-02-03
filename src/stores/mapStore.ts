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

interface MapState {
  // View settings
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Time offset in hours from current time (-24 to +24)
  timeOffset: number;
  setTimeOffset: (offset: number) => void;

  // Target location for path analysis
  target: TargetLocation | null;
  setTarget: (target: TargetLocation | null) => void;

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

  // Reset to defaults
  reset: () => void;
}

const initialState = {
  viewMode: "globe" as ViewMode,
  timeOffset: 0,
  target: null,
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
};

export const useMapStore = create<MapState>((set) => ({
  ...initialState,

  setViewMode: (viewMode) => set({ viewMode }),

  setTimeOffset: (timeOffset) =>
    set({ timeOffset: Math.max(-24, Math.min(24, timeOffset)) }),

  setTarget: (target) => set({ target }),

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

  setLiteMode: (isLiteMode) => set({ isLiteMode }),

  toggleLiteMode: () => set((state) => ({ isLiteMode: !state.isLiteMode })),

  reset: () => set(initialState),
}));

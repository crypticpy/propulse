import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AtmosViewMode,
  AtmosLayerId,
  MonitoredRegion,
  RIMConfig,
  RIMResult,
} from "@/types/atmos";
import { DEFAULT_LAYER_VISIBILITY, DEFAULT_RIM_CONFIG } from "@/types/atmos";

export interface AtmosState {
  // ── Persisted ──────────────────────────────────────────────────────
  viewMode: AtmosViewMode;
  layerVisibility: Record<AtmosLayerId, boolean>;
  monitoredRegions: MonitoredRegion[];
  rimConfig: RIMConfig;
  mapCenter: { lat: number; lon: number; zoom: number };

  // ── Runtime (not persisted) ────────────────────────────────────────
  rimScores: Record<string, RIMResult>;
  selectedAlertId: string | null;
  radarFrame: number;
  sidebarOpen: boolean;

  // ── Actions ────────────────────────────────────────────────────────
  setViewMode: (mode: AtmosViewMode) => void;
  toggleLayer: (layerId: AtmosLayerId) => void;
  setLayerVisibility: (layerId: AtmosLayerId, visible: boolean) => void;
  addMonitoredRegion: (region: MonitoredRegion) => void;
  removeMonitoredRegion: (id: string) => void;
  updateRimConfig: (patch: Partial<RIMConfig>) => void;
  setMapCenter: (center: { lat: number; lon: number; zoom: number }) => void;
  setRimScores: (scores: Record<string, RIMResult>) => void;
  setSelectedAlertId: (id: string | null) => void;
  setRadarFrame: (frame: number) => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAtmosStore = create<AtmosState>()(
  persist(
    (set) => ({
      // Persisted defaults
      viewMode: "2d",
      layerVisibility: { ...DEFAULT_LAYER_VISIBILITY },
      monitoredRegions: [],
      rimConfig: { ...DEFAULT_RIM_CONFIG },
      mapCenter: { lat: 30.5, lon: -97.7, zoom: 5 }, // Austin, TX default

      // Runtime
      rimScores: {},
      selectedAlertId: null,
      radarFrame: -1,
      sidebarOpen: true,

      // Actions
      setViewMode: (mode) => set({ viewMode: mode }),
      toggleLayer: (layerId) =>
        set((s) => ({
          layerVisibility: {
            ...s.layerVisibility,
            [layerId]: !s.layerVisibility[layerId],
          },
        })),
      setLayerVisibility: (layerId, visible) =>
        set((s) => ({
          layerVisibility: { ...s.layerVisibility, [layerId]: visible },
        })),
      addMonitoredRegion: (region) =>
        set((s) => ({
          monitoredRegions: [...s.monitoredRegions, region],
        })),
      removeMonitoredRegion: (id) =>
        set((s) => ({
          monitoredRegions: s.monitoredRegions.filter((r) => r.id !== id),
        })),
      updateRimConfig: (patch) =>
        set((s) => ({
          rimConfig: { ...s.rimConfig, ...patch },
        })),
      setMapCenter: (center) => set({ mapCenter: center }),
      setRimScores: (scores) => set({ rimScores: scores }),
      setSelectedAlertId: (id) => set({ selectedAlertId: id }),
      setRadarFrame: (frame) => set({ radarFrame: frame }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: "propulse-atmos",
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        viewMode: state.viewMode,
        layerVisibility: state.layerVisibility,
        monitoredRegions: state.monitoredRegions,
        rimConfig: state.rimConfig,
        mapCenter: state.mapCenter,
      }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          const layers = state.layerVisibility as
            | Record<string, boolean>
            | undefined;
          if (layers) {
            if (!("aprs" in layers)) layers.aprs = false;
            if (!("shadowZones" in layers)) layers.shadowZones = false;
          }
        }
        if (version < 3) {
          const layers = state.layerVisibility as
            | Record<string, boolean>
            | undefined;
          if (layers) {
            if (!("aurora" in layers)) layers.aurora = true;
            if (!("earthquakes" in layers)) layers.earthquakes = false;
            if (!("goesCloud" in layers)) layers.goesCloud = true;
          }
        }
        if (version < 4) {
          const layers = state.layerVisibility as
            | Record<string, boolean>
            | undefined;
          if (layers) {
            if (!("tropical" in layers)) layers.tropical = true;
          }
        }
        return state as unknown as Omit<
          AtmosState,
          | "setViewMode"
          | "toggleLayer"
          | "setLayerVisibility"
          | "addMonitoredRegion"
          | "removeMonitoredRegion"
          | "updateRimConfig"
          | "setMapCenter"
          | "setRimScores"
          | "setSelectedAlertId"
          | "setRadarFrame"
          | "setSidebarOpen"
        >;
      },
    },
  ),
);

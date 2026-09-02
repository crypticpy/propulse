import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  MapDataProvenance,
  MapDataScope,
} from "@/lib/map/operationalScope";

export interface SelectedReportAttribution {
  id: string;
  callsign: string;
  frequency: number;
  mode: string;
  source: string;
  provenance: MapDataProvenance;
  selectedAt: number;
}

interface MapOperationalState {
  /** Null follows session/CAT/WSJT-X state; a value is an explicit override. */
  manualScope: MapDataScope | null;
  workspaceOpen: boolean;
  selectedReport: SelectedReportAttribution | null;
  setManualScope: (scope: MapDataScope | null) => void;
  setWorkspaceOpen: (open: boolean) => void;
  setSelectedReport: (report: SelectedReportAttribution | null) => void;
}

/**
 * Renderer-independent operating intent. Durable draft, contest, target, and
 * radio facts remain in their canonical stores; this store only coordinates
 * how PropSphere presents them.
 */
export const useMapOperationalStore = create<MapOperationalState>()(
  persist(
    (set) => ({
      manualScope: null,
      workspaceOpen: false,
      selectedReport: null,
      setManualScope: (manualScope) => set({ manualScope }),
      setWorkspaceOpen: (workspaceOpen) => set({ workspaceOpen }),
      setSelectedReport: (selectedReport) => set({ selectedReport }),
    }),
    {
      name: "propulse-map-operational",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        manualScope: state.manualScope,
        selectedReport: state.selectedReport,
      }),
    },
  ),
);

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  MapDataProvenance,
  MapDataScope,
} from "@/lib/map/operationalScope";
import { contestEventBus } from "@/lib/services/contestEventBus";
import { useContestStore } from "@/stores/contestStore";

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
        // Contest intent belongs to a live session. Never resurrect it from
        // storage after a reload where the contest may already have ended.
        manualScope:
          state.manualScope === "contest" ? null : state.manualScope,
        selectedReport: state.selectedReport,
      }),
    },
  ),
);

// This store module outlives the route that first loaded PropSphere. Listening
// to the existing contest event bus makes session cleanup work even when the
// operator ends a contest from /contest or from a synchronized second window.
contestEventBus.subscribe((event) => {
  if (event.type !== "SESSION_ENDED") return;
  // switchContest emits ENDED after installing the replacement session; that
  // transition remains contest-scoped and must not collapse the workspace.
  if (useContestStore.getState().activeSession) return;
  const state = useMapOperationalStore.getState();
  if (state.manualScope !== "contest") return;
  state.setManualScope(null);
  state.setWorkspaceOpen(false);
});

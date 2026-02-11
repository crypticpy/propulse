/**
 * Zustand store for HamClock layout preferences
 * Persists to localStorage with key 'propulse-hamclock-layout'
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HamClockState {
  /** Which side the spots sidebar appears on */
  spotsSide: "left" | "right";
  /** Per-panel collapse state, keyed by panel ID (de, dx, spacewx, bands) */
  panelCollapsed: Record<string, boolean>;
  /** Whether the entire spots sidebar is collapsed */
  spotsSidebarCollapsed: boolean;
  /** Whether the entire info sidebar is collapsed */
  infoSidebarCollapsed: boolean;

  // Actions
  setSpotsSide: (side: "left" | "right") => void;
  togglePanel: (panelId: string) => void;
  toggleSpotsSidebar: () => void;
  toggleInfoSidebar: () => void;
  isPanelCollapsed: (panelId: string) => boolean;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useHamClockStore = create<HamClockState>()(
  persist(
    (set, get) => ({
      spotsSide: "right",
      panelCollapsed: {},
      spotsSidebarCollapsed: false,
      infoSidebarCollapsed: false,

      setSpotsSide: (side) => set({ spotsSide: side }),

      togglePanel: (panelId) =>
        set((state) => ({
          panelCollapsed: {
            ...state.panelCollapsed,
            [panelId]: !state.panelCollapsed[panelId],
          },
        })),

      toggleSpotsSidebar: () =>
        set((state) => ({
          spotsSidebarCollapsed: !state.spotsSidebarCollapsed,
        })),

      toggleInfoSidebar: () =>
        set((state) => ({
          infoSidebarCollapsed: !state.infoSidebarCollapsed,
        })),

      isPanelCollapsed: (panelId) => !!get().panelCollapsed[panelId],
    }),
    {
      name: "propulse-hamclock-layout",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        spotsSide: state.spotsSide,
        panelCollapsed: state.panelCollapsed,
        spotsSidebarCollapsed: state.spotsSidebarCollapsed,
        infoSidebarCollapsed: state.infoSidebarCollapsed,
      }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 1) {
          if (!("spotsSide" in state)) state.spotsSide = "right";
          if (!("panelCollapsed" in state)) state.panelCollapsed = {};
          if (!("spotsSidebarCollapsed" in state))
            state.spotsSidebarCollapsed = false;
          if (!("infoSidebarCollapsed" in state))
            state.infoSidebarCollapsed = false;
        }
        return state as unknown as HamClockState;
      },
    },
  ),
);

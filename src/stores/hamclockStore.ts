/**
 * Zustand store for HamClock layout preferences
 * Persists to localStorage with key 'propulse-hamclock-layout'
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AntennaType } from "@/lib/data/antennas";

// ─── Types ───────────────────────────────────────────────────────────────────

export type HamClockReliabilityMode = "SSB" | "CW" | "FT8";
export type HamClockReliabilityPower = 5 | 25 | 100 | 500 | 1500;

export interface HamClockReliabilitySettings {
  mode: HamClockReliabilityMode;
  powerWatts: HamClockReliabilityPower;
  antennaType: AntennaType;
}

export const DEFAULT_HAMCLOCK_RELIABILITY: HamClockReliabilitySettings = {
  mode: "FT8",
  powerWatts: 100,
  antennaType: "dipole",
};

export interface HamClockState {
  /** Which side the spots sidebar appears on */
  spotsSide: "left" | "right";
  /** Per-panel collapse state, keyed by panel ID (de, dx, spacewx, bands) */
  panelCollapsed: Record<string, boolean>;
  /** Whether the entire spots sidebar is collapsed */
  spotsSidebarCollapsed: boolean;
  /** Whether the entire info sidebar is collapsed */
  infoSidebarCollapsed: boolean;
  /** Operator inputs used by the enhanced reliability heatmap. */
  reliability: HamClockReliabilitySettings;

  // Actions
  setSpotsSide: (side: "left" | "right") => void;
  /** Toggle a panel using the same default its view renders before persistence. */
  togglePanel: (panelId: string, defaultCollapsed?: boolean) => void;
  toggleSpotsSidebar: () => void;
  toggleInfoSidebar: () => void;
  setReliability: (patch: Partial<HamClockReliabilitySettings>) => void;
}

const VALID_MODES = new Set<HamClockReliabilityMode>(["SSB", "CW", "FT8"]);
const VALID_POWERS = new Set<HamClockReliabilityPower>([
  5,
  25,
  100,
  500,
  1500,
]);
const VALID_ANTENNAS = new Set<AntennaType>([
  "dipole",
  "vertical",
  "yagi_3el",
  "yagi_5el",
  "hex_beam",
  "wire_inverted_v",
  "nvis_dipole",
  "isotropic",
]);

type PersistedHamClockState = Pick<
  HamClockState,
  | "spotsSide"
  | "panelCollapsed"
  | "spotsSidebarCollapsed"
  | "infoSidebarCollapsed"
  | "reliability"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePersistedHamClockState(
  value: unknown,
): PersistedHamClockState {
  const raw = isRecord(value) ? value : {};
  const rawPanels = isRecord(raw.panelCollapsed) ? raw.panelCollapsed : {};
  const panelCollapsed = Object.fromEntries(
    Object.entries(rawPanels).filter((entry) => typeof entry[1] === "boolean"),
  ) as Record<string, boolean>;
  const rawReliability = isRecord(raw.reliability) ? raw.reliability : {};

  return {
    spotsSide: raw.spotsSide === "left" ? "left" : "right",
    panelCollapsed,
    spotsSidebarCollapsed:
      typeof raw.spotsSidebarCollapsed === "boolean"
        ? raw.spotsSidebarCollapsed
        : false,
    infoSidebarCollapsed:
      typeof raw.infoSidebarCollapsed === "boolean"
        ? raw.infoSidebarCollapsed
        : false,
    reliability: {
      mode: VALID_MODES.has(rawReliability.mode as HamClockReliabilityMode)
        ? (rawReliability.mode as HamClockReliabilityMode)
        : DEFAULT_HAMCLOCK_RELIABILITY.mode,
      powerWatts: VALID_POWERS.has(
        rawReliability.powerWatts as HamClockReliabilityPower,
      )
        ? (rawReliability.powerWatts as HamClockReliabilityPower)
        : DEFAULT_HAMCLOCK_RELIABILITY.powerWatts,
      antennaType: VALID_ANTENNAS.has(
        rawReliability.antennaType as AntennaType,
      )
        ? (rawReliability.antennaType as AntennaType)
        : DEFAULT_HAMCLOCK_RELIABILITY.antennaType,
    },
  };
}

export function migrateHamClockState(
  persisted: unknown,
  version: number,
): PersistedHamClockState {
  const legacy = isRecord(persisted) ? { ...persisted } : {};
  if (version < 1) {
    legacy.spotsSide ??= "right";
    legacy.panelCollapsed ??= {};
    legacy.spotsSidebarCollapsed ??= false;
    legacy.infoSidebarCollapsed ??= false;
  }
  if (version < 2) {
    // v2 adds enhanced-model operating inputs. Copy the defaults so the
    // persisted object cannot share a mutable reference with this module.
    legacy.reliability = { ...DEFAULT_HAMCLOCK_RELIABILITY };
  }
  return normalizePersistedHamClockState(legacy);
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useHamClockStore = create<HamClockState>()(
  persist(
    (set) => ({
      spotsSide: "right",
      panelCollapsed: {},
      spotsSidebarCollapsed: false,
      infoSidebarCollapsed: false,
      reliability: { ...DEFAULT_HAMCLOCK_RELIABILITY },

      setSpotsSide: (side) => set({ spotsSide: side }),

      togglePanel: (panelId, defaultCollapsed = false) =>
        set((state) => ({
          panelCollapsed: {
            ...state.panelCollapsed,
            // New panel IDs are absent from existing persisted profiles. Use
            // the view's rendered default before negating so the first click
            // always changes what the operator sees.
            [panelId]: !(state.panelCollapsed[panelId] ?? defaultCollapsed),
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

      setReliability: (patch) =>
        set((state) => ({
          reliability: { ...state.reliability, ...patch },
        })),
    }),
    {
      name: "propulse-hamclock-layout",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        spotsSide: state.spotsSide,
        panelCollapsed: state.panelCollapsed,
        spotsSidebarCollapsed: state.spotsSidebarCollapsed,
        infoSidebarCollapsed: state.infoSidebarCollapsed,
        reliability: state.reliability,
      }),
      migrate: migrateHamClockState,
      merge: (persisted, current) => ({
        // Persisted payloads are data-only; retain actions from the live store.
        ...current,
        ...normalizePersistedHamClockState(persisted),
      }),
    },
  ),
);

/**
 * Zustand store for HamClock layout preferences and view modes.
 * Persists to localStorage with key 'propulse-hamclock-layout'
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AntennaType } from "@/lib/data/antennas";
import type {
  HamClockEnterSnapshot,
  HamClockMode,
} from "@/lib/hamclock/modePresets";
import type { SpotFilters } from "@/types/operatingProfile";

export type { HamClockMode } from "@/lib/hamclock/modePresets";

// ─── Types ───────────────────────────────────────────────────────────────────

export type HamClockViewMode = "flat" | "azimuthal" | "globe";

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

export const HAMCLOCK_FOCUS_BANDS = [
  "160m",
  "80m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
] as const;

export interface HamClockState {
  spotsSide: "left" | "right";
  panelCollapsed: Record<string, boolean>;
  spotsSidebarCollapsed: boolean;
  infoSidebarCollapsed: boolean;
  reliability: HamClockReliabilitySettings;
  /** Product mode: Traffic / Bands / Satellites / Weather */
  hamclockMode: HamClockMode;
  /** Last projection chosen inside HamClock (flat is the appliance default). */
  preferredViewMode: HamClockViewMode;
  /** Band focus used by Bands mode; restored when re-entering Bands. */
  bandFocus: string[];
  /** Include ARRL (ham) headlines in the crawl when quiet. */
  crawlHamNews: boolean;
  /** Include allowlisted world news headlines after ham news. */
  crawlWorldNews: boolean;
  /** Spot filters captured when entering Bands mode (restored on leave). */
  filtersBeforeBands: SpotFilters | null;
  /** Non-persisted snapshot of Normal/Pro map state for exit restore. */
  enterSnapshot: HamClockEnterSnapshot | null;

  setSpotsSide: (side: "left" | "right") => void;
  togglePanel: (panelId: string, defaultCollapsed?: boolean) => void;
  toggleSpotsSidebar: () => void;
  toggleInfoSidebar: () => void;
  setReliability: (patch: Partial<HamClockReliabilitySettings>) => void;
  setHamclockMode: (mode: HamClockMode) => void;
  setPreferredViewMode: (mode: HamClockViewMode) => void;
  setBandFocus: (bands: string[]) => void;
  toggleBandFocus: (band: string) => void;
  setCrawlHamNews: (enabled: boolean) => void;
  setCrawlWorldNews: (enabled: boolean) => void;
  setFiltersBeforeBands: (filters: SpotFilters | null) => void;
  setEnterSnapshot: (snapshot: HamClockEnterSnapshot | null) => void;
}

const VALID_RELIABILITY_MODES = new Set<HamClockReliabilityMode>([
  "SSB",
  "CW",
  "FT8",
]);
const VALID_POWERS = new Set<HamClockReliabilityPower>([
  5, 25, 100, 500, 1500,
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
const VALID_HAMCLOCK_MODES = new Set<HamClockMode>([
  "traffic",
  "bands",
  "satellites",
  "weather",
]);
const VALID_VIEW_MODES = new Set<HamClockViewMode>([
  "flat",
  "azimuthal",
  "globe",
]);

type PersistedHamClockState = Pick<
  HamClockState,
  | "spotsSide"
  | "panelCollapsed"
  | "spotsSidebarCollapsed"
  | "infoSidebarCollapsed"
  | "reliability"
  | "hamclockMode"
  | "preferredViewMode"
  | "bandFocus"
  | "crawlHamNews"
  | "crawlWorldNews"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBandFocus(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (band): band is string =>
      typeof band === "string" &&
      (HAMCLOCK_FOCUS_BANDS as readonly string[]).includes(band),
  );
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
      mode: VALID_RELIABILITY_MODES.has(
        rawReliability.mode as HamClockReliabilityMode,
      )
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
    hamclockMode: VALID_HAMCLOCK_MODES.has(raw.hamclockMode as HamClockMode)
      ? (raw.hamclockMode === "bands" ? "traffic" : raw.hamclockMode as HamClockMode)
      : "traffic",
    preferredViewMode: VALID_VIEW_MODES.has(
      raw.preferredViewMode as HamClockViewMode,
    )
      ? (raw.preferredViewMode as HamClockViewMode)
      : "flat",
    bandFocus: normalizeBandFocus(raw.bandFocus),
    crawlHamNews:
      typeof raw.crawlHamNews === "boolean" ? raw.crawlHamNews : true,
    crawlWorldNews:
      typeof raw.crawlWorldNews === "boolean" ? raw.crawlWorldNews : true,
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
    legacy.reliability = { ...DEFAULT_HAMCLOCK_RELIABILITY };
  }
  if (version < 3) {
    legacy.hamclockMode ??= "traffic";
    legacy.preferredViewMode ??= "flat";
    legacy.bandFocus ??= [];
  }
  if (version < 4) {
    legacy.crawlHamNews ??= true;
    legacy.crawlWorldNews ??= true;
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
      hamclockMode: "traffic",
      preferredViewMode: "flat",
      bandFocus: [],
      crawlHamNews: true,
      crawlWorldNews: true,
      filtersBeforeBands: null,
      enterSnapshot: null,

      setSpotsSide: (side) => set({ spotsSide: side }),

      togglePanel: (panelId, defaultCollapsed = false) =>
        set((state) => ({
          panelCollapsed: {
            ...state.panelCollapsed,
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

      setHamclockMode: (hamclockMode) => set({ hamclockMode }),

      setPreferredViewMode: (preferredViewMode) => set({ preferredViewMode }),

      setBandFocus: (bandFocus) => set({ bandFocus }),

      toggleBandFocus: (band) =>
        set((state) => {
          const has = state.bandFocus.includes(band);
          return {
            bandFocus: has
              ? state.bandFocus.filter((b) => b !== band)
              : [...state.bandFocus, band],
          };
        }),

      setCrawlHamNews: (crawlHamNews) => set({ crawlHamNews }),
      setCrawlWorldNews: (crawlWorldNews) => set({ crawlWorldNews }),

      setFiltersBeforeBands: (filtersBeforeBands) =>
        set({ filtersBeforeBands }),

      setEnterSnapshot: (enterSnapshot) => set({ enterSnapshot }),
    }),
    {
      name: "propulse-hamclock-layout",
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        spotsSide: state.spotsSide,
        panelCollapsed: state.panelCollapsed,
        spotsSidebarCollapsed: state.spotsSidebarCollapsed,
        infoSidebarCollapsed: state.infoSidebarCollapsed,
        reliability: state.reliability,
        hamclockMode: state.hamclockMode,
        preferredViewMode: state.preferredViewMode,
        bandFocus: state.bandFocus,
        crawlHamNews: state.crawlHamNews,
        crawlWorldNews: state.crawlWorldNews,
      }),
      migrate: migrateHamClockState,
      merge: (persisted, current) => ({
        ...current,
        ...normalizePersistedHamClockState(persisted),
      }),
    },
  ),
);

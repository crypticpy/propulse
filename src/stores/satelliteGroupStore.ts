/**
 * Satellite Group Store
 *
 * Manages which Celestrak TLE groups are fetched for the satellite database.
 * Default: only "amateur" group (current behavior). Users can opt in to
 * additional groups like weather, cubesat, education, etc.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "propulse-satellite-groups";

/** Maximum number of groups a user can enable simultaneously */
const MAX_ENABLED_GROUPS = 9;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SatelliteGroupInfo {
  id: string;
  label: string;
  description: string;
  category: string; // "core" | "science" | "utility"
}

interface SatelliteGroupState {
  enabledGroups: string[];
  isGroupEnabled: (groupId: string) => boolean;
  enableGroup: (groupId: string) => void;
  disableGroup: (groupId: string) => void;
  resetDefaults: () => void;
}

// ---------------------------------------------------------------------------
// Available Groups
// ---------------------------------------------------------------------------

export const AVAILABLE_SATELLITE_GROUPS: SatelliteGroupInfo[] = [
  {
    id: "amateur",
    label: "Amateur Radio",
    description: "Ham radio satellites with active transponders and repeaters",
    category: "core",
  },
  {
    id: "stations",
    label: "Space Stations",
    description: "ISS, Tiangong, and other crewed stations",
    category: "core",
  },
  {
    id: "weather",
    label: "Weather",
    description:
      "NOAA, METEOR, and other weather satellites with APT/LRPT downlinks",
    category: "science",
  },
  {
    id: "noaa",
    label: "NOAA Specific",
    description: "All NOAA satellites including search & rescue",
    category: "science",
  },
  {
    id: "cubesat",
    label: "CubeSats",
    description: "Small satellites, many with amateur radio payloads",
    category: "science",
  },
  {
    id: "education",
    label: "Educational",
    description: "University and educational satellites with ham downlinks",
    category: "science",
  },
  {
    id: "engineering",
    label: "Engineering",
    description: "Engineering test and calibration satellites",
    category: "utility",
  },
  {
    id: "science",
    label: "Science",
    description: "Scientific research satellites",
    category: "utility",
  },
  {
    id: "tle-new",
    label: "Recent Launches",
    description: "Recently launched satellites — catch new deployments early",
    category: "utility",
  },
];

// ---------------------------------------------------------------------------
// Default State
// ---------------------------------------------------------------------------

const DEFAULT_ENABLED_GROUPS = ["amateur", "weather"];

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------

export const useSatelliteGroupStore = create<SatelliteGroupState>()(
  persist(
    (set, get) => ({
      enabledGroups: [...DEFAULT_ENABLED_GROUPS],

      isGroupEnabled: (groupId: string): boolean => {
        return get().enabledGroups.includes(groupId);
      },

      enableGroup: (groupId: string) => {
        set((state) => {
          if (state.enabledGroups.includes(groupId)) return state;
          if (state.enabledGroups.length >= MAX_ENABLED_GROUPS) return state;
          return { enabledGroups: [...state.enabledGroups, groupId] };
        });
      },

      disableGroup: (groupId: string) => {
        set((state) => {
          // "amateur" is always required — cannot be disabled
          if (groupId === "amateur") return state;
          if (!state.enabledGroups.includes(groupId)) return state;
          return {
            enabledGroups: state.enabledGroups.filter((g) => g !== groupId),
          };
        });
      },

      resetDefaults: () => {
        set({ enabledGroups: [...DEFAULT_ENABLED_GROUPS] });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        enabledGroups: state.enabledGroups,
      }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as { enabledGroups?: string[] };
        if (version < 2) {
          // v2: add "weather" group to existing users who don't have it
          const groups = state.enabledGroups ?? [...DEFAULT_ENABLED_GROUPS];
          if (!groups.includes("weather")) {
            return { enabledGroups: [...groups, "weather"] };
          }
        }
        return state;
      },
    },
  ),
);

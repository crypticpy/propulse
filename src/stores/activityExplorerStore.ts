/** Shared Home/PropSphere filters for the recent on-air activity explorer. */

import { create, createStore, type StateCreator } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ActivityExplorerMode = "band" | "frequency";

export interface ActivityExplorerStore {
  mode: ActivityExplorerMode;
  band: string;
  frequencyInput: string;
  toleranceKHz: number;
  maxAgeMinutes: number;
  maxDistanceKm: number | null;
  setMode: (mode: ActivityExplorerMode) => void;
  setBand: (band: string) => void;
  setFrequencyInput: (frequencyInput: string) => void;
  setToleranceKHz: (toleranceKHz: number) => void;
  setMaxAgeMinutes: (maxAgeMinutes: number) => void;
  setMaxDistanceKm: (maxDistanceKm: number | null) => void;
  /** Boundary for future SDR control: Hz in, explicit MHz shown. */
  followTunedFrequency: (frequencyHz: number) => void;
}

const activityExplorerDefaults: StateCreator<ActivityExplorerStore> = (set) => ({
  mode: "band",
  band: "40m",
  frequencyInput: "7.200",
  toleranceKHz: 1,
  maxAgeMinutes: 15,
  maxDistanceKm: 5000,
  setMode: (mode) => set({ mode }),
  setBand: (band) => set({ band }),
  setFrequencyInput: (frequencyInput) => set({ frequencyInput }),
  setToleranceKHz: (toleranceKHz) => set({ toleranceKHz }),
  setMaxAgeMinutes: (maxAgeMinutes) => set({ maxAgeMinutes }),
  setMaxDistanceKm: (maxDistanceKm) => set({ maxDistanceKm }),
  followTunedFrequency: (frequencyHz) =>
    set({
      mode: "frequency",
      // The suffix is essential above 999 MHz: a bare "1296" is otherwise
      // interpreted as 1296 kHz by the operator-friendly parser.
      frequencyInput: `${(frequencyHz / 1_000_000)
        .toFixed(6)
        .replace(/\.?0+$/, "")} MHz`,
    }),
});

/** Disposable filters for a public Home visit; never read or write operator storage. */
export const createGuestActivityExplorerStore = () =>
  createStore<ActivityExplorerStore>()(activityExplorerDefaults);

export const useActivityExplorerStore = create<ActivityExplorerStore>()(
  persist(
    activityExplorerDefaults,
    {
      name: "propulse-activity-explorer",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

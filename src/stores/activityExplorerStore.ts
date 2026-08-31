/** Shared Home/PropSphere filters for the recent on-air activity explorer. */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ActivityExplorerMode = "band" | "frequency";

interface ActivityExplorerStore {
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
  /** Boundary for future SDR control: Hz in, operator-friendly MHz shown. */
  followTunedFrequency: (frequencyHz: number) => void;
}

export const useActivityExplorerStore = create<ActivityExplorerStore>()(
  persist(
    (set) => ({
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
          frequencyInput: (frequencyHz / 1_000_000).toFixed(3),
        }),
    }),
    {
      name: "propulse-activity-explorer",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

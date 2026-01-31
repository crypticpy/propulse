/**
 * Zustand store for solar data state
 * Tracks data freshness and source (live vs demo)
 */

import { create } from "zustand";

/**
 * Solar data store state and actions
 */
interface SolarStore {
  /** Timestamp of the last data update, null if never updated */
  lastUpdate: Date | null;
  /** True if using live NOAA data, false if using demo/fallback data */
  isLive: boolean;
  /** Update the last update timestamp */
  setLastUpdate: (date: Date) => void;
  /** Set whether data is from live source */
  setIsLive: (isLive: boolean) => void;
  /** Mark data as stale (clear last update) */
  markStale: () => void;
}

/**
 * Solar data state store
 * Does not persist - resets on page reload
 *
 * @example
 * ```tsx
 * const { lastUpdate, isLive, setLastUpdate, setIsLive } = useSolarStore();
 *
 * // After successful API fetch
 * setLastUpdate(new Date());
 * setIsLive(true);
 *
 * // On fetch failure, fallback to demo data
 * setIsLive(false);
 * ```
 */
export const useSolarStore = create<SolarStore>((set) => ({
  lastUpdate: null,
  isLive: false,

  setLastUpdate: (date) => set({ lastUpdate: date }),

  setIsLive: (isLive) => set({ isLive }),

  markStale: () => set({ lastUpdate: null }),
}));

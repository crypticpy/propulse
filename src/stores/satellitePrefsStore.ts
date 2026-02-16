/**
 * Satellite Preferences Store
 *
 * Persisted Zustand store for user satellite tracking preferences.
 * Controls which satellites are rendered on the globe overlay.
 *
 * Default state: "all" — every satellite from the TLE source is tracked.
 * When the user customizes, the store switches to an explicit set of NORAD IDs.
 * New satellites from updated TLE data are automatically tracked in "all" mode.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "propulse-satellite-prefs";

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------

interface SatellitePrefsState {
  /**
   * Which satellites to track on the globe.
   * - "all": track everything from the TLE source (default, preserves current behavior)
   * - number[]: explicit set of NORAD catalog IDs to track
   */
  trackedNoradIds: "all" | number[];

  /** Whether the user has ever customized their tracking preferences */
  hasCustomized: boolean;

  /**
   * Check if a satellite is currently tracked.
   * When "all", every satellite is tracked.
   */
  isTracked: (noradId: number) => boolean;

  /**
   * Track a specific satellite.
   * If currently "all", this is a no-op (already tracked).
   * If explicit set, adds the NORAD ID.
   */
  trackSatellite: (noradId: number) => void;

  /**
   * Untrack a specific satellite.
   * If currently "all", expands to the full universe minus this satellite.
   * Requires allNoradIds so the store knows the full satellite set.
   */
  untrackSatellite: (noradId: number, allNoradIds: number[]) => void;

  /** Reset to tracking all satellites (default behavior) */
  trackAll: () => void;

  /** Untrack all satellites */
  trackNone: () => void;

  /** Bulk set the tracked satellite IDs */
  setTrackedIds: (noradIds: number[]) => void;

  /**
   * Track all satellites in a specific category.
   * Requires the NORAD IDs for that category and the full universe.
   */
  trackCategory: (categoryNoradIds: number[], allNoradIds: number[]) => void;

  /**
   * Untrack all satellites in a specific category.
   * Requires the NORAD IDs for that category and the full universe.
   */
  untrackCategory: (categoryNoradIds: number[], allNoradIds: number[]) => void;
}

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------

export const useSatellitePrefsStore = create<SatellitePrefsState>()(
  persist(
    (set, get) => ({
      trackedNoradIds: "all" as "all" | number[],
      hasCustomized: false,

      isTracked: (noradId: number): boolean => {
        const { trackedNoradIds } = get();
        if (trackedNoradIds === "all") return true;
        return trackedNoradIds.includes(noradId);
      },

      trackSatellite: (noradId: number) => {
        set((state) => {
          if (state.trackedNoradIds === "all") return state;
          if (state.trackedNoradIds.includes(noradId)) return state;
          return {
            trackedNoradIds: [...state.trackedNoradIds, noradId],
            hasCustomized: true,
          };
        });
      },

      untrackSatellite: (noradId: number, allNoradIds: number[]) => {
        set((state) => {
          if (state.trackedNoradIds === "all") {
            // Expand "all" to explicit set minus this satellite
            return {
              trackedNoradIds: allNoradIds.filter((id) => id !== noradId),
              hasCustomized: true,
            };
          }
          return {
            trackedNoradIds: state.trackedNoradIds.filter(
              (id) => id !== noradId,
            ),
            hasCustomized: true,
          };
        });
      },

      trackAll: () => {
        set({ trackedNoradIds: "all", hasCustomized: false });
      },

      trackNone: () => {
        set({ trackedNoradIds: [], hasCustomized: true });
      },

      setTrackedIds: (noradIds: number[]) => {
        set({ trackedNoradIds: noradIds, hasCustomized: true });
      },

      trackCategory: (categoryNoradIds: number[], allNoradIds: number[]) => {
        set((state) => {
          if (state.trackedNoradIds === "all") return state;
          const current = new Set(state.trackedNoradIds);
          for (const id of categoryNoradIds) {
            current.add(id);
          }
          // If all satellites are now tracked, switch back to "all"
          if (current.size >= allNoradIds.length) {
            return { trackedNoradIds: "all", hasCustomized: false };
          }
          return {
            trackedNoradIds: Array.from(current),
            hasCustomized: true,
          };
        });
      },

      untrackCategory: (categoryNoradIds: number[], allNoradIds: number[]) => {
        set((state) => {
          const removeSet = new Set(categoryNoradIds);
          if (state.trackedNoradIds === "all") {
            return {
              trackedNoradIds: allNoradIds.filter((id) => !removeSet.has(id)),
              hasCustomized: true,
            };
          }
          return {
            trackedNoradIds: state.trackedNoradIds.filter(
              (id) => !removeSet.has(id),
            ),
            hasCustomized: true,
          };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        trackedNoradIds: state.trackedNoradIds,
        hasCustomized: state.hasCustomized,
      }),
    },
  ),
);

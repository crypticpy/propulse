/**
 * Zustand store for Watch System management
 *
 * Provides functionality for watching grids, entities, and callsign patterns.
 * Persists watch items to localStorage with key 'propulse-watches'.
 * Supports max 10 watches per user.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DXSpot } from "../types/dxcluster";

/** Watch type categories */
export type WatchType = "grid" | "entity" | "callsign";

/**
 * A watched item (grid, entity, or callsign pattern)
 */
export interface WatchItem {
  /** Unique identifier for this watch */
  id: string;
  /** Type of watch */
  type: WatchType;
  /** Pattern to match (grid prefix, entity prefix, or callsign pattern with wildcards) */
  pattern: string;
  /** User-friendly label */
  name?: string;
  /** ISO timestamp when the watch was created */
  createdAt: string;
  /** ISO timestamp of last detected activity */
  lastActivityAt?: string;
  /** Count of spots matching this watch */
  activityCount: number;
  /** Whether this watch currently has matching activity */
  isActive: boolean;
}

/**
 * A match between a watch and a DX spot
 */
export interface WatchMatch {
  /** ID of the watch that matched */
  watchId: string;
  /** The spot that matched */
  spot: DXSpot;
  /** Which field triggered the match */
  matchedField: "dx" | "spotter";
}

/** Maximum number of watches allowed per user */
export const MAX_WATCHES = 10;

/** localStorage key for watch persistence */
const STORAGE_KEY = "propulse-watches";

/**
 * Generate a unique ID for a new watch
 * Uses crypto.randomUUID() with timestamp fallback for older browsers
 */
function generateWatchId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `watch-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Check if a callsign matches a pattern with wildcard support
 * Supports * as wildcard (e.g., "W7*" matches "W7ABC", "W7XYZ")
 */
function matchesCallsignPattern(callsign: string, pattern: string): boolean {
  const normalizedCallsign = callsign.toUpperCase();
  const normalizedPattern = pattern.toUpperCase();

  // Handle wildcard pattern
  if (normalizedPattern.includes("*")) {
    // Convert pattern to regex: "W7*" becomes "^W7.*$"
    const regexPattern = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special chars except *
      .replace(/\*/g, ".*"); // Replace * with .*
    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(normalizedCallsign);
  }

  // Exact prefix match for non-wildcard patterns
  return normalizedCallsign.startsWith(normalizedPattern);
}

/**
 * Check if a spot matches a watch item
 * Returns the matched field if there's a match, null otherwise
 */
function checkSpotMatch(
  spot: DXSpot,
  watch: WatchItem,
): "dx" | "spotter" | null {
  const { type, pattern } = watch;

  switch (type) {
    case "grid": {
      // Match if spot's dxGrid or spotterGrid starts with the pattern
      const normalizedPattern = pattern.toUpperCase();
      if (spot.dxGrid?.toUpperCase().startsWith(normalizedPattern)) {
        return "dx";
      }
      if (spot.spotterGrid?.toUpperCase().startsWith(normalizedPattern)) {
        return "spotter";
      }
      break;
    }

    case "entity": {
      // Match if spot's callsign starts with the entity prefix
      const normalizedPattern = pattern.toUpperCase();
      if (spot.dx.toUpperCase().startsWith(normalizedPattern)) {
        return "dx";
      }
      if (spot.spotter.toUpperCase().startsWith(normalizedPattern)) {
        return "spotter";
      }
      break;
    }

    case "callsign": {
      // Match with wildcard support
      if (matchesCallsignPattern(spot.dx, pattern)) {
        return "dx";
      }
      if (matchesCallsignPattern(spot.spotter, pattern)) {
        return "spotter";
      }
      break;
    }
  }

  return null;
}

/**
 * Persisted state (survives page reload)
 */
interface PersistedWatchState {
  /** Array of watched items */
  watches: WatchItem[];
}

/**
 * Runtime state (resets on page reload)
 */
interface RuntimeWatchState {
  /** Current matches (transient, not persisted) */
  matches: WatchMatch[];
  /** Set of spot IDs already seen (to avoid duplicate match notifications) */
  seenSpotIds: Set<string>;
}

/**
 * Watch store state and actions
 */
interface WatchStore extends PersistedWatchState, RuntimeWatchState {
  /**
   * Add a new watch
   * @param type - Type of watch (grid, entity, or callsign)
   * @param pattern - Pattern to match
   * @param name - Optional user-friendly label
   * @returns The newly created watch, or null if max limit reached
   */
  addWatch: (
    type: WatchType,
    pattern: string,
    name?: string,
  ) => WatchItem | null;

  /**
   * Remove a watch by its ID
   * @param id - The watch ID to remove
   */
  removeWatch: (id: string) => void;

  /**
   * Update a watch's properties
   * @param id - The watch ID to update
   * @param updates - Partial watch data to merge
   * @returns true if watch was found and updated, false otherwise
   */
  updateWatch: (id: string, updates: Partial<WatchItem>) => boolean;

  /**
   * Clear all current matches
   */
  clearMatches: () => void;

  /**
   * Check spots for matches against all watches
   * @param spots - Array of DX spots to check
   * @returns Array of new matches found
   */
  checkForActivity: (spots: DXSpot[]) => WatchMatch[];

  /**
   * Get all watches that currently have activity
   * @returns Array of active watches
   */
  getActiveWatches: () => WatchItem[];

  /**
   * Get all matches for a specific watch
   * @param watchId - The watch ID to get matches for
   * @returns Array of matches for the watch
   */
  getMatchesForWatch: (watchId: string) => WatchMatch[];

  /**
   * Find a watch by its ID
   * @param id - Watch ID to search for
   * @returns The matching watch or undefined
   */
  getWatchById: (id: string) => WatchItem | undefined;

  /**
   * Check if a pattern already exists as a watch
   * @param type - Watch type
   * @param pattern - Pattern to check
   * @returns true if watch already exists
   */
  hasWatch: (type: WatchType, pattern: string) => boolean;

  /**
   * Reset seen spots (call when clearing/refreshing spot data)
   */
  resetSeenSpots: () => void;
}

/**
 * Default runtime state values
 */
const defaultRuntimeState: RuntimeWatchState = {
  matches: [],
  seenSpotIds: new Set(),
};

/**
 * Default persisted state values
 */
const defaultPersistedState: PersistedWatchState = {
  watches: [],
};

// ============================================================================
// Selectors (computed values for use with useWatchStore)
// ============================================================================

/**
 * Selector: Count of watches with active matches
 * @example
 * const count = useWatchStore(selectActiveWatchCount);
 */
export const selectActiveWatchCount = (state: WatchStore): number =>
  state.watches.filter((w) => w.isActive).length;

/**
 * Selector: Total count of current matches
 * @example
 * const matchCount = useWatchStore(selectTotalMatchCount);
 */
export const selectTotalMatchCount = (state: WatchStore): number =>
  state.matches.length;

/**
 * Selector: Whether there are any active watches
 * @example
 * const hasActive = useWatchStore(selectHasActiveWatches);
 */
export const selectHasActiveWatches = (state: WatchStore): boolean =>
  state.watches.some((w) => w.isActive);

/**
 * Selector: Get all watches
 * @example
 * const watches = useWatchStore(selectAllWatches);
 */
export const selectAllWatches = (state: WatchStore): WatchItem[] =>
  state.watches;

/**
 * Selector: Get all matches
 * @example
 * const matches = useWatchStore(selectAllMatches);
 */
export const selectAllMatches = (state: WatchStore): WatchMatch[] =>
  state.matches;

// ============================================================================
// Store Implementation
// ============================================================================

/**
 * Watch store with localStorage persistence for watch items
 *
 * @example
 * ```tsx
 * const { watches, addWatch, removeWatch, checkForActivity } = useWatchStore();
 *
 * // Add a new grid watch
 * const watch = addWatch('grid', 'CN87', 'Portland Area');
 *
 * // Add a callsign watch with wildcard
 * addWatch('callsign', 'W7*', 'W7 Stations');
 *
 * // Check for activity when new spots arrive
 * const newMatches = checkForActivity(spots);
 *
 * // Remove a watch
 * if (watch) removeWatch(watch.id);
 * ```
 */
export const useWatchStore = create<WatchStore>()(
  persist(
    (set, get) => ({
      // Persisted state
      watches: defaultPersistedState.watches,

      // Runtime state (not persisted)
      matches: defaultRuntimeState.matches,
      seenSpotIds: defaultRuntimeState.seenSpotIds,

      // ========================================================================
      // Actions
      // ========================================================================

      addWatch: (type, pattern, name) => {
        const state = get();

        // Enforce max watch limit
        if (state.watches.length >= MAX_WATCHES) {
          return null;
        }

        // Normalize pattern
        const normalizedPattern = pattern.toUpperCase().trim();

        // Check for duplicate
        if (state.hasWatch(type, normalizedPattern)) {
          return null;
        }

        const newWatch: WatchItem = {
          id: generateWatchId(),
          type,
          pattern: normalizedPattern,
          name: name?.trim() || undefined,
          createdAt: new Date().toISOString(),
          activityCount: 0,
          isActive: false,
        };

        set((state) => ({
          watches: [...state.watches, newWatch],
        }));

        return newWatch;
      },

      removeWatch: (id) => {
        set((state) => ({
          watches: state.watches.filter((watch) => watch.id !== id),
          matches: state.matches.filter((match) => match.watchId !== id),
        }));
      },

      updateWatch: (id, updates) => {
        const state = get();
        const watchIndex = state.watches.findIndex((watch) => watch.id === id);

        if (watchIndex === -1) {
          return false;
        }

        set((state) => ({
          watches: state.watches.map((watch) =>
            watch.id === id
              ? {
                  ...watch,
                  ...updates,
                  // Normalize pattern if updated
                  pattern: updates.pattern
                    ? updates.pattern.toUpperCase().trim()
                    : watch.pattern,
                }
              : watch,
          ),
        }));

        return true;
      },

      clearMatches: () => {
        set((state) => ({
          matches: [],
          watches: state.watches.map((watch) => ({
            ...watch,
            isActive: false,
          })),
        }));
      },

      checkForActivity: (spots) => {
        const state = get();
        const { watches, seenSpotIds } = state;
        const newMatches: WatchMatch[] = [];
        const updatedWatches = [...watches];
        const watchMatchCounts: Record<string, number> = {};

        // Initialize match counts
        for (const watch of watches) {
          watchMatchCounts[watch.id] = 0;
        }

        // Check each spot against all watches
        for (const spot of spots) {
          // Skip already-seen spots
          if (seenSpotIds.has(spot.id)) {
            continue;
          }

          for (const watch of watches) {
            const matchedField = checkSpotMatch(spot, watch);
            if (matchedField) {
              newMatches.push({
                watchId: watch.id,
                spot,
                matchedField,
              });
              watchMatchCounts[watch.id]++;
            }
          }
        }

        // Update seen spots
        const newSeenSpotIds = new Set(seenSpotIds);
        for (const spot of spots) {
          newSeenSpotIds.add(spot.id);
        }

        // Update watch activity status and counts
        const now = new Date().toISOString();
        for (let i = 0; i < updatedWatches.length; i++) {
          const watch = updatedWatches[i];
          const matchCount = watchMatchCounts[watch.id];
          if (matchCount > 0) {
            updatedWatches[i] = {
              ...watch,
              isActive: true,
              activityCount: watch.activityCount + matchCount,
              lastActivityAt: now,
            };
          }
        }

        // Only update state if there are new matches
        if (newMatches.length > 0) {
          set({
            watches: updatedWatches,
            matches: [...state.matches, ...newMatches],
            seenSpotIds: newSeenSpotIds,
          });
        } else if (newSeenSpotIds.size !== seenSpotIds.size) {
          // Update seen spots even if no matches
          set({ seenSpotIds: newSeenSpotIds });
        }

        return newMatches;
      },

      getActiveWatches: () => {
        return get().watches.filter((watch) => watch.isActive);
      },

      getMatchesForWatch: (watchId) => {
        return get().matches.filter((match) => match.watchId === watchId);
      },

      getWatchById: (id) => {
        return get().watches.find((watch) => watch.id === id);
      },

      hasWatch: (type, pattern) => {
        const normalizedPattern = pattern.toUpperCase().trim();
        return get().watches.some(
          (watch) => watch.type === type && watch.pattern === normalizedPattern,
        );
      },

      resetSeenSpots: () => {
        set({
          seenSpotIds: new Set(),
          matches: [],
          watches: get().watches.map((watch) => ({
            ...watch,
            isActive: false,
          })),
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Only persist watches, not transient matches
      partialize: (state) => ({
        watches: state.watches,
      }),
      // Merge persisted state with runtime defaults on rehydration
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<PersistedWatchState>),
        // Ensure runtime state uses defaults, not persisted values
        matches: defaultRuntimeState.matches,
        seenSpotIds: defaultRuntimeState.seenSpotIds,
      }),
    },
  ),
);

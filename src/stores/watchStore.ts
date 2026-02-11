/**
 * Zustand store for Watch System v2
 *
 * Single active watch with unified filter criteria, match rate tracking,
 * and saved watch presets. Replaces v1's multi-watch model with a focused
 * single-watch + saved presets approach.
 *
 * Key differences from v1:
 * - Single active watch (criteria: WatchCriteria | null) instead of watches[]
 * - Unified filter: callsign + grid + band + mode + continent + CQ zone (AND logic)
 * - Match rate tracking (rolling 30-second window)
 * - Rate-limited camera auto-pan integration
 * - Saved watch presets (max 20) for quick switching
 *
 * Persists to localStorage at 'propulse-watches' key, version 2.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DXSpot } from "../types/dxcluster";
import type { LiveSpot } from "../types/livespot";
import { getContestById } from "@/lib/data/contests";

// =============================================================================
// TYPES
// =============================================================================

/** Watch type categories (kept for backward compatibility with useWatchAlerts) */
export type WatchType = "grid" | "entity" | "callsign";

/**
 * Direction filter for grid-based watches
 */
export type WatchDirection = "tx" | "rx" | "either";

/**
 * Unified filter criteria for the active watch
 *
 * All fields are optional. When multiple are set, they combine with AND logic.
 * At least one filter field must be set for a valid watch.
 */
export interface WatchCriteria {
  /** Callsign pattern — exact or prefix, supports * wildcard (e.g., "3Y0J", "W7*") */
  callsign?: string;
  /** Maidenhead grid prefix — 2, 4, or 6 characters (e.g., "EM", "EM73", "EM73qp") */
  gridPrefix?: string;
  /** Which end of the path to match grid against */
  txOrRx: WatchDirection;
  /** Band filter (e.g., "20m", "10m") */
  band?: string;
  /** Mode filter (e.g., "FT8", "CW", "SSB") */
  mode?: string;
  /** Continent filter (e.g., "NA", "EU", "AS", "AF", "SA", "OC", "AN") */
  continent?: string;
  /** CQ zone number (1-40) */
  cqZone?: number;
  /** Contest ID when this watch was created from a contest preset */
  contestId?: string;
}

/**
 * A saved watch preset
 */
export interface SavedWatch {
  id: string;
  name: string;
  criteria: WatchCriteria;
  createdAt: string;
}

/**
 * A matched spot from the watch filter
 */
export interface MatchedSpot {
  /** Unique ID for this match */
  id: string;
  /** The matched spot data */
  spot: DXSpot;
  /** Which end of the path triggered the match */
  matchedField: "dx" | "spotter";
  /** ISO timestamp of when the match was detected */
  matchedAt: string;
}

// ─── Backward-compatible types for useWatchAlerts ────────────────────────────

/**
 * WatchItem — backward-compatible type for useWatchAlerts integration.
 * In v2, the active watch is represented as a synthetic WatchItem.
 */
export interface WatchItem {
  id: string;
  type: WatchType;
  pattern: string;
  name?: string;
  createdAt: string;
  lastActivityAt?: string;
  activityCount: number;
  isActive: boolean;
}

/**
 * WatchMatch — backward-compatible type for useWatchAlerts integration.
 */
export interface WatchMatch {
  watchId: string;
  spot: DXSpot;
  matchedField: "dx" | "spotter";
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum number of saved watch presets */
export const MAX_SAVED_WATCHES = 20;

/** Maximum recent matches to retain */
const MAX_RECENT_MATCHES = 100;

/** Rolling window size for match rate calculation (ms) */
const MATCH_RATE_WINDOW_MS = 30_000;

/** Stable ID for the active watch (used in WatchMatch.watchId for compat) */
const ACTIVE_WATCH_ID = "active-watch";

/** localStorage key */
const STORAGE_KEY = "propulse-watches";

// =============================================================================
// UTILITIES
// =============================================================================

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `watch-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Pre-compile a callsign pattern into a RegExp for O(1) matching per spot.
 * Supports * wildcard (e.g., "W7*" → /^W7.*$/i).
 * Returns null if no callsign filter is set.
 */
function compileCallsignRegex(callsign?: string): RegExp | null {
  if (!callsign) return null;
  const normalized = callsign.toUpperCase().trim();
  if (!normalized) return null;

  if (normalized.includes("*")) {
    const escaped = normalized
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`, "i");
  }
  // Prefix match for non-wildcard patterns
  return new RegExp(
    `^${normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&")}`,
    "i",
  );
}

/**
 * Check if a single spot matches the active watch criteria.
 * Returns "dx" or "spotter" indicating which end matched, or null.
 */
function matchSpot(
  spot: DXSpot,
  criteria: WatchCriteria,
  callsignRegex: RegExp | null,
): "dx" | "spotter" | null {
  // Band filter (AND)
  if (criteria.band) {
    const spotBand = spot.band?.toLowerCase();
    if (!spotBand || spotBand !== criteria.band.toLowerCase()) {
      return null;
    }
  }

  // Mode filter (AND)
  if (criteria.mode) {
    const spotMode = spot.mode?.toLowerCase();
    if (!spotMode || spotMode !== criteria.mode.toLowerCase()) {
      return null;
    }
  }

  // Continent filter (AND) — check DX station's callsign prefix against continent
  // We approximate continent from callsign prefix or from comment/source data
  // For now, check the spot comment for continent hints or skip if not available
  if (criteria.continent) {
    // Continent filtering is best-effort: check dxGrid first 2 chars for region mapping
    // Maidenhead field → continent mapping is approximate
    const grid = spot.dxGrid?.toUpperCase().substring(0, 2);
    if (grid) {
      const spotContinent = gridFieldToContinent(grid);
      if (spotContinent && spotContinent !== criteria.continent.toUpperCase()) {
        return null;
      }
    }
  }

  // CQ zone filter (AND) — extract from comment if available
  if (criteria.cqZone !== undefined) {
    const spotZone = extractCQZone(spot);
    if (spotZone !== null && spotZone !== criteria.cqZone) {
      return null;
    }
  }

  // Now check callsign and/or grid (at least one location-based filter must match)
  let dxMatch = false;
  let spotterMatch = false;

  // Callsign matching
  if (callsignRegex) {
    if (callsignRegex.test(spot.dx)) dxMatch = true;
    if (callsignRegex.test(spot.spotter)) spotterMatch = true;
  }

  // Grid matching
  if (criteria.gridPrefix) {
    const normalizedGrid = criteria.gridPrefix.toUpperCase();
    const dir = criteria.txOrRx;

    if (dir === "tx" || dir === "either") {
      if (spot.dxGrid?.toUpperCase().startsWith(normalizedGrid)) dxMatch = true;
    }
    if (dir === "rx" || dir === "either") {
      if (spot.spotterGrid?.toUpperCase().startsWith(normalizedGrid))
        spotterMatch = true;
    }
  }

  // If we have callsign or grid filters, at least one must match
  if (callsignRegex || criteria.gridPrefix) {
    if (dxMatch) return "dx";
    if (spotterMatch) return "spotter";
    return null;
  }

  // If only band/mode/continent/cqZone filters (no callsign/grid),
  // the spot matched all AND filters — default to "dx"
  return "dx";
}

/**
 * Approximate continent from 2-char Maidenhead grid field.
 * This is a rough mapping — not all fields map cleanly to one continent.
 */
function gridFieldToContinent(field: string): string | null {
  const lon = field.charCodeAt(0) - 65; // A=0 ... R=17
  const lat = field.charCodeAt(1) - 65;

  // Very rough continental boundaries based on Maidenhead fields
  // Longitude: A(0)=-180 ... R(17)=+180, each field is 20°
  // Latitude:  A(0)=-90 ... R(17)=+90, each field is 10°
  const lonDeg = lon * 20 - 180;
  const latDeg = lat * 10 - 90;

  if (latDeg < -60) return "AN"; // Antarctica
  if (latDeg < -10 && lonDeg > -80 && lonDeg < -30) return "SA";
  if (latDeg >= 10 && latDeg < 75 && lonDeg >= -130 && lonDeg < -30)
    return "NA";
  if (latDeg >= 30 && latDeg < 75 && lonDeg >= -30 && lonDeg < 60) return "EU";
  if (latDeg < 30 && lonDeg >= -30 && lonDeg < 60) return "AF";
  if (latDeg >= 10 && lonDeg >= 60 && lonDeg < 180) return "AS";
  if (latDeg < 10 && lonDeg >= 100) return "OC";
  return null;
}

/**
 * Extract CQ zone from spot comment (e.g., "CQ Zone 14" or "Z14")
 */
function extractCQZone(spot: DXSpot): number | null {
  if (!spot.comment) return null;
  const match = spot.comment.match(/(?:CQ\s*(?:Zone\s*)?|Z)(\d{1,2})/i);
  if (match) {
    const zone = parseInt(match[1], 10);
    if (zone >= 1 && zone <= 40) return zone;
  }
  return null;
}

/**
 * Infer the primary WatchType from criteria (for useWatchAlerts compatibility)
 */
function inferWatchType(criteria: WatchCriteria): WatchType {
  if (criteria.callsign) return "callsign";
  if (criteria.gridPrefix) return "grid";
  return "entity"; // fallback for band/mode/continent-only watches
}

/** Stable empty arrays for compat fields when no watch is active */
const EMPTY_WATCHES: WatchItem[] = [];
const EMPTY_MATCHES: WatchMatch[] = [];

/**
 * Recompute backward-compatible `watches` and `matches` arrays from current state.
 * Called explicitly in mutations to keep them in sync without using getters.
 */
function computeCompatFields(state: {
  criteria: WatchCriteria | null;
  matchCount: number;
  lastMatchTime: number | null;
  recentMatches: MatchedSpot[];
}): { watches: WatchItem[]; matches: WatchMatch[] } {
  if (!state.criteria) {
    return { watches: EMPTY_WATCHES, matches: EMPTY_MATCHES };
  }
  const watches: WatchItem[] = [
    {
      id: ACTIVE_WATCH_ID,
      type: inferWatchType(state.criteria),
      pattern: formatCriteriaSummary(state.criteria),
      name: formatCriteriaSummary(state.criteria),
      createdAt: new Date().toISOString(),
      lastActivityAt: state.lastMatchTime
        ? new Date(state.lastMatchTime).toISOString()
        : undefined,
      activityCount: state.matchCount,
      isActive: state.matchCount > 0,
    },
  ];
  const matches: WatchMatch[] = state.recentMatches.map((m) => ({
    watchId: ACTIVE_WATCH_ID,
    spot: m.spot,
    matchedField: m.matchedField,
  }));
  return { watches, matches };
}

/**
 * Build a human-readable summary of watch criteria
 */
export function formatCriteriaSummary(criteria: WatchCriteria): string {
  const parts: string[] = [];
  if (criteria.callsign) parts.push(criteria.callsign.toUpperCase());
  if (criteria.gridPrefix) {
    const dir =
      criteria.txOrRx === "tx"
        ? " (TX)"
        : criteria.txOrRx === "rx"
          ? " (RX)"
          : "";
    parts.push(criteria.gridPrefix.toUpperCase() + dir);
  }
  if (criteria.band) parts.push(criteria.band);
  if (criteria.mode) parts.push(criteria.mode);
  if (criteria.continent) parts.push(criteria.continent);
  if (criteria.cqZone !== undefined) parts.push(`Z${criteria.cqZone}`);
  return parts.join(" · ") || "No filters";
}

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface PersistedState {
  /** Active watch criteria (null = no watch) */
  criteria: WatchCriteria | null;
  /** Whether auto-pan is enabled */
  autoPan: boolean;
  /** Saved watch presets */
  savedWatches: SavedWatch[];
  /** When true, contest watch only shows spots for needed multipliers */
  neededOnly: boolean;
}

interface RuntimeState {
  /** Whether the watch system is actively filtering */
  enabled: boolean;
  /** Set of matched spot IDs (for arc highlighting) */
  matchedSpotIds: Set<string>;
  /** Recent matched spots (last MAX_RECENT_MATCHES) */
  recentMatches: MatchedSpot[];
  /** Total match count since watch was enabled */
  matchCount: number;
  /** Matches per second (rolling 30s window) */
  matchRate: number;
  /** Timestamp of last match */
  lastMatchTime: number | null;
  /** Set of already-seen spot IDs for dedup */
  seenSpotIds: Set<string>;
  /** Timestamps of recent matches for rate calculation */
  matchTimestamps: number[];
  /** Pre-compiled callsign regex (updated when criteria changes) */
  _callsignRegex: RegExp | null;
}

interface WatchActions {
  /** Set the active watch criteria */
  setWatch: (criteria: WatchCriteria) => void;
  /** Clear the active watch */
  clearWatch: () => void;
  /** Toggle auto-pan */
  toggleAutoPan: () => void;
  /** Set auto-pan */
  setAutoPan: (enabled: boolean) => void;

  /** Save the current watch as a preset */
  saveWatch: (name: string) => SavedWatch | null;
  /** Load a saved watch preset */
  loadWatch: (id: string) => void;
  /** Delete a saved watch preset */
  deleteWatch: (id: string) => void;

  /** Quick preset: watch my grid from profileStore */
  setMyGridWatch: (grid: string) => void;

  /** Set up a contest-aware watch from a contest definition */
  setContestWatch: (contestId: string) => void;

  /** Toggle "needed only" mode for contest watches */
  setNeededOnly: (enabled: boolean) => void;

  /** Check DX Cluster spots for matches. Returns new matched spots. */
  checkSpots: (spots: DXSpot[]) => MatchedSpot[];
  /** Check Live Spots for matches. Returns new matched spots. */
  checkLiveSpots: (spots: LiveSpot[]) => MatchedSpot[];

  /** Reset runtime state (call when changing criteria or on page load) */
  resetSession: () => void;
}

// Backward-compatible computed fields
interface CompatFields {
  /**
   * @deprecated v1 compat — returns active watch as synthetic WatchItem[]
   * Used by useWatchAlerts to find watches by ID
   */
  watches: WatchItem[];
  /**
   * @deprecated v1 compat — returns recent matches as WatchMatch[]
   * Used by useWatchAlerts to detect new matches
   */
  matches: WatchMatch[];
}

export interface WatchStore
  extends PersistedState, RuntimeState, WatchActions, CompatFields {}

// =============================================================================
// DEFAULTS
// =============================================================================

const defaultPersisted: PersistedState = {
  criteria: null,
  autoPan: true,
  savedWatches: [],
  neededOnly: false,
};

const defaultRuntime: RuntimeState = {
  enabled: false,
  matchedSpotIds: new Set(),
  recentMatches: [],
  matchCount: 0,
  matchRate: 0,
  lastMatchTime: null,
  seenSpotIds: new Set(),
  matchTimestamps: [],
  _callsignRegex: null,
};

// =============================================================================
// SELECTORS
// =============================================================================

/** Whether a watch is currently active */
export const selectWatchActive = (state: WatchStore): boolean =>
  state.criteria !== null && state.enabled;

/** Current match count */
export const selectMatchCount = (state: WatchStore): number => state.matchCount;

/** Current match rate (matches/sec) */
export const selectMatchRate = (state: WatchStore): number => state.matchRate;

/** Recent matches */
export const selectRecentMatches = (state: WatchStore): MatchedSpot[] =>
  state.recentMatches;

/** Whether auto-pan is enabled */
export const selectAutoPan = (state: WatchStore): boolean => state.autoPan;

/** Active criteria */
export const selectCriteria = (state: WatchStore): WatchCriteria | null =>
  state.criteria;

/** Matched spot IDs set (for arc rendering) */
export const selectMatchedSpotIds = (state: WatchStore): Set<string> =>
  state.matchedSpotIds;

/** Saved watches */
export const selectSavedWatches = (state: WatchStore): SavedWatch[] =>
  state.savedWatches;

/** Whether "needed only" mode is active for contest watches */
export const selectNeededOnly = (state: WatchStore): boolean =>
  state.neededOnly;

// ─── v1 compat selectors ────────────────────────────────────────────────────

/** @deprecated v1 compat — count of active watches (always 0 or 1 in v2) */
export const selectActiveWatchCount = (state: WatchStore): number =>
  state.criteria !== null ? 1 : 0;

/** @deprecated v1 compat — total match count */
export const selectTotalMatchCount = (state: WatchStore): number =>
  state.recentMatches.length;

/** @deprecated v1 compat — whether there are active watches */
export const selectHasActiveWatches = (state: WatchStore): boolean =>
  state.criteria !== null;

/** @deprecated v1 compat — all watches */
export const selectAllWatches = (state: WatchStore): WatchItem[] =>
  state.watches;

/** @deprecated v1 compat — all matches */
export const selectAllMatches = (state: WatchStore): WatchMatch[] =>
  state.matches;

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useWatchStore = create<WatchStore>()(
  persist(
    (set, get) => ({
      // ─── Persisted state ─────────────────────────────────────────────────
      ...defaultPersisted,

      // ─── Runtime state ───────────────────────────────────────────────────
      ...defaultRuntime,

      // ─── Backward-compatible stored fields ──────────────────────────────
      // NOTE: These are regular properties, NOT getters. Getters break with
      // Zustand's Object.assign in set() and cause infinite re-render loops
      // with useSyncExternalStore. Updated explicitly in mutations below.
      watches: [] as WatchItem[],
      matches: [] as WatchMatch[],

      // ─── Actions ─────────────────────────────────────────────────────────

      setWatch: (criteria: WatchCriteria) => {
        const regex = compileCallsignRegex(criteria.callsign);
        const compat = computeCompatFields({
          criteria,
          matchCount: 0,
          lastMatchTime: null,
          recentMatches: [],
        });
        set({
          criteria,
          enabled: true,
          _callsignRegex: regex,
          // Reset match state when criteria changes
          matchedSpotIds: new Set(),
          recentMatches: [],
          matchCount: 0,
          matchRate: 0,
          lastMatchTime: null,
          seenSpotIds: new Set(),
          matchTimestamps: [],
          ...compat,
        });
      },

      clearWatch: () => {
        set({
          criteria: null,
          enabled: false,
          _callsignRegex: null,
          matchedSpotIds: new Set(),
          recentMatches: [],
          matchCount: 0,
          matchRate: 0,
          lastMatchTime: null,
          seenSpotIds: new Set(),
          matchTimestamps: [],
          watches: EMPTY_WATCHES,
          matches: EMPTY_MATCHES,
        });
      },

      toggleAutoPan: () => {
        set((state) => ({ autoPan: !state.autoPan }));
      },

      setAutoPan: (enabled: boolean) => {
        set({ autoPan: enabled });
      },

      saveWatch: (name: string) => {
        const state = get();
        if (!state.criteria) return null;
        if (state.savedWatches.length >= MAX_SAVED_WATCHES) return null;

        const saved: SavedWatch = {
          id: generateId(),
          name: name.trim(),
          criteria: { ...state.criteria },
          createdAt: new Date().toISOString(),
        };

        set((s) => ({
          savedWatches: [...s.savedWatches, saved],
        }));
        return saved;
      },

      loadWatch: (id: string) => {
        const state = get();
        const saved = state.savedWatches.find((w) => w.id === id);
        if (!saved) return;
        // Delegate to setWatch which handles the full reset
        get().setWatch(saved.criteria);
      },

      deleteWatch: (id: string) => {
        set((state) => ({
          savedWatches: state.savedWatches.filter((w) => w.id !== id),
        }));
      },

      setMyGridWatch: (grid: string) => {
        if (!grid) return;
        const prefix = grid
          .substring(0, Math.min(grid.length, 4))
          .toUpperCase();
        get().setWatch({
          gridPrefix: prefix,
          txOrRx: "either",
        });
      },

      setContestWatch: (contestId: string) => {
        const contestDef = getContestById(contestId);
        if (!contestDef) return;

        // Infer mode from contest name/id
        let mode: string | undefined;
        const idLower = contestId.toLowerCase();
        if (idLower.includes("-cw")) mode = "CW";
        else if (idLower.includes("-ssb")) mode = "SSB";
        else if (idLower.includes("-rtty") || idLower.includes("-digital"))
          mode = "RTTY";

        // Build watch criteria tuned for this contest
        get().setWatch({
          txOrRx: "either",
          mode,
          contestId,
        });
      },

      setNeededOnly: (enabled: boolean) => {
        set({ neededOnly: enabled });
      },

      checkSpots: (spots: DXSpot[]) => {
        return processSpotBatch(get, set, spots);
      },

      checkLiveSpots: (spots: LiveSpot[]) => {
        // LiveSpot extends DXSpot, so we can use the same matching logic
        return processSpotBatch(get, set, spots);
      },

      resetSession: () => {
        const state = get();
        const compat = computeCompatFields({
          criteria: state.criteria,
          matchCount: 0,
          lastMatchTime: null,
          recentMatches: [],
        });
        set({
          matchedSpotIds: new Set(),
          recentMatches: [],
          matchCount: 0,
          matchRate: 0,
          lastMatchTime: null,
          seenSpotIds: new Set(),
          matchTimestamps: [],
          ...compat,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        criteria: state.criteria,
        autoPan: state.autoPan,
        savedWatches: state.savedWatches,
        neededOnly: state.neededOnly,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PersistedState>;
        const merged = {
          ...currentState,
          ...persisted,
          // Runtime state always resets on hydration
          ...defaultRuntime,
        };
        // Re-compile callsign regex if criteria exists
        if (merged.criteria?.callsign) {
          merged._callsignRegex = compileCallsignRegex(
            merged.criteria.callsign,
          );
          merged.enabled = true;
        }
        // Recompute compat fields from rehydrated criteria
        const compat = computeCompatFields({
          criteria: merged.criteria ?? null,
          matchCount: 0,
          lastMatchTime: null,
          recentMatches: [],
        });
        return { ...merged, ...compat };
      },
      migrate: (persistedState: unknown, version: number) => {
        if (version <= 2) {
          // v2 → v3: add neededOnly
          const state = persistedState as Record<string, unknown>;
          if (!("neededOnly" in state)) state.neededOnly = false;
        }
        if (version === 1) {
          // v1 had watches[] array → v2 has single criteria + savedWatches[]
          const v1 = persistedState as {
            watches?: Array<{
              id: string;
              type: string;
              pattern: string;
              name?: string;
              createdAt: string;
            }>;
          };
          const savedWatches: SavedWatch[] = (v1.watches ?? []).map((w) => ({
            id: w.id,
            name: w.name || w.pattern,
            criteria: {
              ...(w.type === "callsign" ? { callsign: w.pattern } : {}),
              ...(w.type === "grid" ? { gridPrefix: w.pattern } : {}),
              ...(w.type === "entity" ? { callsign: w.pattern } : {}),
              txOrRx: "either" as WatchDirection,
            },
            createdAt: w.createdAt,
          }));
          return {
            criteria: null,
            autoPan: true,
            savedWatches,
          };
        }
        return persistedState as PersistedState;
      },
    },
  ),
);

// =============================================================================
// INTERNAL: Spot batch processing
// =============================================================================

/**
 * Process a batch of spots against the active watch criteria.
 * Updates match state and returns newly matched spots.
 */
function processSpotBatch(
  get: () => WatchStore,
  set: (
    partial: Partial<WatchStore> | ((state: WatchStore) => Partial<WatchStore>),
  ) => void,
  spots: DXSpot[],
): MatchedSpot[] {
  const state = get();
  const { criteria, seenSpotIds, _callsignRegex } = state;

  // No active watch → no matches
  if (!criteria || !state.enabled) return [];

  const now = Date.now();
  const nowISO = new Date(now).toISOString();
  const newMatches: MatchedSpot[] = [];
  const newMatchedIds = new Set(state.matchedSpotIds);
  const newSeenIds = new Set(seenSpotIds);
  const newTimestamps = [...state.matchTimestamps];

  for (const spot of spots) {
    // Skip already-seen spots
    if (newSeenIds.has(spot.id)) continue;
    newSeenIds.add(spot.id);

    const matchedField = matchSpot(spot, criteria, _callsignRegex);
    if (matchedField) {
      const matched: MatchedSpot = {
        id: `${ACTIVE_WATCH_ID}:${spot.id}`,
        spot,
        matchedField,
        matchedAt: nowISO,
      };
      newMatches.push(matched);
      newMatchedIds.add(spot.id);
      newTimestamps.push(now);
    }
  }

  // Prune match timestamps outside the rolling window
  const windowStart = now - MATCH_RATE_WINDOW_MS;
  const prunedTimestamps = newTimestamps.filter((t) => t >= windowStart);

  // Calculate match rate (matches per second over rolling window)
  const matchRate =
    prunedTimestamps.length > 0
      ? prunedTimestamps.length / (MATCH_RATE_WINDOW_MS / 1000)
      : 0;

  // Update state if anything changed
  if (newMatches.length > 0 || newSeenIds.size !== seenSpotIds.size) {
    const updatedRecentMatches = [...state.recentMatches, ...newMatches].slice(
      -MAX_RECENT_MATCHES,
    );
    const newMatchCount = state.matchCount + newMatches.length;
    const newLastMatchTime = newMatches.length > 0 ? now : state.lastMatchTime;

    const compat = computeCompatFields({
      criteria,
      matchCount: newMatchCount,
      lastMatchTime: newLastMatchTime,
      recentMatches: updatedRecentMatches,
    });

    set({
      matchedSpotIds: newMatchedIds,
      recentMatches: updatedRecentMatches,
      matchCount: newMatchCount,
      matchRate,
      lastMatchTime: newLastMatchTime,
      seenSpotIds: newSeenIds,
      matchTimestamps: prunedTimestamps,
      ...compat,
    });
  } else if (matchRate !== state.matchRate) {
    // Rate might decay even without new matches
    set({ matchRate, matchTimestamps: prunedTimestamps });
  }

  return newMatches;
}

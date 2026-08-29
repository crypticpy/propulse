/**
 * Zustand store for real-time data source error states and staleness tracking.
 *
 * Runtime-only (no persistence) — resets on page reload.
 * Each data source gets a SourceStatus entry tracking errors,
 * consecutive failure counts, staleness levels, and recovery timestamps.
 */

import { create } from "zustand";
import type { DataSourceId } from "@/lib/dataSourceRegistry";
import type {
  ClassifiedError,
  StalenessLevel,
} from "@/lib/errors/classifyError";
import type { SolarCacheOutcome } from "@/lib/solar/contracts";

// =============================================================================
// TYPES
// =============================================================================

/** Which tier is serving the app: hosted cloud, LAN bridge, or no network. */
export type ConnectivityTier = "cloud" | "lan" | "offline";

export interface SourceStatus {
  /** Current classified error, or null if healthy */
  error: ClassifiedError | null;
  /** Current staleness level for this source */
  staleness: StalenessLevel;
  /** Timestamp (ms) when the current error streak started */
  errorSince: number | null;
  /** Number of consecutive errors without a successful response */
  consecutiveErrors: number;
  /** Timestamp (ms) of the last error → healthy transition */
  lastRecovery: number | null;
  /** Timestamp (ms) of the last successful fetch */
  lastSuccess: number | null;
  /** Timestamp (ms) of the most recent request attempt. */
  lastAttempt: number | null;
  /** Provider observation or forecast issue time. */
  observedAt: number | null;
  /** Cache/network tier that supplied the last usable value. */
  cacheOutcome: SolarCacheOutcome | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default status for a source that has never reported */
const DEFAULT_STATUS: SourceStatus = {
  error: null,
  staleness: "fresh",
  errorSince: null,
  consecutiveErrors: 0,
  lastRecovery: null,
  lastSuccess: null,
  lastAttempt: null,
  observedAt: null,
  cacheOutcome: null,
};

// =============================================================================
// STORE
// =============================================================================

interface DataSourceStatusState {
  /** Map of source ID → current status (only populated once a source reports) */
  sources: Partial<Record<DataSourceId, SourceStatus>>;
  /** Current connectivity tier (kept in sync by useConnectivityTier). */
  connectivity: ConnectivityTier;

  // Actions

  /** Record an error for a data source. Increments consecutiveErrors and sets errorSince on first error. */
  reportError: (
    sourceId: DataSourceId,
    error: ClassifiedError,
    metadata?: {
      observedAt?: number;
      cacheOutcome?: SolarCacheOutcome;
      staleness?: StalenessLevel;
    },
  ) => void;
  /** Record a successful fetch. Clears error state, resets consecutiveErrors, records lastRecovery if recovering. */
  reportSuccess: (
    sourceId: DataSourceId,
    metadata?: {
      observedAt?: number;
      cacheOutcome?: SolarCacheOutcome;
      staleness?: StalenessLevel;
    },
  ) => void;
  /** Update the staleness level for a data source. */
  updateStaleness: (sourceId: DataSourceId, level: StalenessLevel) => void;
  /** Update the connectivity tier (no-op when unchanged). */
  setConnectivity: (tier: ConnectivityTier) => void;
  /** Reset all source statuses (e.g. on logout or full reconnect). */
  clearAll: () => void;

  // Selectors (methods on the store, accessed via get())

  /** Return all sources currently in an error state. */
  getErrorSources: () => Array<{ id: DataSourceId; status: SourceStatus }>;
  /** Count of sources currently in error. */
  getErrorCount: () => number;
  /** Check whether a specific source is in error. */
  hasError: (sourceId: DataSourceId) => boolean;
}

/**
 * Data source status store — tracks real-time health of every data source.
 *
 * @example
 * ```tsx
 * const { reportError, reportSuccess, getErrorCount } = useDataSourceStatus();
 *
 * // On fetch failure
 * reportError('noaa-kp', classifiedError);
 *
 * // On fetch success
 * reportSuccess('noaa-kp');
 *
 * // Check health
 * const errorCount = getErrorCount();
 * ```
 */
export const useDataSourceStatus = create<DataSourceStatusState>(
  (set, get) => ({
    sources: {},
    connectivity: "cloud",

    // ========================================================================
    // Actions
    // ========================================================================

    reportError: (sourceId, error, metadata) =>
      set((state) => {
        const existing = state.sources[sourceId] ?? DEFAULT_STATUS;
        const now = Date.now();

        return {
          sources: {
            ...state.sources,
            [sourceId]: {
              ...existing,
              error,
              consecutiveErrors: existing.consecutiveErrors + 1,
              lastAttempt: now,
              observedAt: metadata?.observedAt ?? existing.observedAt,
              cacheOutcome: metadata?.cacheOutcome ?? existing.cacheOutcome,
              staleness: metadata?.staleness ?? existing.staleness,
              // Only set errorSince on the first error in a streak
              errorSince: existing.errorSince ?? now,
            },
          },
        };
      }),

    reportSuccess: (sourceId, metadata) =>
      set((state) => {
        const existing = state.sources[sourceId] ?? DEFAULT_STATUS;
        const now = Date.now();
        const wasInError = existing.error !== null;

        return {
          sources: {
            ...state.sources,
            [sourceId]: {
              ...existing,
              error: null,
              consecutiveErrors: 0,
              errorSince: null,
              lastSuccess: now,
              lastAttempt: now,
              observedAt: metadata?.observedAt ?? existing.observedAt,
              cacheOutcome: metadata?.cacheOutcome ?? existing.cacheOutcome,
              staleness: metadata?.staleness ?? existing.staleness,
              lastRecovery: wasInError ? now : existing.lastRecovery,
            },
          },
        };
      }),

    updateStaleness: (sourceId, level) =>
      set((state) => {
        const existing = state.sources[sourceId] ?? DEFAULT_STATUS;
        if (existing.staleness === level) return state;

        return {
          sources: {
            ...state.sources,
            [sourceId]: {
              ...existing,
              staleness: level,
            },
          },
        };
      }),

    setConnectivity: (tier) =>
      set((state) => (state.connectivity === tier ? state : { connectivity: tier })),

    clearAll: () => set({ sources: {} }),

    // ========================================================================
    // Selectors
    // ========================================================================

    getErrorSources: () => {
      const { sources } = get();
      const result: Array<{ id: DataSourceId; status: SourceStatus }> = [];

      for (const [id, status] of Object.entries(sources)) {
        if (status && status.error !== null) {
          result.push({ id: id as DataSourceId, status });
        }
      }

      return result;
    },

    getErrorCount: () => {
      const { sources } = get();
      let count = 0;

      for (const status of Object.values(sources)) {
        if (status && status.error !== null) {
          count++;
        }
      }

      return count;
    },

    hasError: (sourceId) => {
      const { sources } = get();
      const status = sources[sourceId];
      return status?.error != null;
    },
  }),
);

// =============================================================================
// EXTERNAL SELECTORS
// =============================================================================

/**
 * Selector: Get the status of a specific source (returns DEFAULT_STATUS if not yet tracked).
 * @example const status = useDataSourceStatus(selectSourceStatus('noaa-kp'));
 */
export const selectSourceStatus =
  (sourceId: DataSourceId) =>
  (state: DataSourceStatusState): SourceStatus =>
    state.sources[sourceId] ?? DEFAULT_STATUS;

/**
 * Selector: Whether any source is currently in error.
 * @example const hasErrors = useDataSourceStatus(selectHasAnyError);
 */
export const selectHasAnyError = (state: DataSourceStatusState): boolean =>
  Object.values(state.sources).some((s) => s?.error != null);

/**
 * Re-export DEFAULT_STATUS for consumers that need to initialize or compare.
 */
export { DEFAULT_STATUS };

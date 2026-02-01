/**
 * React hook for combined HamQTH external lookup and local log history
 * Provides callsign information from HamQTH API merged with local QSO records
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHamQTH, isHamQTHError } from "../lib/api/hamqth";
import { getLogEntriesByCallsign } from "../lib/db/logStore";
import type { LogEntry } from "../lib/db/types";

// Time constants
const MINUTE = 60 * 1000;

/**
 * External data fetched from HamQTH
 */
export interface ExternalCallsignData {
  name?: string;
  grid?: string;
  qth?: string;
  country?: string;
  cqzone?: number;
  ituzone?: number;
  lat?: number;
  lon?: number;
}

/**
 * Local log history for a callsign
 */
export interface LocalCallsignData {
  isWorked: boolean;
  qsoCount: number;
  lastQSO?: {
    date: string;
    band: string;
    mode: string;
    name?: string;
    grid?: string;
  };
  workedBands: string[];
  workedModes: string[];
}

/**
 * Combined callsign lookup result
 */
export interface CallsignLookupResult {
  /** External data from HamQTH */
  external?: ExternalCallsignData;
  /** Local log history */
  local?: LocalCallsignData;
  /** Combined loading state (true if either query is loading) */
  loading: boolean;
  /** External lookup error */
  externalError?: string;
  /** Local lookup error */
  localError?: string;
}

/**
 * Normalize a callsign for consistent lookups
 */
function normalizeCallsign(callsign: string): string {
  return callsign.trim().toUpperCase();
}

/**
 * Custom hook to debounce a value
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for looking up local log entries for a callsign
 */
function useLocalLookup(callsign: string) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = normalizeCallsign(callsign);

    if (!normalized || normalized.length < 3) {
      setEntries([]);
      setError(null);
      return;
    }

    let cancelled = false;

    async function lookup() {
      try {
        setLoading(true);
        setError(null);
        const results = await getLogEntriesByCallsign(normalized);
        if (!cancelled) {
          // Sort by date descending (newest first)
          results.sort((a, b) => {
            const dateCompare = b.date.localeCompare(a.date);
            if (dateCompare !== 0) return dateCompare;
            return b.timeOn.localeCompare(a.timeOn);
          });
          setEntries(results);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to lookup callsign";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    lookup();

    return () => {
      cancelled = true;
    };
  }, [callsign]);

  // Derive local data from entries
  const localData = useMemo((): LocalCallsignData | undefined => {
    if (entries.length === 0) {
      return undefined;
    }

    const lastEntry = entries[0];
    const workedBands = Array.from(new Set(entries.map((e) => e.band))).filter(
      Boolean,
    );
    const workedModes = Array.from(new Set(entries.map((e) => e.mode))).filter(
      Boolean,
    );

    return {
      isWorked: true,
      qsoCount: entries.length,
      lastQSO: {
        date: lastEntry.date,
        band: lastEntry.band,
        mode: lastEntry.mode,
        name: lastEntry.name,
        grid: lastEntry.grid,
      },
      workedBands,
      workedModes,
    };
  }, [entries]);

  return {
    data: localData,
    loading,
    error,
  };
}

/**
 * Hook for combined HamQTH external lookup and local log history
 *
 * @param callsign - The callsign to look up
 * @returns CallsignLookupResult with external data, local history, and loading states
 *
 * @example
 * ```tsx
 * const { external, local, loading, externalError, localError } = useHamQTHLookup(callsign);
 *
 * if (loading) {
 *   return <Spinner />;
 * }
 *
 * if (local?.isWorked) {
 *   console.log(`Worked on ${local.workedBands.join(', ')}`);
 * }
 *
 * if (external?.name) {
 *   console.log(`Operator: ${external.name}`);
 * }
 * ```
 */
export function useHamQTHLookup(callsign: string): CallsignLookupResult {
  // Debounce the callsign input (300ms)
  const debouncedCallsign = useDebouncedValue(callsign, 300);
  const normalizedCallsign = normalizeCallsign(debouncedCallsign);

  // Check if we should enable the queries (minimum 3 characters)
  const shouldQuery = normalizedCallsign.length >= 3;

  // External lookup via TanStack Query
  const externalQuery = useQuery({
    queryKey: ["hamqth", normalizedCallsign],
    queryFn: async () => {
      const result = await fetchHamQTH(normalizedCallsign);

      if (isHamQTHError(result)) {
        throw new Error(result.error);
      }

      // Map to ExternalCallsignData format
      const externalData: ExternalCallsignData = {
        name: result.name,
        grid: result.grid,
        qth: result.qth,
        country: result.country,
        cqzone: result.cqzone,
        ituzone: result.ituzone,
        lat: result.lat,
        lon: result.lon,
      };

      return externalData;
    },
    enabled: shouldQuery,
    staleTime: 5 * MINUTE,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  // Local lookup (uses debounced callsign)
  const localLookup = useLocalLookup(shouldQuery ? normalizedCallsign : "");

  // Combine loading states
  const loading = externalQuery.isLoading || localLookup.loading;

  // Build the result
  const result: CallsignLookupResult = {
    loading,
  };

  // Add external data if available
  if (externalQuery.data) {
    result.external = externalQuery.data;
  }

  // Add external error if present
  if (externalQuery.error) {
    result.externalError =
      externalQuery.error instanceof Error
        ? externalQuery.error.message
        : "External lookup failed";
  }

  // Add local data if available
  if (localLookup.data) {
    result.local = localLookup.data;
  }

  // Add local error if present
  if (localLookup.error) {
    result.localError = localLookup.error;
  }

  return result;
}

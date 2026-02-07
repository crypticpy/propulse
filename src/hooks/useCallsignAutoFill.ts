/**
 * useCallsignAutoFill
 *
 * Debounced callsign lookup hook for the profile page.
 * When the callsign input is >= 3 characters, queries HamQTH
 * and returns a suggestion object that the profile form can use
 * to auto-fill operator name, grid, country, and license class.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchHamQTH, isHamQTHError } from "@/lib/api/hamqth";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CallsignSuggestion {
  name?: string;
  grid?: string;
  country?: string;
  licenseClass?: string;
}

export interface CallsignAutoFillResult {
  suggestion: CallsignSuggestion | null;
  loading: boolean;
  error: string | null;
}

// ─── Internal debounce hook ─────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

const MINUTE = 60_000;

export function useCallsignAutoFill(callsign: string): CallsignAutoFillResult {
  const debouncedCallsign = useDebouncedValue(
    callsign.trim().toUpperCase(),
    500,
  );
  const shouldQuery = debouncedCallsign.length >= 3;

  const { data, isLoading, error } = useQuery({
    queryKey: ["callsign-autofill", debouncedCallsign],
    queryFn: async (): Promise<CallsignSuggestion | null> => {
      const result = await fetchHamQTH(debouncedCallsign);

      if (isHamQTHError(result)) {
        throw new Error(result.error);
      }

      // Only return a suggestion if we got meaningful data
      if (!result.name && !result.grid && !result.country) {
        return null;
      }

      return {
        name: result.name,
        grid: result.grid,
        country: result.country,
        // HamQTH doesn't return license class directly, so leave undefined
        licenseClass: undefined,
      };
    },
    enabled: shouldQuery,
    staleTime: 10 * MINUTE,
    retry: 1,
    retryDelay: 2000,
  });

  return {
    suggestion: data ?? null,
    loading: isLoading && shouldQuery,
    error: error instanceof Error ? error.message : null,
  };
}

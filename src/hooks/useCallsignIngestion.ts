/**
 * useCallsignIngestion
 *
 * Debounced multi-source callsign ingestion hook for the profile page.
 * Queries Callook + HamQTH + QRZ (if API key configured) in parallel,
 * merges results with priority ordering, and returns a rich suggestion
 * object with all available profile fields.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProfileStore } from "@/stores/profileStore";
import {
  ingestCallsign,
  type IngestionResult,
} from "@/lib/api/callsignIngestion";

export type { IngestionResult };

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

export interface CallsignIngestionResult {
  result: IngestionResult | null;
  loading: boolean;
  error: string | null;
}

export function useCallsignIngestion(
  callsign: string,
): CallsignIngestionResult {
  const debouncedCallsign = useDebouncedValue(
    callsign.trim().toUpperCase(),
    500,
  );
  const shouldQuery = debouncedCallsign.length >= 3;

  // Read QRZ API key from profile store (may be undefined)
  const qrzApiKey = useProfileStore((s) => s.serviceCredentials.qrz?.apiKey);

  const { data, isLoading, error } = useQuery({
    queryKey: ["callsign-ingestion", debouncedCallsign, qrzApiKey ?? ""],
    queryFn: () => ingestCallsign(debouncedCallsign, qrzApiKey),
    enabled: shouldQuery,
    staleTime: 10 * MINUTE,
    retry: 1,
    retryDelay: 2000,
  });

  return {
    result: data ?? null,
    loading: isLoading && shouldQuery,
    error: error instanceof Error ? error.message : null,
  };
}

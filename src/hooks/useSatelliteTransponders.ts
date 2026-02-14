/**
 * useSatelliteTransponders Hook
 *
 * Fetches active transmitter/transponder data from the SatNOGS database
 * via the app's proxy endpoint. Uses TanStack Query with a 24-hour
 * stale time since transponder data changes rarely.
 *
 * Optionally filters results by NORAD catalog ID.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SatNOGSTransmitter } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;

/** Transponder data endpoint (Vercel Edge Function proxy) */
const TRANSPONDER_API_URL = "/api/satellites/transponders";

/** Data changes rarely — 24 hour stale time */
const STALE_TIME = 24 * HOUR;

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchTransponders(): Promise<SatNOGSTransmitter[]> {
  const response = await fetch(TRANSPONDER_API_URL, {
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch transponders: ${response.status} ${response.statusText}`,
    );
  }

  const data: SatNOGSTransmitter[] = await response.json();
  return data;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseSatelliteTranspondersResult {
  /** All transponders (or filtered by noradId if provided) */
  transponders: SatNOGSTransmitter[];
  /** Whether the initial fetch is in progress */
  isLoading: boolean;
  /** Error from the fetch, if any */
  error: Error | null;
  /** Whether any transponder data is available */
  isAvailable: boolean;
}

/**
 * Fetch and optionally filter SatNOGS transponder data.
 *
 * @param noradId - Optional NORAD catalog ID to filter by.
 *                  When undefined, returns all active transponders.
 */
export function useSatelliteTransponders(
  noradId?: number,
): UseSatelliteTranspondersResult {
  const {
    data: allTransponders,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["satellites", "transponders"],
    queryFn: fetchTransponders,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: true,
    retry: 2,
    // Keep previous data while refetching
    placeholderData: (previousData) => previousData,
  });

  // Filter by noradId if provided
  const transponders = useMemo(() => {
    if (!allTransponders) return [];
    if (noradId === undefined) return allTransponders;
    return allTransponders.filter((t) => t.norad_cat_id === noradId);
  }, [allTransponders, noradId]);

  return {
    transponders,
    isLoading,
    error: error as Error | null,
    isAvailable: transponders.length > 0,
  };
}

export default useSatelliteTransponders;

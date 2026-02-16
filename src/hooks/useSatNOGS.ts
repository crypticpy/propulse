/**
 * useSatNOGS — On-demand hook for SatNOGS transmitter data.
 *
 * Fetches live transmitter/frequency data from the SatNOGS DB for a specific
 * satellite (by NORAD ID). Uses IDB cache (12h TTL) as offline fallback
 * and initialData for TanStack Query. Only fetches when enabled.
 */

import { useQuery } from "@tanstack/react-query";
import { getCachedResponse, setCachedResponse } from "@/lib/utils/idbCache";
import type { SatNOGSTransmitter } from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;

/** Transmitter data changes very infrequently — 12h cache + staleTime */
const TRANSMITTER_TTL = 12 * HOUR;

// ---------------------------------------------------------------------------
// Hook Interface
// ---------------------------------------------------------------------------

interface UseSatNOGSResult {
  /** Alive transmitters for the requested satellite */
  transmitters: SatNOGSTransmitter[];
  /** Whether the query is currently loading */
  isLoading: boolean;
  /** Fetch error, if any */
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

export function useSatNOGS(noradId: number | null): UseSatNOGSResult {
  const { data, isLoading, error } = useQuery<SatNOGSTransmitter[]>({
    queryKey: ["satnogs", "transmitters", noradId],
    enabled: noradId !== null,
    staleTime: TRANSMITTER_TTL,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async (): Promise<SatNOGSTransmitter[]> => {
      const cacheKey = `satnogs-transmitters-${noradId}`;

      // 1. Check IDB cache first (offline fallback / fast path)
      try {
        const cached = await getCachedResponse(cacheKey);
        if (cached) return cached as SatNOGSTransmitter[];
      } catch {
        // IDB unavailable (private browsing, etc.) — fall through to network
      }

      // 2. Fetch from API
      const res = await fetch(`/api/satellites/satnogs?norad=${noradId}`);
      if (!res.ok) {
        throw new Error(`SatNOGS fetch failed: ${res.status}`);
      }

      const data: SatNOGSTransmitter[] = await res.json();
      const alive = data.filter((t) => t.alive);

      // 3. Persist to IDB cache
      try {
        await setCachedResponse(cacheKey, alive, TRANSMITTER_TTL);
      } catch {
        // Swallow write errors — cache is best-effort
      }

      return alive;
    },
  });

  return {
    transmitters: data ?? [],
    isLoading,
    error: error as Error | null,
  };
}

export default useSatNOGS;

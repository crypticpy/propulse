/**
 * Hook: D-Region Absorption Prediction (DRAP) Overlay
 *
 * Fetches DRAP global frequency data from the /api/solar/drap edge function.
 * Uses TanStack Query for caching, automatic refetching, and error handling.
 *
 * DRAP data shows D-region absorption frequencies across the globe,
 * indicating HF radio blackout areas caused by solar X-ray and proton events.
 *
 * Only fetches when the DRAP layer is enabled in mapStore.
 */

import { useQuery } from "@tanstack/react-query";
import { useMapStore } from "@/stores/mapStore";
import type { DRAPData } from "@/types/alerts";

// ─── Constants ──────────────────────────────────────────────────────────────

const MINUTE = 60 * 1000;

export const DRAP_QUERY_KEY = ["solar", "drap"] as const;

// ─── Fetcher ────────────────────────────────────────────────────────────────

async function fetchDRAPData(): Promise<DRAPData> {
  const response = await fetch("/api/solar/drap");

  if (!response.ok) {
    throw new Error(
      `DRAP API returned ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Fetch DRAP global frequency absorption data.
 *
 * Refreshes every 15 minutes, matching the NOAA DRAP update cadence.
 *
 * @returns { data, isLoading, error, dataUpdatedAt }
 */
export function useDRAPOverlay() {
  const drapEnabled = useMapStore((s) => s.layers.drap);

  const query = useQuery({
    queryKey: [...DRAP_QUERY_KEY],
    queryFn: fetchDRAPData,
    enabled: drapEnabled,
    staleTime: 15 * MINUTE,
    refetchInterval: drapEnabled ? 15 * MINUTE : false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

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

import { useMapStore } from "@/stores/mapStore";
import { useSolarResource } from "./useSolarResource";
import type { DrapGrid } from "@/lib/solar/dataTypes";
import { SOLAR_QUERY_KEYS } from "@/lib/solar/sourcePolicies";

export const DRAP_QUERY_KEY = SOLAR_QUERY_KEYS["noaa-drap"];

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

  const query = useSolarResource<DrapGrid>("noaa-drap", drapEnabled);
  const resource = query.data;

  return {
    data: resource?.envelope.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    dataUpdatedAt: resource
      ? Date.parse(resource.envelope.observedAt)
      : query.dataUpdatedAt,
    state: resource?.state,
    cacheOutcome: resource?.cacheOutcome,
  };
}

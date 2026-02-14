/**
 * Hook: WSPR Spot Data
 *
 * Fetches WSPR (Weak Signal Propagation Reporter) spot data from the
 * /api/propagation/wspr edge function. Uses TanStack Query for caching,
 * automatic refetching, and error handling.
 *
 * Only fetches when the WSPR layer is enabled in mapStore.
 */

import { useQuery } from "@tanstack/react-query";
import { useMapStore } from "@/stores/mapStore";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WSPRSpot {
  /** Transmitter callsign */
  callsign: string;
  /** Transmitter Maidenhead grid */
  grid: string;
  /** Frequency in MHz */
  frequency: number;
  /** Signal-to-noise ratio in dB */
  snr: number;
  /** Frequency drift in Hz */
  drift: number;
  /** Distance in km */
  distance: number;
  /** ISO timestamp of the spot */
  timestamp: string;
  /** Transmitter latitude */
  txLat: number;
  /** Transmitter longitude */
  txLon: number;
  /** Receiver callsign */
  rxCallsign: string;
  /** Receiver Maidenhead grid */
  rxGrid: string;
  /** Receiver latitude */
  rxLat: number;
  /** Receiver longitude */
  rxLon: number;
}

interface WSPRResponse {
  band: string;
  count: number;
  timestamp: string;
  spots: WSPRSpot[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MINUTE = 60 * 1000;

export const WSPR_QUERY_KEY = ["propagation", "wspr"] as const;

// ─── Fetcher ────────────────────────────────────────────────────────────────

async function fetchWSPRSpots(band: string): Promise<WSPRResponse> {
  const params = new URLSearchParams({ band });
  const response = await fetch(`/api/propagation/wspr?${params}`);

  if (!response.ok) {
    throw new Error(
      `WSPR API returned ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Fetch WSPR spot data for a given band.
 *
 * @param band - WSPR band (e.g., "20m", "40m", "all"). Defaults to "20m".
 * @returns { spots, isLoading, error, dataUpdatedAt }
 */
export function useWSPRSpots(band: string = "20m") {
  const wsprEnabled = useMapStore((s) => s.layers.wspr);

  const query = useQuery({
    queryKey: [...WSPR_QUERY_KEY, band],
    queryFn: () => fetchWSPRSpots(band),
    enabled: wsprEnabled,
    staleTime: 5 * MINUTE,
    refetchInterval: wsprEnabled ? 5 * MINUTE : false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    spots: query.data?.spots ?? [],
    count: query.data?.count ?? 0,
    timestamp: query.data?.timestamp ?? null,
    isLoading: query.isLoading,
    error: query.error,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

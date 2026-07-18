/** Fetches real recent WSPR observations; no synthetic fallback is permitted. */

import { useQuery } from "@tanstack/react-query";
import { useMapStore } from "@/stores/mapStore";
import { WSPR_LIVE_SOURCE_ENABLED } from "@/lib/map/layerCapabilities";

export interface WSPRSpot {
  callsign: string;
  grid: string;
  frequency: number;
  snr: number;
  drift: number;
  distance: number;
  timestamp: string;
  txLat: number;
  txLon: number;
  rxCallsign: string;
  rxGrid: string;
  rxLat: number;
  rxLon: number;
}
interface LiveWSPRSpot {
  txCallsign: string;
  txGrid: string;
  txLat: number;
  txLon: number;
  rxCallsign: string;
  rxGrid: string;
  rxLat: number;
  rxLon: number;
  frequency: number;
  snr: number;
  drift: number;
  distance: number;
  time: string;
}

interface LiveWSPRResponse {
  source: "wspr.live";
  live: boolean;
  fetchedAt: string;
  spots: LiveWSPRSpot[];
}

interface WSPRResponse {
  source: string;
  live: boolean;
  count: number;
  timestamp: string;
  spots: WSPRSpot[];
}

const MINUTE = 60 * 1000;
export const WSPR_QUERY_KEY = ["propagation", "wspr", "live"] as const;

async function fetchWSPRSpots(band: string): Promise<WSPRResponse> {
  const params = new URLSearchParams({ band });
  const response = await fetch(`/api/wspr/spots?${params}`);
  if (!response.ok) {
    throw new Error(
      `Live WSPR API returned ${response.status}: ${response.statusText}`,
    );
  }
  const data: LiveWSPRResponse = await response.json();
  if (data.live !== true || data.source !== "wspr.live") {
    throw new Error("WSPR endpoint did not return verified live observations");
  }

  const spots = data.spots.map((spot) => ({
    callsign: spot.txCallsign,
    grid: spot.txGrid,
    frequency:
      spot.frequency > 1000 ? spot.frequency / 1_000_000 : spot.frequency,
    snr: spot.snr,
    drift: spot.drift,
    distance: spot.distance,
    timestamp: spot.time,
    txLat: spot.txLat,
    txLon: spot.txLon,
    rxCallsign: spot.rxCallsign,
    rxGrid: spot.rxGrid,
    rxLat: spot.rxLat,
    rxLon: spot.rxLon,
  }));

  return {
    source: data.source,
    live: true,
    count: spots.length,
    timestamp: data.fetchedAt,
    spots,
  };
}

export function useWSPRSpots(band: string = "20m") {
  const wsprEnabled = useMapStore((state) => state.layers.wspr);
  const queryEnabled = wsprEnabled && WSPR_LIVE_SOURCE_ENABLED;
  const query = useQuery({
    queryKey: [...WSPR_QUERY_KEY, band],
    queryFn: () => fetchWSPRSpots(band),
    enabled: queryEnabled,
    staleTime: 2 * MINUTE,
    refetchInterval: queryEnabled ? 2 * MINUTE : false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  return {
    spots: query.data?.spots ?? [],
    count: query.data?.count ?? 0,
    timestamp: query.data?.timestamp ?? null,
    source: query.data?.source ?? null,
    isLive: query.data?.live ?? false,
    isLoading: query.isLoading,
    error: query.error,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}

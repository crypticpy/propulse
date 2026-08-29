/**
 * useUvIndex — current/today/3-day UV index forecast for the operator's QTH.
 *
 * Backed by the Open-Meteo proxy (`/api/atmos/uv`); no API key required.
 */

import { useQuery } from "@tanstack/react-query";
import { useUserStore } from "@/stores/userStore";

const MINUTE = 60 * 1000;

export interface UvCurrent {
  time: string;
  uvIndex: number;
}

export interface UvDailyEntry {
  date: string;
  uvIndexMax: number | null;
  uvIndexClearSkyMax: number | null;
}

export interface UvHourlyEntry {
  time: string;
  uvIndex: number | null;
}

export interface UvResponse {
  current: UvCurrent | null;
  todayMax: number | null;
  daily: UvDailyEntry[];
  hourlyToday: UvHourlyEntry[];
}

/** WHO UV Index scale → Tailwind text color class. */
export function uvSeverityClass(uv: number | null | undefined): string {
  if (uv == null || !Number.isFinite(uv)) return "text-gray-400";
  if (uv < 3) return "text-signal-green";
  if (uv < 6) return "text-caution-amber";
  if (uv < 8) return "text-plasma-orange";
  if (uv < 11) return "text-alert-red";
  return "text-aurora-purple";
}

async function fetchUvIndex(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<UvResponse> {
  const res = await fetch(`/api/atmos/uv?lat=${lat}&lon=${lon}`, { signal });
  if (!res.ok) throw new Error(`UV API returned ${res.status}`);
  return res.json();
}

export function useUvIndex() {
  const station = useUserStore((s) => s.station);
  const lat = station?.lat ?? null;
  const lon = station?.lon ?? null;
  const hasLocation = lat != null && lon != null;

  const { data, isLoading, error } = useQuery<UvResponse>({
    queryKey: ["uv-index", lat, lon],
    queryFn: ({ signal }) => fetchUvIndex(lat!, lon!, signal),
    enabled: hasLocation,
    staleTime: 30 * MINUTE,
    gcTime: 60 * MINUTE,
    refetchInterval: hasLocation ? 30 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return { uv: data ?? null, isLoading, error, hasLocation };
}

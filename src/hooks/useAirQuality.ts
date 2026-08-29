/**
 * useAirQuality — current AQI for the operator's QTH.
 *
 * Backed by the AirNow/WAQI proxy (`/api/atmos/aqi`), which degrades to a
 * `configuration_missing` payload when neither upstream API key is
 * configured server-side.
 */

import { useQuery } from "@tanstack/react-query";
import { useUserStore } from "@/stores/userStore";

const MINUTE = 60 * 1000;

export type AqiSource = "airnow" | "waqi" | "none";

export interface AqiMeta {
  fallback?: boolean;
  reason?: "configuration_missing" | "upstream_error";
}

export interface AqiResponse {
  aqi: number | null;
  category: string | null;
  pollutant: string | null;
  observedAt: string | null;
  source: AqiSource;
  _meta?: AqiMeta;
}

/** EPA AQI category breakpoints → Tailwind text color class. */
export function aqiSeverityClass(aqi: number | null | undefined): string {
  if (aqi == null || !Number.isFinite(aqi)) return "text-gray-400";
  if (aqi <= 50) return "text-signal-green";
  if (aqi <= 100) return "text-caution-amber";
  if (aqi <= 150) return "text-plasma-orange";
  if (aqi <= 200) return "text-alert-red";
  return "text-aurora-purple"; // Very Unhealthy / Hazardous
}

async function fetchAirQuality(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<AqiResponse> {
  const res = await fetch(`/api/atmos/aqi?lat=${lat}&lon=${lon}`, { signal });
  if (!res.ok) throw new Error(`AQI API returned ${res.status}`);
  return res.json();
}

export function useAirQuality() {
  const station = useUserStore((s) => s.station);
  const lat = station?.lat ?? null;
  const lon = station?.lon ?? null;
  const hasLocation = lat != null && lon != null;

  const { data, isLoading, error } = useQuery<AqiResponse>({
    queryKey: ["air-quality", lat, lon],
    queryFn: ({ signal }) => fetchAirQuality(lat!, lon!, signal),
    enabled: hasLocation,
    staleTime: 15 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchInterval: hasLocation ? 15 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const configurationMissing = data?._meta?.reason === "configuration_missing";

  return {
    aqi: data ?? null,
    isLoading,
    error,
    hasLocation,
    configurationMissing,
  };
}

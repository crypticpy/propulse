/**
 * useTides — 48h tide predictions for the operator's QTH.
 *
 * Backed by the NOAA CO-OPS proxy (`/api/atmos/tides`), which resolves the
 * nearest tide-prediction station to a lat/lon and returns hi/lo events plus
 * a decimated 30-minute curve, both in GMT.
 */

import { useQuery } from "@tanstack/react-query";
import { useUserStore } from "@/stores/userStore";

const MINUTE = 60 * 1000;

export interface TideStation {
  id: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
  distanceKm: number | null;
}

export interface TidePoint {
  time: string; // "YYYY-MM-DD HH:mm", GMT
  heightM: number;
  type?: "H" | "L";
}

export interface TidesResponse {
  station: TideStation | null;
  units: "metric";
  hilo: TidePoint[];
  curve: TidePoint[];
}

export interface TideSparkline {
  /** SVG polyline `points` attribute value. */
  points: string;
  /** X position (0..width) of the "now" tick, or null if now is outside the curve's range. */
  nowX: number | null;
  min: number;
  max: number;
}

/**
 * NOAA CO-OPS returns "YYYY-MM-DD HH:mm" in GMT (the proxy requests
 * `time_zone=gmt`). Parse it as an explicit UTC instant rather than letting
 * `Date.parse` treat the offset-less string as the runtime's local time.
 */
function parseNoaaTimeUtc(t: string): Date {
  return new Date(`${t.replace(" ", "T")}Z`);
}

/** Build a hand-rolled sparkline (no chart library) from a tide curve. */
export function buildTideSparkline(
  curve: TidePoint[],
  now: Date,
  width = 100,
  height = 32,
): TideSparkline {
  if (curve.length === 0) {
    return { points: "", nowX: null, min: 0, max: 0 };
  }

  const heights = curve.map((p) => p.heightM);
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const range = max - min || 1;

  const times = curve.map((p) => parseNoaaTimeUtc(p.time).getTime());
  const t0 = times[0];
  const span = times[times.length - 1] - t0 || 1;

  const points = curve
    .map((p, i) => {
      const x = ((times[i] - t0) / span) * width;
      const y = height - ((p.heightM - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const nowMs = now.getTime();
  const inRange = nowMs >= t0 && nowMs <= t0 + span;
  const nowX = inRange ? ((nowMs - t0) / span) * width : null;

  return { points, nowX, min, max };
}

/** Nearest upcoming high and low tide events, relative to `now`. */
export function findNextTideEvents(
  hilo: TidePoint[],
  now: Date,
): { nextHigh: TidePoint | null; nextLow: TidePoint | null } {
  const nowMs = now.getTime();
  let nextHigh: TidePoint | null = null;
  let nextLow: TidePoint | null = null;

  for (const event of hilo) {
    const eventMs = parseNoaaTimeUtc(event.time).getTime();
    if (eventMs < nowMs) continue;

    if (
      event.type === "H" &&
      (!nextHigh || eventMs < parseNoaaTimeUtc(nextHigh.time).getTime())
    ) {
      nextHigh = event;
    }
    if (
      event.type === "L" &&
      (!nextLow || eventMs < parseNoaaTimeUtc(nextLow.time).getTime())
    ) {
      nextLow = event;
    }
  }

  return { nextHigh, nextLow };
}

async function fetchTides(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<TidesResponse> {
  const res = await fetch(`/api/atmos/tides?lat=${lat}&lon=${lon}`, {
    signal,
  });
  if (!res.ok) throw new Error(`Tides API returned ${res.status}`);
  return res.json();
}

export function useTides() {
  const station = useUserStore((s) => s.station);
  const lat = station?.lat ?? null;
  const lon = station?.lon ?? null;
  const hasLocation = lat != null && lon != null;

  const { data, isLoading, error } = useQuery<TidesResponse>({
    queryKey: ["tides", lat, lon],
    queryFn: ({ signal }) => fetchTides(lat!, lon!, signal),
    enabled: hasLocation,
    staleTime: 30 * MINUTE,
    gcTime: 60 * MINUTE,
    refetchInterval: hasLocation ? 30 * MINUTE : false,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return { tides: data ?? null, isLoading, error, hasLocation };
}

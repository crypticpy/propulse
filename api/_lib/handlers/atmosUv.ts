/**
 * Vercel Edge Function: Open-Meteo UV Index Proxy
 * Fetches current/today/3-day UV index forecast, no API key required.
 *
 * Source: https://api.open-meteo.com/v1/forecast
 * Cache: 30 minutes with 5 minute stale-while-revalidate
 */

import { applyRateLimit } from "../rateLimit";

/**
 * Get the allowed CORS origin based on environment.
 * Never returns wildcard "*" to prevent security issues.
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "Propulse/1.0 (Ham Radio Dashboard)";

/** Lat/lon boundary validator, shared shape with the other atmos/* handlers. */
export function parseLatLon(
  latRaw: string | null,
  lonRaw: string | null,
): { lat: number; lon: number } | null {
  if (!latRaw || !lonRaw) return null;
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export interface UvDailyEntry {
  date: string;
  uvIndexMax: number | null;
  uvIndexClearSkyMax: number | null;
}

export interface UvHourlyEntry {
  time: string;
  uvIndex: number | null;
}

export interface UvPayload {
  current: { time: string; uvIndex: number } | null;
  todayMax: number | null;
  daily: UvDailyEntry[];
  hourlyToday: UvHourlyEntry[];
}

const NAIVE_LOCAL_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Convert a naive "YYYY-MM-DDTHH:mm" local timestamp (as returned by
 * Open-Meteo with timezone=auto) to a real UTC instant, given the location's
 * `utc_offset_seconds`. Deliberately avoids `Date.parse`, which treats
 * offset-less date-time strings as *runtime* local time (spec behavior) —
 * that would make the result depend on the server/test machine's own TZ.
 */
function naiveLocalToUtcMs(timeStr: string, utcOffsetSeconds: number): number | null {
  const match = NAIVE_LOCAL_TIME_RE.exec(timeStr);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const asUtcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  return asUtcMs - utcOffsetSeconds * 1000;
}

/**
 * Normalize an Open-Meteo forecast response into a lean UV payload.
 * `nowMs` is injectable for tests; defaults to the real clock.
 */
export function normalizeUvPayload(
  data: unknown,
  nowMs: number = Date.now(),
): UvPayload {
  const empty: UvPayload = {
    current: null,
    todayMax: null,
    daily: [],
    hourlyToday: [],
  };
  if (!data || typeof data !== "object") return empty;

  const body = data as Record<string, unknown>;
  const daily = body.daily as Record<string, unknown> | undefined;
  const hourly = body.hourly as Record<string, unknown> | undefined;
  const utcOffsetSeconds = Number(body.utc_offset_seconds) || 0;

  const dailyEntries: UvDailyEntry[] = [];
  if (daily && Array.isArray(daily.time)) {
    const times = daily.time as unknown[];
    const maxArr = Array.isArray(daily.uv_index_max)
      ? (daily.uv_index_max as unknown[])
      : [];
    const clearArr = Array.isArray(daily.uv_index_clear_sky_max)
      ? (daily.uv_index_clear_sky_max as unknown[])
      : [];
    for (let i = 0; i < times.length; i++) {
      if (typeof times[i] !== "string") continue;
      const uvMax = Number(maxArr[i]);
      const uvClear = Number(clearArr[i]);
      dailyEntries.push({
        date: times[i] as string,
        uvIndexMax: Number.isFinite(uvMax) ? uvMax : null,
        uvIndexClearSkyMax: Number.isFinite(uvClear) ? uvClear : null,
      });
    }
  }

  const hourlyToday: UvHourlyEntry[] = [];
  let current: UvPayload["current"] = null;
  if (hourly && Array.isArray(hourly.time)) {
    const times = hourly.time as unknown[];
    const values = Array.isArray(hourly.uv_index)
      ? (hourly.uv_index as unknown[])
      : [];
    const todayDate = dailyEntries[0]?.date ?? (times[0] as string)?.slice(0, 10);
    let nearestDiffMs = Infinity;

    for (let i = 0; i < times.length; i++) {
      const timeStr = times[i];
      if (typeof timeStr !== "string") continue;
      const uvValue = Number(values[i]);
      const uvIndex = Number.isFinite(uvValue) ? uvValue : null;

      if (todayDate && timeStr.startsWith(todayDate)) {
        hourlyToday.push({ time: timeStr, uvIndex });
      }

      if (uvIndex === null) continue;
      const actualUtcMs = naiveLocalToUtcMs(timeStr, utcOffsetSeconds);
      if (actualUtcMs === null) continue;
      const diffMs = Math.abs(actualUtcMs - nowMs);
      if (diffMs < nearestDiffMs) {
        nearestDiffMs = diffMs;
        current = { time: timeStr, uvIndex };
      }
    }
  }

  return {
    current,
    todayMax: dailyEntries[0]?.uvIndexMax ?? null,
    daily: dailyEntries,
    hourlyToday,
  };
}

function uvCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function fallbackUvResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      current: null,
      todayMax: null,
      daily: [],
      hourlyToday: [],
      _meta: { fallback: true },
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    },
  );
}

export async function handleAtmosUv(request: Request): Promise<Response> {
  const corsHeaders = uvCorsHeaders();

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "atmos/uv", 20, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const latLon = parseLatLon(
    url.searchParams.get("lat"),
    url.searchParams.get("lon"),
  );

  if (!latLon) {
    return new Response(
      JSON.stringify({
        error: "'lat' and 'lon' query parameters are required and must be in valid ranges.",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const params = new URLSearchParams({
    latitude: String(latLon.lat),
    longitude: String(latLon.lon),
    daily: "uv_index_max,uv_index_clear_sky_max",
    hourly: "uv_index",
    forecast_days: "3",
    timezone: "auto",
  });

  try {
    const response = await fetch(`${OPEN_METEO_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      console.error(`Open-Meteo UV upstream returned ${response.status}`);
      return fallbackUvResponse(corsHeaders);
    }

    const payload = normalizeUvPayload(await response.json());

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=1800, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`UV fetch failed: ${message}`);
    return fallbackUvResponse(corsHeaders);
  }
}

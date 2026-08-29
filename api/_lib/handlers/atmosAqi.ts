/**
 * Vercel Edge Function: Air Quality Index Proxy
 * Primary: AirNow (env AIRNOW_API_KEY). Fallback: WAQI (env WAQI_TOKEN).
 * Degrades to a `configuration_missing` 200 payload when neither env is set,
 * mirroring how `handleAtmosRepeaters` degrades on a missing token.
 *
 * Sources: https://www.airnowapi.org/aq/observation/latLong/current/
 *          https://api.waqi.info/feed/geo:{lat};{lon}/
 * Cache: 15 minutes with 3 minute stale-while-revalidate
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

const AIRNOW_URL = "https://www.airnowapi.org/aq/observation/latLong/current/";
const WAQI_URL = "https://api.waqi.info/feed";

export type AqiSource = "airnow" | "waqi" | "none";

export interface AqiPayload {
  aqi: number | null;
  category: string | null;
  pollutant: string | null;
  observedAt: string | null;
  source: AqiSource;
}

/** EPA AQI category breakpoints, used when an upstream doesn't supply one. */
export function categoryForAqi(aqi: number): string {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for Sensitive Groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

/** AirNow returns one row per pollutant; the worst AQI value governs. */
export function normalizeAirNowPayload(raw: unknown): AqiPayload | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  let best: Record<string, unknown> | null = null;
  let bestAqi = -Infinity;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const aqi = Number((entry as Record<string, unknown>).AQI);
    if (!Number.isFinite(aqi)) continue;
    if (aqi > bestAqi) {
      bestAqi = aqi;
      best = entry as Record<string, unknown>;
    }
  }
  if (!best) return null;

  const category =
    best.Category && typeof best.Category === "object"
      ? String((best.Category as Record<string, unknown>).Name ?? categoryForAqi(bestAqi))
      : categoryForAqi(bestAqi);
  const pollutant =
    typeof best.ParameterName === "string" ? best.ParameterName : null;
  const dateObserved =
    typeof best.DateObserved === "string" ? best.DateObserved : null;
  const hourObserved = Number(best.HourObserved);
  const observedAt =
    dateObserved && Number.isFinite(hourObserved)
      ? `${dateObserved}T${String(hourObserved).padStart(2, "0")}:00:00`
      : null;

  return { aqi: bestAqi, category, pollutant, observedAt, source: "airnow" };
}

export function normalizeWaqiPayload(raw: unknown): AqiPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (body.status !== "ok" || !body.data || typeof body.data !== "object") {
    return null;
  }

  const data = body.data as Record<string, unknown>;
  const aqi = Number(data.aqi);
  if (!Number.isFinite(aqi)) return null;

  const pollutant = typeof data.dominentpol === "string" ? data.dominentpol : null;
  const time = data.time;
  const observedAt =
    time && typeof time === "object" && typeof (time as Record<string, unknown>).iso === "string"
      ? ((time as Record<string, unknown>).iso as string)
      : null;

  return { aqi, category: categoryForAqi(aqi), pollutant, observedAt, source: "waqi" };
}

function aqiCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function degradedAqiResponse(
  corsHeaders: Record<string, string>,
  reason: "configuration_missing" | "upstream_error",
): Response {
  return new Response(
    JSON.stringify({
      aqi: null,
      category: null,
      pollutant: null,
      observedAt: null,
      source: "none",
      _meta: { fallback: true, reason },
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

function aqiOkResponse(
  payload: AqiPayload,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "s-maxage=900, stale-while-revalidate=180",
    },
  });
}

export async function handleAtmosAqi(request: Request): Promise<Response> {
  const corsHeaders = aqiCorsHeaders();

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "atmos/aqi", 20, 60);
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

  const airnowKey = process.env.AIRNOW_API_KEY;
  const waqiToken = process.env.WAQI_TOKEN;

  if (!airnowKey && !waqiToken) {
    return degradedAqiResponse(corsHeaders, "configuration_missing");
  }

  const fetchHeaders = { Accept: "application/json", "User-Agent": USER_AGENT };

  try {
    if (airnowKey) {
      const airnowUrl = `${AIRNOW_URL}?format=application/json&latitude=${latLon.lat}&longitude=${latLon.lon}&distance=75&API_KEY=${encodeURIComponent(airnowKey)}`;
      const response = await fetch(airnowUrl, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: fetchHeaders,
      });
      if (response.ok) {
        const payload = normalizeAirNowPayload(await response.json());
        if (payload) return aqiOkResponse(payload, corsHeaders);
      } else {
        console.error(`AirNow upstream returned ${response.status}`);
      }
    }

    if (waqiToken) {
      const waqiUrl = `${WAQI_URL}/geo:${latLon.lat};${latLon.lon}/?token=${encodeURIComponent(waqiToken)}`;
      const response = await fetch(waqiUrl, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: fetchHeaders,
      });
      if (response.ok) {
        const payload = normalizeWaqiPayload(await response.json());
        if (payload) return aqiOkResponse(payload, corsHeaders);
      } else {
        console.error(`WAQI upstream returned ${response.status}`);
      }
    }

    return degradedAqiResponse(corsHeaders, "upstream_error");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`AQI fetch failed: ${message}`);
    return degradedAqiResponse(corsHeaders, "upstream_error");
  }
}

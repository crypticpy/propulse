/**
 * Vercel Edge Function: NOAA CO-OPS Tide Predictions Proxy
 * Fetches 48h tide predictions (hi/lo events + a decimated curve) for a
 * station id, or the nearest tide-prediction station to a lat/lon.
 *
 * Source: https://api.tidesandcurrents.noaa.gov/api/prod/datagetter
 * Station metadata (cached in module memory, long TTL):
 *   https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions
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

const COOPS_DATAGETTER_URL =
  "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
const COOPS_STATIONS_URL =
  "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions";
const STATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CoopsStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface TidePoint {
  time: string;
  heightM: number;
  type?: "H" | "L";
}

/** Validate a NOAA station id: digits only, plausible length. */
export function parseStationParam(raw: string | null): string | null {
  if (!raw) return null;
  return /^\d{4,9}$/.test(raw) ? raw : null;
}

/** Parse the CO-OPS metadata payload down to the fields we need. */
export function parseStationList(raw: unknown): CoopsStation[] {
  if (!raw || typeof raw !== "object") return [];
  const stations = (raw as Record<string, unknown>).stations;
  if (!Array.isArray(stations)) return [];

  const result: CoopsStation[] = [];
  for (const entry of stations) {
    if (!entry || typeof entry !== "object") continue;
    const { id, name, lat, lng } = entry as Record<string, unknown>;
    if (typeof id !== "string" && typeof id !== "number") continue;
    if (typeof name !== "string") continue;
    if (lat == null || lng == null) continue;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) continue;
    result.push({ id: String(id), name, lat: latNum, lng: lngNum });
  }
  return result;
}

/** Great-circle distance in km (haversine). */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

/** Nearest station to a lat/lon from an already-fetched station list. */
export function findNearestStation(
  stations: CoopsStation[],
  lat: number,
  lon: number,
): { station: CoopsStation; distanceKm: number } | null {
  let best: { station: CoopsStation; distanceKm: number } | null = null;
  for (const station of stations) {
    const distanceKm = haversineKm(lat, lon, station.lat, station.lng);
    if (!best || distanceKm < best.distanceKm) {
      best = { station, distanceKm };
    }
  }
  return best;
}

/** Reduce a dense curve to a chart-friendly point count, evenly strided. */
export function decimateCurve<T>(points: T[], maxPoints = 48): T[] {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % stride === 0);
}

/** Parse a CO-OPS `datagetter` predictions response. */
export function parsePredictions(raw: unknown): TidePoint[] {
  if (!raw || typeof raw !== "object") return [];
  const predictions = (raw as Record<string, unknown>).predictions;
  if (!Array.isArray(predictions)) return [];

  const points: TidePoint[] = [];
  for (const entry of predictions) {
    if (!entry || typeof entry !== "object") continue;
    const { t, v, type } = entry as Record<string, unknown>;
    if (typeof t !== "string" || typeof v !== "string") continue;
    const heightM = Number(v);
    if (!Number.isFinite(heightM)) continue;
    const point: TidePoint = { time: t, heightM };
    if (type === "H" || type === "L") point.type = type;
    points.push(point);
  }
  return points;
}

let stationCache: { stations: CoopsStation[]; fetchedAt: number } | null =
  null;

/** Fetch (and long-TTL-cache) the CO-OPS tide-prediction station list. */
async function getStationList(): Promise<CoopsStation[]> {
  const now = Date.now();
  if (stationCache && now - stationCache.fetchedAt < STATION_CACHE_TTL_MS) {
    return stationCache.stations;
  }

  try {
    const response = await fetch(COOPS_STATIONS_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!response.ok) throw new Error(`stations.json returned ${response.status}`);

    const stations = parseStationList(await response.json());
    stationCache = { stations, fetchedAt: now };
    return stations;
  } catch (error) {
    if (stationCache) return stationCache.stations; // serve stale over nothing
    throw error;
  }
}

function buildPredictionsUrl(stationId: string, interval: "hilo" | "30"): string {
  const params = new URLSearchParams({
    product: "predictions",
    application: "propulse",
    station: stationId,
    datum: "MLLW",
    time_zone: "gmt",
    units: "metric",
    format: "json",
    date: "today",
    range: "48",
    interval,
  });
  return `${COOPS_DATAGETTER_URL}?${params.toString()}`;
}

function tidesCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function fallbackTidesResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      station: null,
      units: "metric",
      hilo: [],
      curve: [],
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

export async function handleAtmosTides(request: Request): Promise<Response> {
  const corsHeaders = tidesCorsHeaders();

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "atmos/tides", 20, 60);
  if (limited) return limited;

  const url = new URL(request.url);
  const stationParam = parseStationParam(url.searchParams.get("station"));
  const latLon = parseLatLon(
    url.searchParams.get("lat"),
    url.searchParams.get("lon"),
  );

  if (!stationParam && !latLon) {
    return new Response(
      JSON.stringify({
        error:
          "Provide a numeric 'station' id, or both 'lat' and 'lon' in valid ranges.",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const stations = await getStationList();

    let stationId = stationParam;
    let distanceKm: number | undefined;
    if (!stationId && latLon) {
      const nearest = findNearestStation(stations, latLon.lat, latLon.lon);
      if (!nearest) return fallbackTidesResponse(corsHeaders);
      stationId = nearest.station.id;
      distanceKm = nearest.distanceKm;
    }
    if (!stationId) return fallbackTidesResponse(corsHeaders);

    const resolved = stations.find((s) => s.id === stationId) ?? null;
    const fetchHeaders = {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };

    const [hiloRes, curveRes] = await Promise.all([
      fetch(buildPredictionsUrl(stationId, "hilo"), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: fetchHeaders,
      }),
      fetch(buildPredictionsUrl(stationId, "30"), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: fetchHeaders,
      }),
    ]);

    if (!hiloRes.ok && !curveRes.ok) {
      return fallbackTidesResponse(corsHeaders);
    }

    const hilo = hiloRes.ok ? parsePredictions(await hiloRes.json()) : [];
    const curveFull = curveRes.ok ? parsePredictions(await curveRes.json()) : [];

    const payload = {
      station: {
        id: stationId,
        name: resolved?.name ?? null,
        lat: resolved?.lat ?? null,
        lon: resolved?.lng ?? null,
        distanceKm:
          distanceKm !== undefined ? Math.round(distanceKm * 10) / 10 : null,
      },
      units: "metric",
      hilo,
      curve: decimateCurve(curveFull),
    };

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
    console.error(`Tides fetch failed: ${message}`);
    return fallbackTidesResponse(corsHeaders);
  }
}

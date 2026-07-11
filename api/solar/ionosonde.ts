/**
 * Vercel Edge Function: Ionosonde Data Proxy
 * Fetches real-time ionosonde measurements from prop.kc2g.com
 *
 * Source: https://prop.kc2g.com/api/
 * - stations.json: List of ionosonde stations
 * - muf.json: Current MUF/foF2 readings
 *
 * Cache: 15 minutes (matches data update frequency)
 *
 * Security features:
 * - CORS restricted to allowed origin (no wildcards)
 * - Request timeout handling (10 seconds)
 * - Standardized error responses with error codes
 */

export const config = {
  runtime: "edge",
};

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10000;

/** Cache duration in seconds (15 minutes) */
const CACHE_DURATION = 900;

/** Stale-while-revalidate duration in seconds (30 minutes) */
const STALE_DURATION = 1800;

/**
 * Get the allowed CORS origin based on environment
 * Never returns wildcard "*" to prevent security issues
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.app";
}

/**
 * Standard CORS headers for all responses
 */
function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/**
 * Create a standardized error response with error code
 */
function createErrorResponse(
  error: string,
  code: string,
  status: number,
  cacheControl: string = "no-cache",
): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl,
      ...getCorsHeaders(),
    },
  });
}

/** prop.kc2g.com API URLs */
const KC2G_STATIONS_URL = "https://prop.kc2g.com/api/stations.json";
const KC2G_MUF_URL = "https://prop.kc2g.com/api/muf.json";

/**
 * Station data from prop.kc2g.com
 */
interface KC2GStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  ursi?: string;
}

/**
 * MUF reading from prop.kc2g.com
 */
interface KC2GMUFReading {
  station: string;
  time: string;
  cs: number; // Confidence score
  fof2?: number;
  mufd?: number;
  muf?: number;
  hmf2?: number;
}

/**
 * Standardized ionosonde reading for our API
 */
export interface IonosondeReading {
  id: string;
  name: string;
  lat: number;
  lon: number;
  foF2: number; // Critical frequency in MHz
  muf3000: number; // MUF for 3000km path
  hmF2?: number; // F2 layer height in km
  confidence: number; // Data confidence (0-100)
  timestamp: string;
}

/**
 * Combined response with stations and readings
 */
interface IonosondeResponse {
  stations: IonosondeReading[];
  lastUpdate: string;
  source: string;
}

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(),
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Set up request timeout with AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // Fetch both stations and MUF data in parallel
    const [stationsResponse, mufResponse] = await Promise.all([
      fetch(KC2G_STATIONS_URL, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Propulse/1.0 (Ham Radio Propagation App)",
        },
      }),
      fetch(KC2G_MUF_URL, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Propulse/1.0 (Ham Radio Propagation App)",
        },
      }),
    ]);

    clearTimeout(timeoutId);

    if (!stationsResponse.ok) {
      return createErrorResponse(
        `KC2G stations API returned ${stationsResponse.status}: ${stationsResponse.statusText}`,
        "UPSTREAM_ERROR",
        stationsResponse.status,
      );
    }

    if (!mufResponse.ok) {
      return createErrorResponse(
        `KC2G MUF API returned ${mufResponse.status}: ${mufResponse.statusText}`,
        "UPSTREAM_ERROR",
        mufResponse.status,
      );
    }

    const stations: KC2GStation[] = await stationsResponse.json();
    const mufReadings: KC2GMUFReading[] = await mufResponse.json();

    // Create a map of station data for quick lookup
    const stationMap = new Map<string, KC2GStation>();
    for (const station of stations) {
      stationMap.set(station.id, station);
    }

    // Combine station info with MUF readings
    const readings: IonosondeReading[] = [];
    const now = new Date().toISOString();

    for (const reading of mufReadings) {
      const station = stationMap.get(reading.station);
      if (!station) continue;

      // Skip readings without foF2 data
      if (reading.fof2 === undefined || reading.fof2 === null) continue;

      // Calculate MUF for 3000km path if not provided
      // M(3000)F2 factor is typically 2.5-3.5, use 3.0 as default
      const muf3000 = reading.mufd ?? reading.muf ?? reading.fof2 * 3.0;

      readings.push({
        id: station.id,
        name: station.name,
        lat: station.lat,
        lon: station.lon,
        foF2: reading.fof2,
        muf3000: muf3000,
        hmF2: reading.hmf2,
        confidence: reading.cs * 100, // Convert 0-1 to 0-100
        timestamp: reading.time || now,
      });
    }

    const response: IonosondeResponse = {
      stations: readings,
      lastUpdate: now,
      source: "prop.kc2g.com",
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `s-maxage=${CACHE_DURATION}, stale-while-revalidate=${STALE_DURATION}`,
        ...getCorsHeaders(),
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout specifically
    if (error instanceof Error && error.name === "AbortError") {
      return createErrorResponse(
        "Request to ionosonde API timed out",
        "REQUEST_TIMEOUT",
        504,
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return createErrorResponse(
      `Failed to fetch ionosonde data: ${message}`,
      "INTERNAL_ERROR",
      500,
    );
  }
}

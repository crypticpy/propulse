/**
 * Vercel Edge Function: Magnetometer Proxy
 * Fetches solar wind magnetometer data from NOAA SWPC to avoid CORS restrictions
 *
 * Primary source: https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json
 * Fallback source: https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json
 * Returns Bz (IMF Z-component), By, and Bt (total field) values
 * Cache: 5 minutes with 1 minute stale-while-revalidate
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

/**
 * Get the allowed CORS origin based on environment
 * Never returns wildcard "*" to prevent security issues
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const NOAA_URL = "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json";

const NOAA_FALLBACK_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";

/**
 * Raw NOAA magnetometer response format
 * Array of arrays where first row is headers:
 * ["time_tag", "bx_gsm", "by_gsm", "bz_gsm", "lon_gsm", "lat_gsm", "bt"]
 */
type NOAAMagnetometerResponse = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
][];

/**
 * NOAA RTSW 1-minute magnetometer format (array of objects).
 * Includes bz_gsm/by_gsm/bt plus many additional fields.
 */
type NOAARTSWMagResponse = Array<{
  time_tag: string;
  bz_gsm?: number | null;
  by_gsm?: number | null;
  bt?: number | null;
}>;

/**
 * Processed magnetometer data point
 */
interface MagnetometerDataPoint {
  time_tag: string;
  bz_gsm: number | null;
  by_gsm: number | null;
  bt: number | null;
}

function toFiniteOrNull(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `NOAA API returned ${response.status}: ${response.statusText}`,
    );
  }

  return response.json();
}

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "solar/magnetometer", 30, 60);
  if (limited) return limited;

  try {
    let processedData: MagnetometerDataPoint[] = [];

    try {
      const rtsw = (await fetchJson(NOAA_URL)) as NOAARTSWMagResponse;
      if (Array.isArray(rtsw) && rtsw.length > 0) {
        processedData = rtsw.map((row) => ({
          time_tag: row.time_tag,
          by_gsm: toFiniteOrNull(row.by_gsm),
          bz_gsm: toFiniteOrNull(row.bz_gsm),
          bt: toFiniteOrNull(row.bt),
        }));
      }
    } catch {
      // ignore and try fallback
    }

    // Fallback to product feed (array-of-arrays). This feed can occasionally return header-only.
    if (processedData.length === 0) {
      const rawData = (await fetchJson(
        NOAA_FALLBACK_URL,
      )) as NOAAMagnetometerResponse;
      processedData = rawData.slice(1).map((row) => ({
        time_tag: row[0],
        by_gsm:
          row[2] !== null && row[2] !== ""
            ? toFiniteOrNull(parseFloat(row[2]))
            : null,
        bz_gsm:
          row[3] !== null && row[3] !== ""
            ? toFiniteOrNull(parseFloat(row[3]))
            : null,
        bt:
          row[6] !== null && row[6] !== ""
            ? toFiniteOrNull(parseFloat(row[6]))
            : null,
      }));
    }

    // Treat empty/invalid data as an upstream failure so clients keep their last-good cache.
    if (processedData.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No magnetometer data available from NOAA",
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    return new Response(JSON.stringify(processedData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to fetch magnetometer data: ${message}`,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }
}

/**
 * Vercel Edge Function: D-Region Absorption Prediction (DRAP) Proxy
 * Fetches DRAP global frequency data from NOAA SWPC text format
 * and parses it into structured JSON.
 *
 * Source: https://services.swpc.noaa.gov/text/drap_global_frequencies.txt
 * (The old JSON endpoint was removed by NOAA)
 *
 * Cache: 15 minutes with 5 minute stale-while-revalidate
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

const NOAA_URL =
  "https://services.swpc.noaa.gov/text/drap_global_frequencies.txt";

/**
 * Parse NOAA DRAP text table into structured JSON.
 *
 * Format:
 * - Comment lines start with #
 * - Separator line starts with ---
 * - First data line is longitude header
 * - Subsequent lines: "lat | val val val ..."
 */
function parseDRAPText(text: string): {
  observation_time: string;
  forecast_time: string;
  frequencies: number[][];
  latitudes: number[];
  longitudes: number[];
} {
  const lines = text.split("\n");

  let observationTime = new Date().toISOString();
  for (const line of lines) {
    if (line.includes("Product Valid At")) {
      const match = line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*UTC/);
      if (match) {
        observationTime = new Date(match[1] + "Z").toISOString();
      }
      break;
    }
  }

  let longitudes: number[] = [];
  const latitudes: number[] = [];
  const frequencies: number[][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.startsWith("-") || trimmed === "")
      continue;

    // Longitude header: first non-comment, non-separator line without "|"
    if (longitudes.length === 0 && !trimmed.includes("|")) {
      longitudes = trimmed.split(/\s+/).map(Number).filter(Number.isFinite);
      continue;
    }

    // Data rows: "lat | val val val ..."
    if (trimmed.includes("|")) {
      const [latStr, valsStr] = trimmed.split("|");
      const lat = parseFloat(latStr.trim());
      if (!Number.isFinite(lat)) continue;
      const vals = valsStr.trim().split(/\s+/).map(Number);
      latitudes.push(lat);
      frequencies.push(vals);
    }
  }

  return {
    observation_time: observationTime,
    forecast_time: observationTime,
    frequencies,
    latitudes,
    longitudes,
  };
}

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "solar/drap", 30, 60);
  if (limited) return limited;

  try {
    const response = await fetch(NOAA_URL, {
      headers: {
        Accept: "text/plain",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `NOAA API returned ${response.status}: ${response.statusText}`,
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    const text = await response.text();
    const data = parseDRAPText(text);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=900, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to fetch DRAP data: ${message}`,
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

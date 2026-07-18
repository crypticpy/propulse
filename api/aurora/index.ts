/**
 * Vercel Edge Function: Aurora Forecast Proxy
 * Fetches NOAA OVATION aurora probability model data to avoid CORS.
 *
 * Source: https://services.swpc.noaa.gov/json/ovation_aurora_latest.json
 * Cache: 30 minutes with 10 minute stale-while-revalidate
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

const AURORA_URL =
  "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";

const MIN_RENDERED_PROBABILITY = 10;

interface CompactAuroraPayload {
  "Observation Time": string;
  "Forecast Time": string;
  coordinates: [number, number, number][];
}

export function compactAuroraPayload(data: unknown): CompactAuroraPayload {
  const raw = data && typeof data === "object" ? data : {};
  const record = raw as Record<string, unknown>;
  const coordinates = Array.isArray(record.coordinates)
    ? record.coordinates.filter(
        (coordinate): coordinate is [number, number, number] =>
          Array.isArray(coordinate) &&
          coordinate.length === 3 &&
          coordinate.every(
            (value) => typeof value === "number" && Number.isFinite(value),
          ) &&
          coordinate[2] >= MIN_RENDERED_PROBABILITY,
      )
    : [];

  return {
    "Observation Time": String(record["Observation Time"] ?? ""),
    "Forecast Time": String(record["Forecast Time"] ?? ""),
    coordinates,
  };
}

function fallbackResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      "Observation Time": "",
      "Forecast Time": "",
      coordinates: [],
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

export default async function handler(request: Request): Promise<Response> {
  const origin = getAllowedOrigin();
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const limited = applyRateLimit(request, "aurora", 5, 60);
  if (limited) return limited;

  try {
    const response = await fetch(AURORA_URL, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });

    if (!response.ok) {
      return fallbackResponse(corsHeaders);
    }

    const data = compactAuroraPayload(await response.json());

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=1800, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Aurora fetch failed: ${message}`);
    return fallbackResponse(corsHeaders);
  }
}

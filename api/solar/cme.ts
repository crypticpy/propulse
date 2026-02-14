/**
 * Vercel Edge Function: CME Analysis Proxy
 * Fetches CME (Coronal Mass Ejection) analysis data from NASA DONKI API
 *
 * Source: https://api.nasa.gov/DONKI/CMEAnalysis
 * Cache: 1 hour with 15 minute stale-while-revalidate
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

/**
 * Build the NASA DONKI CME Analysis URL with a 30-day lookback window
 */
function buildCmeUrl(): string {
  const apiKey = process.env.NASA_API_KEY || "DEMO_KEY";
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return (
    `https://api.nasa.gov/DONKI/CMEAnalysis` +
    `?startDate=${fmt(startDate)}` +
    `&endDate=${fmt(endDate)}` +
    `&mostAccurateOnly=true` +
    `&speed500=true` +
    `&halfAngle30=true` +
    `&catalog=ALL` +
    `&api_key=${apiKey}`
  );
}

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "solar/cme", 20, 60);
  if (limited) return limited;

  try {
    const response = await fetch(buildCmeUrl(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Solar Dashboard)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `NASA DONKI API returned ${response.status}: ${response.statusText}`,
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

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=900",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to fetch CME analysis data: ${message}`,
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

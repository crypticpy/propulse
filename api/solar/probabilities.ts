/**
 * Vercel Edge Function: Solar Probabilities Proxy
 * Fetches solar event probability forecasts from NOAA SWPC to avoid CORS restrictions
 *
 * Source: https://services.swpc.noaa.gov/json/solar_probabilities.json
 * Cache: 6 hours with 1 day stale-while-revalidate
 */

export const config = {
  runtime: "edge",
};

const NOAA_URL = "https://services.swpc.noaa.gov/json/solar_probabilities.json";

export default async function handler(_request: Request): Promise<Response> {
  try {
    const response = await fetch(NOAA_URL, {
      headers: {
        Accept: "application/json",
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
          },
        },
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to fetch solar probabilities data: ${message}`,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      },
    );
  }
}

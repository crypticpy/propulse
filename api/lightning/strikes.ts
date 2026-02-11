/**
 * Lightning Strike API Proxy - Vercel Edge Function
 *
 * Proxies requests to Blitzortung lightning strike data to avoid CORS issues
 * Returns recent global lightning strikes as a clean JSON array
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
 * Raw strike entry from Blitzortung API
 */
interface BlitzortungStrike {
  lat: number;
  lon: number;
  time: number; // nanosecond timestamp
  sig?: number; // signal strength (may represent kA)
}

export default async function handler(req: Request) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const limited = applyRateLimit(req, "lightning/strikes", 20, 60);
  if (limited) return limited;

  try {
    const apiUrl = "https://map.blitzortung.org/GEOjson/GEOjson_strikes_4.json";

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Propulse/1.0 (Ham Radio Toolset)",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Blitzortung API error", strikes: [] }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": getAllowedOrigin(),
          },
        },
      );
    }

    const data = await response.json();

    // Blitzortung GeoJSON: features[].geometry.coordinates = [lon, lat]
    // features[].properties may contain time and sig
    let strikes: {
      lat: number;
      lon: number;
      time: number;
      current_kA: number;
    }[] = [];

    if (data && Array.isArray(data.features)) {
      strikes = data.features
        .filter(
          (f: { geometry?: { coordinates?: number[] } }) =>
            f.geometry?.coordinates &&
            Array.isArray(f.geometry.coordinates) &&
            f.geometry.coordinates.length >= 2,
        )
        .map(
          (f: {
            geometry: { coordinates: number[] };
            properties?: { time?: number; sig?: number };
          }) => ({
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            time: f.properties?.time ?? Date.now(),
            current_kA: f.properties?.sig ?? 0,
          }),
        );
    } else if (Array.isArray(data)) {
      // Fallback: plain array of strike objects
      strikes = (data as BlitzortungStrike[]).map((s) => ({
        lat: s.lat,
        lon: s.lon,
        time:
          s.time > 1e15
            ? Math.floor(s.time / 1e6) // nanoseconds to milliseconds
            : s.time > 1e12
              ? s.time // already milliseconds
              : s.time * 1000, // seconds to milliseconds
        current_kA: s.sig ?? 0,
      }));
    }

    // Cap strikes to prevent canvas performance issues during active storm seasons
    if (strikes.length > 5000) {
      strikes = strikes.slice(0, 5000);
    }

    return new Response(JSON.stringify({ strikes }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=30, stale-while-revalidate=15",
        "Access-Control-Allow-Origin": getAllowedOrigin(),
      },
    });
  } catch (error) {
    console.error("Lightning proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error", strikes: [] }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
        },
      },
    );
  }
}

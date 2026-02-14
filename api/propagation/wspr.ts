/**
 * Vercel Edge Function: WSPR Spot Data
 *
 * Provides WSPR (Weak Signal Propagation Reporter) spot data for globe overlay.
 * Uses a statistical model to generate realistic WSPR spot distributions
 * based on band, time of day, and propagation conditions.
 *
 * WSPRnet does not provide a clean JSON API, so this endpoint generates
 * structured spot data based on known WSPR propagation patterns.
 *
 * Cache: 5 minutes with 2 minute stale-while-revalidate
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

// ─── WSPR Station Database ──────────────────────────────────────────────────

interface WSPRStation {
  callsign: string;
  grid: string;
  lat: number;
  lon: number;
}

/**
 * Representative WSPR stations distributed globally.
 * These are well-known WSPR beacon operators and active stations.
 */
const WSPR_STATIONS: WSPRStation[] = [
  { callsign: "W3HH", grid: "FM19", lat: 39.0, lon: -77.0 },
  { callsign: "WA2TP", grid: "FN20", lat: 40.5, lon: -74.0 },
  { callsign: "K1JT", grid: "FN20", lat: 40.4, lon: -74.7 },
  { callsign: "VK2RG", grid: "QF56", lat: -33.8, lon: 151.2 },
  { callsign: "VK7BO", grid: "QE37", lat: -42.9, lon: 147.3 },
  { callsign: "G8JNJ", grid: "IO91", lat: 51.5, lon: -0.1 },
  { callsign: "PA0O", grid: "JO21", lat: 51.4, lon: 4.3 },
  { callsign: "DL0NOT", grid: "JO51", lat: 51.0, lon: 11.0 },
  { callsign: "JA1BRK", grid: "PM95", lat: 35.7, lon: 139.7 },
  { callsign: "JH1NBN", grid: "PM95", lat: 35.5, lon: 139.5 },
  { callsign: "ZL2IFB", grid: "RE78", lat: -41.3, lon: 174.8 },
  { callsign: "LU8EKC", grid: "GF05", lat: -34.6, lon: -58.4 },
  { callsign: "PY2RN", grid: "GG66", lat: -23.6, lon: -46.6 },
  { callsign: "VU2PTT", grid: "MK82", lat: 12.97, lon: 77.56 },
  { callsign: "ZS6KTS", grid: "KG44", lat: -25.8, lon: 28.2 },
  { callsign: "5Z4B", grid: "KI88", lat: -1.3, lon: 36.8 },
  { callsign: "SV8RV", grid: "KM17", lat: 37.6, lon: 21.5 },
  { callsign: "OH2GAX", grid: "KP20", lat: 60.2, lon: 25.0 },
  { callsign: "SM0EPX", grid: "JO99", lat: 59.3, lon: 18.1 },
  { callsign: "VE3GHN", grid: "FN03", lat: 43.7, lon: -79.4 },
  { callsign: "W6LVP", grid: "DM04", lat: 34.1, lon: -118.3 },
  { callsign: "KK6PR", grid: "CM97", lat: 37.8, lon: -122.4 },
  { callsign: "KH6HI", grid: "BL11", lat: 21.3, lon: -157.8 },
  { callsign: "HL2WA", grid: "PM37", lat: 37.5, lon: 127.0 },
];

// ─── WSPR Band Frequencies ──────────────────────────────────────────────────

const WSPR_BANDS: Record<string, number> = {
  "160m": 1.8366,
  "80m": 3.5926,
  "60m": 5.2872,
  "40m": 7.0386,
  "30m": 10.1387,
  "20m": 14.0956,
  "17m": 18.1046,
  "15m": 21.0946,
  "12m": 24.9246,
  "10m": 28.1246,
  "6m": 50.293,
};

// ─── Spot Generation ────────────────────────────────────────────────────────

/**
 * Simple seeded PRNG (Mulberry32) for deterministic spot generation.
 * Same seed produces the same spots within a time window.
 */
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Calculate MUF factor based on time of day and distance.
 * Higher frequency bands propagate better during daylight hours.
 */
function getDaylightFactor(utcHour: number, frequencyMHz: number): number {
  // Solar peak around 14:00 UTC (rough average for mid-latitudes)
  const hourAngle = ((utcHour - 14) / 12) * Math.PI;
  const solarFactor = 0.4 + 0.6 * Math.cos(hourAngle);

  // Low bands (160m-40m) work better at night
  if (frequencyMHz < 10) {
    return 0.5 + 0.5 * (1 - solarFactor);
  }
  // High bands (20m-10m) work better during the day
  return 0.3 + 0.7 * solarFactor;
}

/**
 * Estimate distance between two lat/lon points (Haversine, km).
 */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface WSPRSpotResponse {
  callsign: string;
  grid: string;
  frequency: number;
  snr: number;
  drift: number;
  distance: number;
  timestamp: string;
  txLat: number;
  txLon: number;
  rxCallsign: string;
  rxGrid: string;
  rxLat: number;
  rxLon: number;
}

function generateSpots(band: string, now: Date): WSPRSpotResponse[] {
  const freq = WSPR_BANDS[band];
  if (!freq) return [];

  const utcHour = now.getUTCHours();
  const minute5 = Math.floor(now.getUTCMinutes() / 5);
  const seed =
    now.getUTCFullYear() * 1000000 +
    (now.getUTCMonth() + 1) * 10000 +
    now.getUTCDate() * 100 +
    utcHour * 10 +
    minute5;
  const rng = mulberry32(seed + freq * 1000);

  const daylightFactor = getDaylightFactor(utcHour, freq);
  const spotCount = Math.floor(8 + rng() * 40 * daylightFactor);
  const spots: WSPRSpotResponse[] = [];

  for (let i = 0; i < spotCount && i < 200; i++) {
    const txIdx = Math.floor(rng() * WSPR_STATIONS.length);
    let rxIdx = Math.floor(rng() * WSPR_STATIONS.length);
    if (rxIdx === txIdx) rxIdx = (rxIdx + 1) % WSPR_STATIONS.length;

    const tx = WSPR_STATIONS[txIdx];
    const rx = WSPR_STATIONS[rxIdx];
    const distance = haversineKm(tx.lat, tx.lon, rx.lat, rx.lon);

    // Skip unrealistic paths for band
    if (freq < 5 && distance > 8000) continue; // Low bands: max ~8000 km
    if (freq > 24 && distance > 3000 && rng() > 0.3) continue; // 10m: mostly shorter

    // SNR: inversely related to distance, with noise
    const distanceFactor = Math.max(0, 1 - distance / 20000);
    const snr = Math.round(-30 + 35 * distanceFactor + (rng() - 0.5) * 10);

    // Drift: typically -1 to +1 Hz
    const drift = Math.round((rng() - 0.5) * 4);

    // Timestamp within last 5 minutes
    const offsetMs = Math.floor(rng() * 5 * 60 * 1000);
    const spotTime = new Date(now.getTime() - offsetMs);

    spots.push({
      callsign: tx.callsign,
      grid: tx.grid,
      frequency: freq,
      snr,
      drift,
      distance: Math.round(distance),
      timestamp: spotTime.toISOString(),
      txLat: tx.lat,
      txLon: tx.lon,
      rxCallsign: rx.callsign,
      rxGrid: rx.grid,
      rxLat: rx.lat,
      rxLon: rx.lon,
    });
  }

  return spots;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "propagation/wspr", 10, 60);
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const band = url.searchParams.get("band") || "20m";
    const now = new Date();

    // Generate spots for the requested band, or all bands
    let spots: WSPRSpotResponse[];
    if (band === "all") {
      spots = [];
      for (const b of Object.keys(WSPR_BANDS)) {
        spots.push(...generateSpots(b, now));
      }
      // Limit total when fetching all bands
      spots = spots.slice(0, 200);
    } else {
      spots = generateSpots(band, now);
    }

    return new Response(
      JSON.stringify({
        band,
        count: spots.length,
        timestamp: now.toISOString(),
        spots,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "s-maxage=300, stale-while-revalidate=120",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to generate WSPR spot data: ${message}`,
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

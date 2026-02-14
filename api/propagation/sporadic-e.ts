/**
 * Vercel Edge Function: Sporadic E Layer Probability Model
 *
 * Provides a statistical model of Sporadic E (Es) probability based on
 * latitude, season, and time of day. Real ionosonde data from GIRO DIDBase
 * is complex to integrate, so this uses empirical models from published
 * research on Es occurrence patterns.
 *
 * Key Es characteristics modeled:
 * - Summer peak: May-Aug (NH), Nov-Feb (SH)
 * - Midday peak: 10:00-14:00 local solar time
 * - Mid-latitude preference: 30-50 degrees
 * - Secondary nighttime peak (weaker, from wind shear)
 *
 * References:
 * - Whitehead (1989): "Recent work on mid-latitude and equatorial Es"
 * - Smith (1957): "Worldwide occurrence of sporadic E"
 * - Haldoupis (2011): "A tutorial review on sporadic E layers"
 *
 * Cache: 1 hour with 10 minute stale-while-revalidate
 */

import { applyRateLimit } from "../_lib/rateLimit";

export const config = {
  runtime: "edge",
};

/**
 * Get the allowed CORS origin based on environment
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface SporadicEGridPoint {
  lat: number;
  lon: number;
  probability: number;
  estimatedFoEs: number;
}

// ─── Model ──────────────────────────────────────────────────────────────────

/**
 * Calculate Sporadic E probability for a given location and time.
 *
 * The model uses sinusoidal approximations for:
 * 1. Seasonal variation: peaks in local summer
 * 2. Diurnal variation: peaks around local noon, secondary peak at night
 * 3. Latitude preference: peaks at mid-latitudes (30-50 deg)
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param month - Month (1-12)
 * @param utcHour - UTC hour (0-23)
 * @returns Probability (0-1) and estimated foEs in MHz
 */
function calculateEsProbability(
  lat: number,
  lon: number,
  month: number,
  utcHour: number,
): { probability: number; foEs: number } {
  const absLat = Math.abs(lat);

  // 1. Latitude factor: mid-latitudes dominate
  //    Peak at ~40 degrees, significant from 25-60 degrees
  //    Near-equatorial Es is different (equatorial Es) -- lower probability
  //    Polar Es is rare
  let latFactor: number;
  if (absLat < 10) {
    // Equatorial: some Es but less than mid-lat
    latFactor = 0.2;
  } else if (absLat < 25) {
    // Subtropics: transitional
    latFactor = 0.2 + 0.6 * ((absLat - 10) / 15);
  } else if (absLat < 55) {
    // Mid-latitudes: peak zone
    // Peak around 40 degrees
    const distFrom40 = Math.abs(absLat - 40);
    latFactor = 0.8 + 0.2 * Math.cos((distFrom40 / 15) * (Math.PI / 2));
  } else if (absLat < 70) {
    // High latitude: declining
    latFactor = 0.8 * (1 - (absLat - 55) / 15);
  } else {
    // Polar: very low
    latFactor = 0.1;
  }

  // 2. Seasonal factor: peaks in local summer
  //    NH summer: June peak (month 6)
  //    SH summer: December peak (month 12)
  const isNorthern = lat >= 0;
  const peakMonth = isNorthern ? 6 : 12;
  const monthDiff = Math.abs(month - peakMonth);
  const normalizedMonthDiff = monthDiff > 6 ? 12 - monthDiff : monthDiff;
  // Strong seasonal variation: summer probability ~3x winter
  const seasonFactor =
    0.2 + 0.8 * Math.cos((normalizedMonthDiff / 6) * Math.PI);
  const clampedSeason = Math.max(0, seasonFactor);

  // 3. Diurnal factor: primary peak at local noon, secondary nighttime peak
  const localSolarHour = (((utcHour + lon / 15) % 24) + 24) % 24;

  // Primary daytime peak centered at 12:00 LST (broad, 08:00-16:00)
  const dayAngle = ((localSolarHour - 12) / 12) * Math.PI;
  const dayPeak = Math.max(0, Math.cos(dayAngle));

  // Secondary nighttime peak around 22:00-02:00 LST (wind shear mechanism)
  const nightAngle = ((localSolarHour - 0) / 12) * Math.PI;
  const nightPeak = Math.max(0, 0.3 * Math.cos(nightAngle));

  const diurnalFactor = Math.max(dayPeak, nightPeak);

  // 4. Combine factors
  const probability = Math.min(1.0, latFactor * clampedSeason * diurnalFactor);

  // 5. Estimated foEs: typically 3-12 MHz when Es is present
  //    Higher probability correlates with higher foEs
  //    Summer mid-latitude daytime can reach 10+ MHz (supports 6m openings)
  const foEs = probability > 0.05 ? 3.0 + 9.0 * probability : 0;

  return {
    probability: Math.round(probability * 1000) / 1000,
    foEs: Math.round(foEs * 100) / 100,
  };
}

/**
 * Generate a global grid of Es probability values.
 *
 * @param month - Month (1-12)
 * @param utcHour - UTC hour (0-23)
 * @param resolution - Grid spacing in degrees (default 10)
 * @returns Array of grid points with probability and foEs
 */
function generateEsGrid(
  month: number,
  utcHour: number,
  resolution: number = 10,
): SporadicEGridPoint[] {
  const grid: SporadicEGridPoint[] = [];

  for (let lat = -80; lat <= 80; lat += resolution) {
    for (let lon = -180; lon < 180; lon += resolution) {
      const { probability, foEs } = calculateEsProbability(
        lat,
        lon,
        month,
        utcHour,
      );

      // Only include points with meaningful probability
      if (probability >= 0.02) {
        grid.push({
          lat,
          lon,
          probability,
          estimatedFoEs: foEs,
        });
      }
    }
  }

  return grid;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "propagation/sporadic-e", 15, 60);
  if (limited) return limited;

  try {
    const url = new URL(request.url);

    // Optional parameters — defaults to current time
    const now = new Date();
    const month = parseInt(
      url.searchParams.get("month") || String(now.getUTCMonth() + 1),
      10,
    );
    const hour = parseInt(
      url.searchParams.get("hour") || String(now.getUTCHours()),
      10,
    );
    const resolution = parseInt(url.searchParams.get("resolution") || "10", 10);

    // Validate inputs
    const validMonth = Math.max(1, Math.min(12, month));
    const validHour = Math.max(0, Math.min(23, hour));
    const validResolution = Math.max(5, Math.min(30, resolution));

    const grid = generateEsGrid(validMonth, validHour, validResolution);

    return new Response(
      JSON.stringify({
        month: validMonth,
        hour: validHour,
        resolution: validResolution,
        timestamp: now.toISOString(),
        count: grid.length,
        regions: grid,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "s-maxage=3600, stale-while-revalidate=600",
          "Access-Control-Allow-Origin": getAllowedOrigin(),
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        error: `Failed to calculate sporadic E data: ${message}`,
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

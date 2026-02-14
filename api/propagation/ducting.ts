/**
 * Vercel Edge Function: Tropospheric Ducting Probability Model
 *
 * Provides a simplified tropospheric ducting probability model for globe
 * overlay rendering. Tropospheric ducting enables VHF/UHF propagation
 * over hundreds or thousands of km via temperature inversions in the
 * lower atmosphere (troposphere, 0-12 km).
 *
 * Ducting types modeled:
 * - **Surface duct**: Temperature inversion near ground level.
 *   Common over warm ocean surfaces, coastal areas at night.
 * - **Elevated duct**: Inversion layer at 500-2000m altitude.
 *   Common in subsidence areas (high pressure systems).
 * - **Evaporation duct**: Moisture gradient over warm ocean.
 *   Persistent over tropical/subtropical oceans, mainly affects >1 GHz.
 *
 * Key factors:
 * - Coastal/ocean regions: much higher probability
 * - Season: summer/autumn peak in temperate regions
 * - Time: evening/overnight for surface ducts
 * - High pressure systems: elevated duct formation
 *
 * References:
 * - ITU-R P.452 "Prediction procedure for the evaluation of interference
 *   between stations on the surface of the Earth"
 * - Bean & Dutton (1968): "Radio Meteorology"
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

interface DuctingGridPoint {
  lat: number;
  lon: number;
  probability: number;
  type: "surface" | "elevated" | "evaporation";
}

// ─── Geographic Helpers ─────────────────────────────────────────────────────

/**
 * Simplified coastal proximity indicator.
 * Uses a rough model: points near known coastal coordinates get higher values.
 *
 * This is intentionally simplified -- a production system would use a
 * land/sea mask dataset. We approximate by checking latitude bands and
 * well-known ocean regions.
 */
function getCoastalFactor(lat: number, lon: number): number {
  const absLat = Math.abs(lat);

  // Ocean areas: very high ducting potential
  // North Sea / English Channel (50-60N, -5 to 10E)
  if (absLat >= 48 && absLat <= 62 && lon >= -5 && lon <= 10) return 0.9;

  // Mediterranean (30-45N, -5 to 35E)
  if (lat >= 30 && lat <= 45 && lon >= -5 && lon <= 36) return 0.85;

  // Gulf of Mexico (18-30N, -98 to -80W)
  if (lat >= 18 && lat <= 30 && lon >= -98 && lon <= -80) return 0.8;

  // Persian Gulf (22-30N, 48-56E)
  if (lat >= 22 && lat <= 30 && lon >= 48 && lon <= 56) return 0.95;

  // Bay of Bengal (5-22N, 80-95E)
  if (lat >= 5 && lat <= 22 && lon >= 80 && lon <= 95) return 0.75;

  // South China Sea (0-22N, 100-120E)
  if (lat >= 0 && lat <= 22 && lon >= 100 && lon <= 120) return 0.7;

  // West coast of US (30-50N, -125 to -117W)
  if (lat >= 30 && lat <= 50 && lon >= -125 && lon <= -117) return 0.7;

  // East coast of US (25-45N, -80 to -70W)
  if (lat >= 25 && lat <= 45 && lon >= -80 && lon <= -70) return 0.75;

  // Tropical ocean belts (general)
  if (absLat < 30 && (lon < -20 || lon > 160 || (lon > 40 && lon < 100))) {
    return 0.6;
  }

  // General coastal approximation for other areas
  // Points at specific longitude bands near continents
  if (absLat < 60) return 0.25;

  // Polar regions: low ducting
  return 0.1;
}

// ─── Model ──────────────────────────────────────────────────────────────────

/**
 * Calculate ducting probability for a given location and time.
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param month - Month (1-12)
 * @param utcHour - UTC hour (0-23)
 * @returns Array of ducting predictions by type
 */
function calculateDuctingProbability(
  lat: number,
  lon: number,
  month: number,
  utcHour: number,
): DuctingGridPoint[] {
  const coastal = getCoastalFactor(lat, lon);
  const absLat = Math.abs(lat);
  const results: DuctingGridPoint[] = [];

  // Local solar hour
  const localSolarHour = (((utcHour + lon / 15) % 24) + 24) % 24;

  // ── Surface ducting ──────────────────────────────────────────────────

  // Seasonal: peaks in late summer/early autumn (Aug-Oct NH, Feb-Apr SH)
  const isNorthern = lat >= 0;
  const surfacePeakMonth = isNorthern ? 9 : 3; // September / March
  const surfaceMonthDiff = Math.abs(month - surfacePeakMonth);
  const surfaceNormalizedDiff =
    surfaceMonthDiff > 6 ? 12 - surfaceMonthDiff : surfaceMonthDiff;
  const surfaceSeasonFactor =
    0.3 + 0.7 * Math.cos((surfaceNormalizedDiff / 6) * Math.PI);

  // Diurnal: peaks in evening/overnight (18:00-06:00 LST)
  const surfaceNightFactor =
    localSolarHour >= 18 || localSolarHour < 6 ? 1.0 : 0.4;

  const surfaceProb = Math.min(
    1.0,
    coastal * Math.max(0, surfaceSeasonFactor) * surfaceNightFactor * 0.8,
  );

  if (surfaceProb >= 0.02) {
    results.push({
      lat,
      lon,
      probability: Math.round(surfaceProb * 1000) / 1000,
      type: "surface",
    });
  }

  // ── Elevated ducting ─────────────────────────────────────────────────

  // Associated with high-pressure systems (subsidence inversions)
  // More common in subtropical regions (20-40 deg latitude)
  // Less diurnal variation
  let elevatedLatFactor: number;
  if (absLat >= 15 && absLat <= 45) {
    const distFrom30 = Math.abs(absLat - 30);
    elevatedLatFactor = 0.6 + 0.4 * Math.cos((distFrom30 / 15) * (Math.PI / 2));
  } else if (absLat < 15) {
    elevatedLatFactor = 0.4;
  } else {
    elevatedLatFactor = Math.max(0.1, 0.6 * (1 - (absLat - 45) / 25));
  }

  // Seasonal: summer for elevated ducts
  const elevatedPeakMonth = isNorthern ? 7 : 1;
  const elevatedMonthDiff = Math.abs(month - elevatedPeakMonth);
  const elevatedNormalizedDiff =
    elevatedMonthDiff > 6 ? 12 - elevatedMonthDiff : elevatedMonthDiff;
  const elevatedSeasonFactor =
    0.3 + 0.7 * Math.cos((elevatedNormalizedDiff / 6) * Math.PI);

  const elevatedProb = Math.min(
    1.0,
    coastal * 0.6 * elevatedLatFactor * Math.max(0, elevatedSeasonFactor),
  );

  if (elevatedProb >= 0.02) {
    results.push({
      lat,
      lon,
      probability: Math.round(elevatedProb * 1000) / 1000,
      type: "elevated",
    });
  }

  // ── Evaporation ducting ──────────────────────────────────────────────

  // Over warm ocean only; persistent in tropics/subtropics
  // Strong coastal/ocean dependency
  if (coastal >= 0.5) {
    // Tropical waters: near-permanent evaporation duct
    let evapFactor: number;
    if (absLat < 20) {
      evapFactor = 0.8;
    } else if (absLat < 35) {
      evapFactor = 0.8 * (1 - (absLat - 20) / 15);
    } else {
      evapFactor = Math.max(0, 0.3 * (1 - (absLat - 35) / 25));
    }

    // Slight summer enhancement
    const evapSeasonFactor = 0.8 + 0.2 * Math.max(0, elevatedSeasonFactor);

    const evapProb = Math.min(1.0, coastal * evapFactor * evapSeasonFactor);

    if (evapProb >= 0.02) {
      results.push({
        lat,
        lon,
        probability: Math.round(evapProb * 1000) / 1000,
        type: "evaporation",
      });
    }
  }

  return results;
}

/**
 * Generate a global ducting probability grid.
 */
function generateDuctingGrid(
  month: number,
  utcHour: number,
  resolution: number = 10,
): DuctingGridPoint[] {
  const grid: DuctingGridPoint[] = [];

  for (let lat = -70; lat <= 70; lat += resolution) {
    for (let lon = -180; lon < 180; lon += resolution) {
      const points = calculateDuctingProbability(lat, lon, month, utcHour);
      grid.push(...points);
    }
  }

  return grid;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  const limited = applyRateLimit(request, "propagation/ducting", 15, 60);
  if (limited) return limited;

  try {
    const url = new URL(request.url);

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

    const validMonth = Math.max(1, Math.min(12, month));
    const validHour = Math.max(0, Math.min(23, hour));
    const validResolution = Math.max(5, Math.min(30, resolution));

    const grid = generateDuctingGrid(validMonth, validHour, validResolution);

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
        error: `Failed to calculate ducting data: ${message}`,
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

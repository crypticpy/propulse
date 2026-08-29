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

import { applyRateLimit } from "../rateLimit";

/**
 * Get the allowed CORS origin based on environment
 */
function getAllowedOrigin(): string {
  return process.env.ALLOWED_ORIGIN || "https://propulse.vercel.app";
}

// ─── Ducting: Types ─────────────────────────────────────────────────────────

interface DuctingGridPoint {
  lat: number;
  lon: number;
  probability: number;
  type: "surface" | "elevated" | "evaporation";
}

// ─── Ducting: Geographic Helpers ────────────────────────────────────────────

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

// ─── Ducting: Model ─────────────────────────────────────────────────────────

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

// ─── Ducting: Handler ───────────────────────────────────────────────────────

export async function handlePropagationDucting(
  request: Request,
): Promise<Response> {
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

// ─── Sporadic E: Types ──────────────────────────────────────────────────────

interface SporadicEGridPoint {
  lat: number;
  lon: number;
  probability: number;
  estimatedFoEs: number;
}

// ─── Sporadic E: Model ──────────────────────────────────────────────────────

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
  // Floor of 0.08 ensures some Es activity year-round (real Es
  // can occur in any month, just at much lower rates in winter)
  const seasonFactor =
    0.2 + 0.8 * Math.cos((normalizedMonthDiff / 6) * Math.PI);
  const clampedSeason = Math.max(0.08, seasonFactor);

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

// ─── Sporadic E: Handler ────────────────────────────────────────────────────

export async function handlePropagationSporadicE(
  request: Request,
): Promise<Response> {
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

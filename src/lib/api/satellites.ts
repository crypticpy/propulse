/**
 * Satellite API Client
 *
 * Fetches TLE data from Celestrak and computes satellite positions
 * using the SGP4 propagation model via satellite.js. Provides accurate
 * orbital position predictions for LEO, MEO, and GEO satellites.
 *
 * TLE source: Celestrak amateur radio satellite group
 */

import * as satelliteLib from "satellite.js";
import type { SatRec } from "satellite.js";
import type {
  TLEData,
  SatellitePosition,
  SatelliteCategory,
  PassPrediction,
  TLEAge,
} from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371.0;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Primary TLE source — Celestrak amateur radio group
 */
const CELESTRAK_URL =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle";

/**
 * Proxy fallback matching the app's existing proxy pattern
 */
const PROXY_URL = "/api/satellites/tle";

// ---------------------------------------------------------------------------
// Popular amateur radio satellites (fallback when TLE fetch fails)
// ---------------------------------------------------------------------------

export const POPULAR_SATS: Record<
  string,
  { noradId: number; category: SatelliteCategory }
> = {
  "ISS (ZARYA)": { noradId: 25544, category: "iss" },
  "SO-50": { noradId: 27607, category: "fm" },
  "AO-91": { noradId: 43017, category: "fm" },
  "IO-117": { noradId: 57166, category: "fm" },
  "RS-44": { noradId: 44909, category: "linear" },
  "FO-99": { noradId: 43937, category: "linear" },
  "QO-100": { noradId: 43700, category: "linear" },
  "CAS-4A": { noradId: 44881, category: "linear" },
  "CAS-4B": { noradId: 44884, category: "linear" },
  "TEVEL-1": { noradId: 50988, category: "fm" },
};

/**
 * Resolve the category for a satellite from name or NORAD ID.
 * Falls back to "other" for unknown satellites.
 */
export function categoriseSatellite(
  name: string,
  noradId: number,
): SatelliteCategory {
  // Check known satellites first
  const trimmedName = name.trim();
  const known = POPULAR_SATS[trimmedName];
  if (known) {
    return known.category;
  }

  // Match by NORAD ID
  for (const entry of Object.values(POPULAR_SATS)) {
    if (entry.noradId === noradId) {
      return entry.category;
    }
  }

  // Heuristic categorisation by name prefix
  const upper = trimmedName.toUpperCase();
  if (upper.includes("ISS") || upper.includes("ZARYA")) {
    return "iss";
  }
  if (
    upper.startsWith("AO-") ||
    upper.startsWith("SO-") ||
    upper.startsWith("IO-") ||
    upper.startsWith("TEVEL")
  ) {
    return "fm";
  }
  if (
    upper.startsWith("FO-") ||
    upper.startsWith("RS-") ||
    upper.startsWith("QO-") ||
    upper.startsWith("CAS-")
  ) {
    return "linear";
  }
  if (upper.includes("DIGI") || upper.includes("APRS")) {
    return "digital";
  }
  if (
    upper.includes("NOAA") ||
    upper.includes("METEOR") ||
    upper.includes("WEATHER")
  ) {
    return "weather";
  }

  return "other";
}

// ---------------------------------------------------------------------------
// TLE Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a block of 3-line TLE text into structured TLE records.
 *
 * Expected format (repeating):
 * ```
 * SATELLITE NAME
 * 1 25544U 98067A   24020.54842296 ...
 * 2 25544  51.6412 ...
 * ```
 */
export function parseTLEText(text: string): TLEData[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: TLEData[] = [];

  for (let i = 0; i <= lines.length - 3; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    // Validate line identifiers
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) {
      // Try to resync — skip ahead
      continue;
    }

    // NORAD catalog ID is columns 3-7 of line 1
    const noradId = parseInt(line1.substring(2, 7).trim(), 10);
    if (isNaN(noradId)) {
      continue;
    }

    results.push({ name: name.trim(), line1, line2, noradId });
  }

  return results;
}

// ---------------------------------------------------------------------------
// SGP4 Satrec Caching & Helpers
// ---------------------------------------------------------------------------

/**
 * Parse TLE and return a satrec for caching.
 * Avoids reparsing TLE lines on every position update.
 */
export function parseSatrec(tle: TLEData): SatRec {
  return satelliteLib.twoline2satrec(tle.line1, tle.line2);
}

/**
 * Get TLE epoch as a Date for age badge calculation.
 */
export function getTLEEpoch(tle: TLEData): Date {
  const satrec = satelliteLib.twoline2satrec(tle.line1, tle.line2);
  const fullYear =
    satrec.epochyr >= 57 ? satrec.epochyr + 1900 : satrec.epochyr + 2000;
  // epochdays is 1-based fractional day of year
  const jan1 = Date.UTC(fullYear, 0, 1, 0, 0, 0);
  const epochMs = jan1 + (satrec.epochdays - 1) * 86400000;
  return new Date(epochMs);
}

/**
 * Determine TLE age category for badge display.
 * - fresh: < 3 days old
 * - aging: 3-7 days old
 * - stale: > 7 days old
 */
export function getTLEAge(tle: TLEData): TLEAge {
  const epoch = getTLEEpoch(tle);
  const ageMs = Date.now() - epoch.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 3) return "fresh";
  if (ageDays < 7) return "aging";
  return "stale";
}

// ---------------------------------------------------------------------------
// Position Calculation (SGP4)
// ---------------------------------------------------------------------------

/**
 * Calculate satellite position from TLE at a given date using SGP4.
 *
 * Uses the satellite.js SGP4 propagator for high-accuracy orbital prediction.
 * Returns null if propagation fails (e.g. decayed orbit, bad TLE).
 */
export function calculatePosition(
  tle: TLEData,
  date: Date,
): SatellitePosition | null {
  try {
    const satrec = satelliteLib.twoline2satrec(tle.line1, tle.line2);
    const positionAndVelocity = satelliteLib.propagate(satrec, date);

    // propagate returns null on failure, or satrec.error indicates SGP4 error
    if (!positionAndVelocity || satrec.error !== 0) return null;

    const posEci = positionAndVelocity.position;
    const velEci = positionAndVelocity.velocity;

    const gmst = satelliteLib.gstime(date);
    const positionGd = satelliteLib.eciToGeodetic(posEci, gmst);

    const lat = satelliteLib.degreesLat(positionGd.latitude);
    const lon = satelliteLib.degreesLong(positionGd.longitude);
    const alt = positionGd.height; // km

    // Calculate velocity magnitude from velocity vector
    const velocity = Math.sqrt(velEci.x ** 2 + velEci.y ** 2 + velEci.z ** 2);

    return { lat, lon, alt, velocity };
  } catch {
    return null;
  }
}

/**
 * Calculate ground track (sub-satellite points) over a time window.
 * Useful for rendering orbital path on the globe.
 *
 * @param tle - TLE data
 * @param startDate - Start time
 * @param durationMinutes - How many minutes of ground track to compute
 * @param stepMinutes - Time step between points (default 1 minute)
 * @returns Array of {lat, lon} points
 */
export function calculateGroundTrack(
  tle: TLEData,
  startDate: Date,
  durationMinutes: number,
  stepMinutes: number = 1,
): Array<{ lat: number; lon: number }> {
  const points: Array<{ lat: number; lon: number }> = [];

  for (let t = 0; t <= durationMinutes; t += stepMinutes) {
    const date = new Date(startDate.getTime() + t * 60000);
    const pos = calculatePosition(tle, date);
    if (pos) {
      points.push({ lat: pos.lat, lon: pos.lon });
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// Elevation & Azimuth (pure geometry — kept as-is)
// ---------------------------------------------------------------------------

/**
 * Compute elevation angle of a satellite from an observer's position.
 *
 * Uses the geometric relationship between observer and satellite positions
 * in ECEF coordinates.
 */
export function computeElevation(
  satLat: number,
  satLon: number,
  satAlt: number,
  obsLat: number,
  obsLon: number,
): number {
  const obsLatRad = obsLat * DEG_TO_RAD;
  const obsLonRad = obsLon * DEG_TO_RAD;
  const satLatRad = satLat * DEG_TO_RAD;
  const satLonRad = satLon * DEG_TO_RAD;

  // Observer position on Earth surface (ECEF, assuming spherical Earth)
  const obsR = EARTH_RADIUS_KM;
  const oxe = obsR * Math.cos(obsLatRad) * Math.cos(obsLonRad);
  const oye = obsR * Math.cos(obsLatRad) * Math.sin(obsLonRad);
  const oze = obsR * Math.sin(obsLatRad);

  // Satellite position (ECEF)
  const satR = EARTH_RADIUS_KM + satAlt;
  const sxe = satR * Math.cos(satLatRad) * Math.cos(satLonRad);
  const sye = satR * Math.cos(satLatRad) * Math.sin(satLonRad);
  const sze = satR * Math.sin(satLatRad);

  // Range vector from observer to satellite
  const rx = sxe - oxe;
  const ry = sye - oye;
  const rz = sze - oze;
  const rangeMag = Math.sqrt(rx * rx + ry * ry + rz * rz);

  // Observer's "up" direction (radial from Earth center)
  const upX = Math.cos(obsLatRad) * Math.cos(obsLonRad);
  const upY = Math.cos(obsLatRad) * Math.sin(obsLonRad);
  const upZ = Math.sin(obsLatRad);

  // Elevation = angle above horizon
  // sin(el) = dot(range, up) / |range|
  const sinEl = (rx * upX + ry * upY + rz * upZ) / rangeMag;
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) * RAD_TO_DEG;
}

/**
 * Compute azimuth from observer to satellite.
 */
export function computeAzimuth(
  satLat: number,
  satLon: number,
  obsLat: number,
  obsLon: number,
): number {
  const dLon = (satLon - obsLon) * DEG_TO_RAD;
  const obsLatRad = obsLat * DEG_TO_RAD;
  const satLatRad = satLat * DEG_TO_RAD;

  const y = Math.sin(dLon) * Math.cos(satLatRad);
  const x =
    Math.cos(obsLatRad) * Math.sin(satLatRad) -
    Math.sin(obsLatRad) * Math.cos(satLatRad) * Math.cos(dLon);

  let az = Math.atan2(y, x) * RAD_TO_DEG;
  if (az < 0) {
    az += 360;
  }
  return az;
}

// ---------------------------------------------------------------------------
// Pass Prediction
// ---------------------------------------------------------------------------

/**
 * Simple pass prediction: check elevation angle at 1-minute intervals
 * and identify AOS/LOS transitions.
 *
 * @param tle - TLE data for the satellite
 * @param obsLat - Observer latitude
 * @param obsLon - Observer longitude
 * @param date - Start time for prediction window
 * @param hours - Prediction window length in hours (default 24)
 * @returns Array of pass predictions
 */
export function getSimplePassPrediction(
  tle: TLEData,
  obsLat: number,
  obsLon: number,
  date: Date,
  hours: number = 24,
): PassPrediction[] {
  const passes: PassPrediction[] = [];
  const totalMinutes = hours * 60;
  const stepMinutes = 1;

  let inPass = false;
  let passStart = date;
  let passStartAz = 0;
  let maxEl = 0;

  for (let t = 0; t <= totalMinutes; t += stepMinutes) {
    const currentTime = new Date(date.getTime() + t * 60000);
    const pos = calculatePosition(tle, currentTime);
    if (!pos) continue;

    const el = computeElevation(pos.lat, pos.lon, pos.alt, obsLat, obsLon);
    const az = computeAzimuth(pos.lat, pos.lon, obsLat, obsLon);

    if (el > 0 && !inPass) {
      // AOS — satellite rises above horizon
      inPass = true;
      passStart = currentTime;
      passStartAz = az;
      maxEl = el;
    } else if (el > 0 && inPass) {
      // Still in pass — track max elevation
      if (el > maxEl) {
        maxEl = el;
      }
    } else if (el <= 0 && inPass) {
      // LOS — satellite drops below horizon
      inPass = false;

      // Only record passes with meaningful max elevation (> 2 degrees)
      if (maxEl > 2) {
        passes.push({
          aos: passStart,
          los: currentTime,
          maxEl,
          aosAz: passStartAz,
          losAz: az,
        });
      }

      maxEl = 0;
    }
  }

  // Close any open pass at window end
  if (inPass && maxEl > 2) {
    const endTime = new Date(date.getTime() + totalMinutes * 60000);
    const endPos = calculatePosition(tle, endTime);
    const endAz = endPos
      ? computeAzimuth(endPos.lat, endPos.lon, obsLat, obsLon)
      : 0;
    passes.push({
      aos: passStart,
      los: endTime,
      maxEl,
      aosAz: passStartAz,
      losAz: endAz,
    });
  }

  return passes;
}

// ---------------------------------------------------------------------------
// Range-Rate Calculation (for Doppler shift)
// ---------------------------------------------------------------------------

/**
 * Compute slant range from observer to satellite for Doppler calculations.
 */
function computeSlantRangeForDoppler(
  satLat: number,
  satLon: number,
  satAlt: number,
  obsLat: number,
  obsLon: number,
  obsAlt: number = 0,
): number {
  const oLR = obsLat * DEG_TO_RAD;
  const oLoR = obsLon * DEG_TO_RAD;
  const sLR = satLat * DEG_TO_RAD;
  const sLoR = satLon * DEG_TO_RAD;
  const oR = EARTH_RADIUS_KM + obsAlt;
  const sR = EARTH_RADIUS_KM + satAlt;
  const rx =
    sR * Math.cos(sLR) * Math.cos(sLoR) - oR * Math.cos(oLR) * Math.cos(oLoR);
  const ry =
    sR * Math.cos(sLR) * Math.sin(sLoR) - oR * Math.cos(oLR) * Math.sin(oLoR);
  const rz = sR * Math.sin(sLR) - oR * Math.sin(oLR);
  return Math.sqrt(rx * rx + ry * ry + rz * rz);
}

/**
 * Calculate range-rate between observer and satellite from two consecutive
 * positions. Negative = satellite approaching (higher received frequency).
 */
export function calculateRangeRateForSat(
  pos1: SatellitePosition,
  pos2: SatellitePosition,
  observer: { lat: number; lon: number; alt?: number },
  dtSeconds: number,
): number {
  const obsAlt = observer.alt ?? 0;
  const r1 = computeSlantRangeForDoppler(
    pos1.lat,
    pos1.lon,
    pos1.alt,
    observer.lat,
    observer.lon,
    obsAlt,
  );
  const r2 = computeSlantRangeForDoppler(
    pos2.lat,
    pos2.lon,
    pos2.alt,
    observer.lat,
    observer.lon,
    obsAlt,
  );
  return (r2 - r1) / dtSeconds;
}

// ---------------------------------------------------------------------------
// TLE Data Fetching
// ---------------------------------------------------------------------------

/**
 * Fetch TLE data from Celestrak (amateur radio group).
 * Falls back to the app's proxy endpoint if CORS blocks the direct request.
 *
 * @returns Array of parsed TLE records
 */
export async function fetchTLEData(): Promise<TLEData[]> {
  // Try direct Celestrak fetch first
  try {
    const response = await fetch(CELESTRAK_URL, {
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const text = await response.text();
      const parsed = parseTLEText(text);
      if (parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // CORS blocked or network error — fall through to proxy
  }

  // Try proxy endpoint
  try {
    const response = await fetch(PROXY_URL, {
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const data = await response.json();
        if (data.tle && typeof data.tle === "string") {
          return parseTLEText(data.tle);
        }
      } else {
        const text = await response.text();
        return parseTLEText(text);
      }
    }
  } catch {
    // Proxy also failed
  }

  // Return empty — hook layer will use fallback
  console.warn(
    "Failed to fetch TLE data from Celestrak and proxy. Using fallback.",
  );
  return [];
}

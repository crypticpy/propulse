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
 * Secondary TLE source — AMSAT (always available, amateur sats only)
 */
const AMSAT_URL = "https://www.amsat.org/tle/current/nasabare.txt";

/**
 * Same-origin endpoint that owns Celestrak rate limiting and fallbacks.
 */
const PROXY_URL = "/api/satellites/tle";

// ---------------------------------------------------------------------------
// Popular amateur radio satellites (fallback when TLE fetch fails)
// ---------------------------------------------------------------------------

export const POPULAR_SATS: Record<
  string,
  { noradId: number; category: SatelliteCategory }
> = {
  // ── ISS / Space Stations ────────────────────────────────────────────
  "ISS (ZARYA)": { noradId: 25544, category: "iss" },
  ISS: { noradId: 25544, category: "iss" },
  "CSS (TIANHE-1)": { noradId: 48274, category: "iss" },

  // ── FM Repeaters ────────────────────────────────────────────────────
  "SO-50": { noradId: 27607, category: "fm" },
  "AO-27": { noradId: 22825, category: "fm" },
  "AO-91": { noradId: 43017, category: "fm" },
  "AO-92": { noradId: 43137, category: "fm" },
  "PO-101": { noradId: 44104, category: "fm" },
  "IO-86": { noradId: 40931, category: "fm" },
  "AO-123": { noradId: 58580, category: "fm" },
  "HADES-ICM (SO-125)": { noradId: 63492, category: "fm" },
  "SO-125": { noradId: 63492, category: "fm" },
  "HADES-D": { noradId: 0, category: "fm" }, // NORAD TBD; matched by name
  "MO-122": { noradId: 57172, category: "fm" },

  // TEVEL series (first generation — decayed, but may appear in older TLEs)
  "TEVEL-1": { noradId: 50988, category: "fm" },
  "TEVEL-2": { noradId: 50989, category: "fm" },
  "TEVEL-3": { noradId: 50990, category: "fm" },
  "TEVEL-4": { noradId: 50991, category: "fm" },
  "TEVEL-5": { noradId: 50992, category: "fm" },
  "TEVEL-6": { noradId: 50993, category: "fm" },
  "TEVEL-7": { noradId: 50994, category: "fm" },
  "TEVEL-8": { noradId: 50995, category: "fm" },

  // TEVEL-2 series (second generation from AMSAT nasabare.txt)
  "TEVEL2-1": { noradId: 0, category: "fm" },
  "TEVEL2-2": { noradId: 0, category: "fm" },
  "TEVEL2-3": { noradId: 0, category: "fm" },
  "TEVEL2-4": { noradId: 0, category: "fm" },
  "TEVEL2-5": { noradId: 0, category: "fm" },
  "TEVEL2-6": { noradId: 0, category: "fm" },
  "TEVEL2-7": { noradId: 0, category: "fm" },
  "TEVEL2-8": { noradId: 0, category: "fm" },
  "TEVEL2-9": { noradId: 0, category: "fm" },

  // Other FM repeaters
  "CAS-10": { noradId: 0, category: "fm" }, // CAS-10 has FM transponder
  SAUDISAT: { noradId: 0, category: "fm" },
  "SAUDISAT-1C": { noradId: 0, category: "fm" },

  // ── Linear Transponders (SSB/CW) ───────────────────────────────────
  "AO-7": { noradId: 7530, category: "linear" },
  "AO-73": { noradId: 39444, category: "linear" },
  "FO-29": { noradId: 24278, category: "linear" },
  "FO-99": { noradId: 43937, category: "linear" },
  "JO-97": { noradId: 43803, category: "linear" },
  "RS-44": { noradId: 44909, category: "linear" },
  "QO-100": { noradId: 43700, category: "linear" },
  "CAS-4A": { noradId: 44881, category: "linear" },
  "CAS-4B": { noradId: 44884, category: "linear" },
  "TO-108": { noradId: 0, category: "linear" }, // CAS-6
  "HO-113": { noradId: 0, category: "linear" },

  // XW-2 series (CAS-3 constellation) — all carry 435/145 linear transponders
  "XW-2A": { noradId: 40903, category: "linear" },
  "XW-2B": { noradId: 40911, category: "linear" },
  "XW-2C": { noradId: 40906, category: "linear" },
  "XW-2D": { noradId: 40907, category: "linear" },
  "XW-2E": { noradId: 40909, category: "linear" },
  "XW-2F": { noradId: 40910, category: "linear" },

  // XW-3 / CAS-9 — linear transponder
  "XW-3": { noradId: 50466, category: "linear" },
  "CAS-9": { noradId: 50466, category: "linear" },

  // Other linear transponder sats
  "LILACSAT-2": { noradId: 40908, category: "linear" },
  "LilacSat-2": { noradId: 40908, category: "linear" },
  "RS-22": { noradId: 0, category: "linear" },
  "RS-30": { noradId: 0, category: "linear" },
  "RS-38S": { noradId: 0, category: "linear" },
  "EO-80": { noradId: 0, category: "linear" },
  "CO-55": { noradId: 0, category: "linear" },
  "CO-57": { noradId: 0, category: "linear" },
  "CO-58": { noradId: 0, category: "linear" },
  "CO-65": { noradId: 0, category: "linear" },
  "CO-66": { noradId: 0, category: "linear" },
  "LO-74": { noradId: 0, category: "linear" },

  // ── Digital (APRS, digipeaters, packet, FSK, SSTV) ─────────────────
  "IO-117": { noradId: 57166, category: "digital" }, // GreenCube digipeater
  "NO-44": { noradId: 26931, category: "digital" },
  "NO-104": { noradId: 44354, category: "digital" }, // PSAT-2 (decayed)
  "GO-32": { noradId: 25397, category: "digital" },
  "CAS-2T": { noradId: 0, category: "digital" },
  BOTAN: { noradId: 0, category: "digital" }, // APRS digipeater
  "SNUGLITE-III DURI": { noradId: 0, category: "digital" }, // 9600bps GMSK AX.25
  "SNUGLITE 2": { noradId: 0, category: "digital" },
  "ISS-DATA": { noradId: 25544, category: "iss" }, // ISS packet — keep as ISS

  // ── Weather (APT / LRPT / HRPT receivable) ─────────────────────────
  "NOAA 15": { noradId: 25338, category: "weather" },
  "NOAA 18": { noradId: 28654, category: "weather" },
  "NOAA 19": { noradId: 33591, category: "weather" },
  "NOAA-15": { noradId: 25338, category: "weather" },
  "NOAA-18": { noradId: 28654, category: "weather" },
  "NOAA-19": { noradId: 33591, category: "weather" },
  "METEOR-M 2": { noradId: 40069, category: "weather" },
  "METEOR-M2 2": { noradId: 44387, category: "weather" },
  "METEOR-M2 3": { noradId: 57166, category: "weather" },
  "METEOR-M2 4": { noradId: 0, category: "weather" },
  "METEOR-M 2-2": { noradId: 44387, category: "weather" },
  "METEOR-M 2-3": { noradId: 57166, category: "weather" },
  "METOP-A": { noradId: 29499, category: "weather" },
  "METOP-B": { noradId: 38771, category: "weather" },
  "METOP-C": { noradId: 43689, category: "weather" },
  "FENGYUN 3A": { noradId: 32958, category: "weather" },
  "FENGYUN 3B": { noradId: 37214, category: "weather" },
  "FENGYUN 3C": { noradId: 39260, category: "weather" },
  "FENGYUN 3D": { noradId: 43010, category: "weather" },
  "FENGYUN 3E": { noradId: 49008, category: "weather" },
  "GOES-16": { noradId: 41866, category: "weather" },
  "GOES-17": { noradId: 43226, category: "weather" },
  "GOES-18": { noradId: 51850, category: "weather" },
};

// ---------------------------------------------------------------------------
// Fast NORAD ID → category lookup (built once from POPULAR_SATS)
// Skips entries with noradId 0 (name-only matches)
// ---------------------------------------------------------------------------
const _noradCategoryMap = new Map<number, SatelliteCategory>();
for (const entry of Object.values(POPULAR_SATS)) {
  if (entry.noradId > 0 && !_noradCategoryMap.has(entry.noradId)) {
    _noradCategoryMap.set(entry.noradId, entry.category);
  }
}

/**
 * Resolve the category for a satellite from name or NORAD ID.
 * Falls back to "other" for unknown satellites.
 *
 * Performance: O(1) for known names/NORAD IDs via Map lookups,
 * then falls through to simple string heuristics.
 */
export function categoriseSatellite(
  name: string,
  noradId: number,
): SatelliteCategory {
  // 1. Exact name match in POPULAR_SATS (O(1) property lookup)
  const trimmedName = name.trim();
  const known = POPULAR_SATS[trimmedName];
  if (known) {
    return known.category;
  }

  // 2. NORAD ID match via pre-built Map (O(1))
  if (noradId > 0) {
    const byId = _noradCategoryMap.get(noradId);
    if (byId) {
      return byId;
    }
  }

  // 3. Heuristic categorisation by name patterns
  const upper = trimmedName.toUpperCase();

  // ── ISS / Space Stations ──────────────────────────────────────────
  if (
    upper.includes("ISS") ||
    upper.includes("ZARYA") ||
    upper.includes("TIANHE") ||
    upper.includes("TIANGONG")
  ) {
    return "iss";
  }

  // ── Weather satellites ────────────────────────────────────────────
  // Check weather BEFORE amateur categories since NOAA/METEOR names
  // are distinctive and should never fall into FM/linear buckets.
  if (
    upper.includes("NOAA") ||
    upper.includes("METEOR") ||
    upper.includes("METOP") ||
    upper.includes("FENGYUN") ||
    upper.includes("FENG YUN") ||
    upper.includes("GOES-") ||
    upper.startsWith("GOES ") ||
    upper.includes("WEATHER") ||
    upper.includes("HIMAWARI") ||
    upper.includes("ELECTRO-L")
  ) {
    return "weather";
  }

  // ── FM Repeaters ──────────────────────────────────────────────────
  if (
    upper.startsWith("SO-") ||
    upper.startsWith("TEVEL") ||
    upper.startsWith("PO-") ||
    upper.includes("HADES") ||
    upper.includes("SAUDISAT") ||
    upper.includes("BREEZE") ||
    upper.startsWith("CAS-10")
  ) {
    return "fm";
  }

  // AO- prefix: most are FM repeaters (AO-91, AO-92, AO-27, AO-123)
  // but AO-7 and AO-73 are linear — handle the exceptions
  if (upper.startsWith("AO-")) {
    if (upper === "AO-7" || upper.startsWith("AO-73")) {
      return "linear";
    }
    return "fm";
  }

  // IO- prefix: IO-86 is FM, IO-117 is digital — default FM for others
  if (upper.startsWith("IO-")) {
    if (upper.startsWith("IO-117")) {
      return "digital";
    }
    return "fm";
  }

  // MO- prefix: FM repeaters (e.g. MO-122)
  if (upper.startsWith("MO-")) {
    return "fm";
  }

  // ── Linear Transponders (SSB/CW) ──────────────────────────────────
  if (
    upper.startsWith("FO-") ||
    upper.startsWith("RS-") ||
    upper.startsWith("QO-") ||
    upper.startsWith("JO-") ||
    upper.startsWith("XW-") ||
    upper.startsWith("HO-") ||
    upper.startsWith("EO-") ||
    upper.startsWith("LO-") ||
    upper.startsWith("CO-") ||
    upper.includes("LILACSAT")
  ) {
    return "linear";
  }

  // CAS- prefix: CAS-4A/B, CAS-9, XW-series are linear; CAS-10 is FM
  // CAS-2T is digital; default to linear for other CAS- sats
  if (upper.startsWith("CAS-")) {
    if (upper.startsWith("CAS-10")) {
      return "fm";
    }
    if (upper.startsWith("CAS-2T")) {
      return "digital";
    }
    return "linear";
  }

  // ── Digital (APRS, digipeaters, packet, FSK, SSTV) ────────────────
  if (
    upper.includes("APRS") ||
    upper.includes("DIGI") ||
    upper.includes("PACKET") ||
    upper.includes("PSAT") ||
    upper.includes("AX25") ||
    upper.includes("AX.25") ||
    upper.includes("BPSK") ||
    upper.includes("GMSK") ||
    upper.includes("FSK") ||
    upper.includes("SSTV") ||
    upper.includes("UVSQ") ||
    upper.startsWith("NO-")
  ) {
    return "digital";
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
 * In-memory TLE cache to respect Celestrak's rate limits.
 * Celestrak updates GP data every ~2 hours and will firewall-block IPs
 * that make >100 error requests in a 2-hour window.
 * See: https://celestrak.org/NORAD/elements/gp.php (FAQ section)
 */
let _tleCache: TLEData[] | null = null;
let _tleCacheTime = 0;
const TLE_CACHE_MIN_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours — matches Celestrak update cadence

// ---------------------------------------------------------------------------
// TLE Meta (collector staleness tracking)
// ---------------------------------------------------------------------------

interface TLEMeta {
  collectedAt: string;
  source: "collector" | "direct";
}

let _lastTLEMeta: TLEMeta | null = null;

/** Get the most recent _meta returned by the edge function. */
export function getLastTLEMeta(): TLEMeta | null {
  return _lastTLEMeta;
}

/**
 * Fetch TLE data from multiple sources with graceful fallback.
 *
 * Order: Vite/Vercel proxy → AMSAT
 *
 * Respects Celestrak rate limits by caching results for a minimum of
 * 2 hours (their update cadence). If all sources fail, returns the
 * last cached result if available.
 */
export async function fetchTLEData(): Promise<TLEData[]> {
  // Return cached data if fresh enough (prevents hammering during dev restarts)
  if (_tleCache && _tleCache.length > 0) {
    const age = Date.now() - _tleCacheTime;
    if (age < TLE_CACHE_MIN_AGE_MS) {
      return _tleCache;
    }
  }

  const result = await _fetchTLEFromSources();

  if (result.length > 0) {
    _tleCache = result;
    _tleCacheTime = Date.now();
  } else if (_tleCache && _tleCache.length > 0) {
    // All sources failed — return stale cache rather than nothing
    console.warn(
      "[Satellites] All sources unavailable, using cached TLE data " +
        `(${Math.round((Date.now() - _tleCacheTime) / 60000)}min old)`,
    );
    return _tleCache;
  }

  return result;
}

async function _fetchTLEFromSources(): Promise<TLEData[]> {
  // The same-origin endpoint centralizes caching and prevents every browser
  // from independently consuming Celestrak's shared request allowance.
  try {
    const response = await fetch(PROXY_URL, {
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const data = await response.json();
        if (data._meta) {
          _lastTLEMeta = data._meta;
        }
        if (data.tle && typeof data.tle === "string") {
          return parseTLEText(data.tle);
        }
      } else {
        const text = await response.text();
        const parsed = parseTLEText(text);
        if (parsed.length > 0) return parsed;
      }
    }
  } catch {
    // Proxy failed; AMSAT remains a browser-compatible emergency fallback.
  }

  // Try AMSAT as secondary source (no CORS issues, amateur sats only)
  try {
    const response = await fetch(AMSAT_URL, {
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const text = await response.text();
      const parsed = parseTLEText(text);
      if (parsed.length > 0) {
        console.info(
          `[Satellites] Celestrak unavailable, loaded ${parsed.length} sats from AMSAT`,
        );
        return parsed;
      }
    }
  } catch {
    // AMSAT also failed
  }

  // All external sources failed
  console.warn(
    "[Satellites] All TLE sources unavailable (proxy, AMSAT)",
  );
  return [];
}

// ---------------------------------------------------------------------------
// Multi-Group TLE Fetching
// ---------------------------------------------------------------------------

/**
 * Per-group TLE cache. Each non-amateur group gets its own cache entry
 * so groups can be independently refreshed without re-fetching all data.
 */
const _groupCache = new Map<string, { data: TLEData[]; time: number }>();

/**
 * Fetch TLE data for a specific Celestrak group.
 *
 * For the "amateur" group, delegates to `fetchTLEData()` which has a
 * proxy-owned Celestrak/AMSAT fallback chain. For all other
 * groups, fetches via the proxy endpoint only (the edge function
 * handles Celestrak on the server side).
 *
 * Results are cached per-group for 2 hours (matching Celestrak update cadence).
 */
export async function fetchTLEForGroup(group: string): Promise<TLEData[]> {
  // "amateur" uses the existing fetchTLEData() with full fallback chain
  if (group === "amateur") return fetchTLEData();

  // Check per-group cache
  const cached = _groupCache.get(group);
  if (cached && Date.now() - cached.time < TLE_CACHE_MIN_AGE_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(
      `/api/satellites/tle?group=${encodeURIComponent(group)}`,
      {
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) return cached?.data ?? [];

    const contentType = res.headers.get("content-type");
    let result: TLEData[];
    if (contentType?.includes("application/json")) {
      const json = await res.json();
      if (json._meta) {
        _lastTLEMeta = json._meta;
      }
      result = parseTLEText(json.tle ?? "");
    } else {
      result = parseTLEText(await res.text());
    }

    if (result.length > 0) {
      _groupCache.set(group, { data: result, time: Date.now() });
    }
    return result;
  } catch {
    return cached?.data ?? [];
  }
}

/**
 * Fetch TLE data for all enabled groups in parallel, then merge
 * and deduplicate by NORAD ID.
 *
 * The "amateur" group is always fetched first and its results take
 * priority during deduplication (first occurrence wins). This ensures
 * amateur radio satellite entries are never overwritten by entries from
 * other groups that might carry different names for the same object.
 *
 * Uses `Promise.allSettled` so a failure in one group doesn't block others.
 */
export async function fetchAllEnabledTLEGroups(
  enabledGroups: string[],
): Promise<TLEData[]> {
  // Always put amateur first for dedup priority
  const sorted = ["amateur", ...enabledGroups.filter((g) => g !== "amateur")];
  const unique = [...new Set(sorted)];

  const results = await Promise.allSettled(
    unique.map((group) => fetchTLEForGroup(group)),
  );

  // Merge and deduplicate by NORAD ID
  const seen = new Set<number>();
  const merged: TLEData[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const tle of result.value) {
        if (!seen.has(tle.noradId)) {
          seen.add(tle.noradId);
          merged.push(tle);
        }
      }
    }
  }

  return merged;
}

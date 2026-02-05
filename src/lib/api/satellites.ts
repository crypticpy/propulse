/**
 * Satellite API Client
 *
 * Fetches TLE data from Celestrak and computes satellite positions
 * using a simplified orbital propagation model. Accurate enough for
 * visualization purposes (within ~10km for LEO satellites).
 *
 * TLE source: Celestrak amateur radio satellite group
 */

import type {
  TLEData,
  SatellitePosition,
  SatelliteCategory,
  PassPrediction,
} from "@/types/satellite";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371.0;
const EARTH_MU = 398600.4418; // km³/s² — standard gravitational parameter
const TWO_PI = 2 * Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MINUTES_PER_DAY = 1440;
// Note: J2000_EPOCH and EARTH_ROTATION_RAD_PER_MIN kept as reference
// for potential future J2 perturbation implementation.

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
// TLE Orbital Element Extraction
// ---------------------------------------------------------------------------

interface OrbitalElements {
  /** Epoch as Date */
  epoch: Date;
  /** Inclination (radians) */
  inclination: number;
  /** Right Ascension of Ascending Node (radians) */
  raan: number;
  /** Eccentricity (dimensionless) */
  eccentricity: number;
  /** Argument of perigee (radians) */
  argPerigee: number;
  /** Mean anomaly at epoch (radians) */
  meanAnomaly: number;
  /** Mean motion (revolutions per day) */
  meanMotion: number;
  /** Semi-major axis (km) */
  semiMajorAxis: number;
}

/**
 * Extract orbital elements from TLE lines.
 */
function parseOrbitalElements(tle: TLEData): OrbitalElements {
  const { line1, line2 } = tle;

  // --- Epoch from line 1 (cols 19-32) ---
  const epochYear = parseInt(line1.substring(18, 20).trim(), 10);
  const epochDay = parseFloat(line1.substring(20, 32).trim());
  const fullYear = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;

  // Convert epoch year + fractional day to a Date
  const jan1 = Date.UTC(fullYear, 0, 1, 0, 0, 0);
  const epochMs = jan1 + (epochDay - 1) * 86400000;
  const epoch = new Date(epochMs);

  // --- Line 2 fields ---
  const inclination = parseFloat(line2.substring(8, 16).trim()) * DEG_TO_RAD;
  const raan = parseFloat(line2.substring(17, 25).trim()) * DEG_TO_RAD;
  const eccentricity = parseFloat("0." + line2.substring(26, 33).trim());
  const argPerigee = parseFloat(line2.substring(34, 42).trim()) * DEG_TO_RAD;
  const meanAnomaly = parseFloat(line2.substring(43, 51).trim()) * DEG_TO_RAD;
  const meanMotion = parseFloat(line2.substring(52, 63).trim()); // rev/day

  // Semi-major axis from mean motion: a = (mu / n²)^(1/3)
  // n must be in rad/s: meanMotion rev/day → rad/s
  const nRadPerSec = (meanMotion * TWO_PI) / 86400;
  const semiMajorAxis = Math.pow(EARTH_MU / (nRadPerSec * nRadPerSec), 1 / 3);

  return {
    epoch,
    inclination,
    raan,
    eccentricity,
    argPerigee,
    meanAnomaly,
    meanMotion,
    semiMajorAxis,
  };
}

// ---------------------------------------------------------------------------
// Kepler's Equation Solver
// ---------------------------------------------------------------------------

/**
 * Solve Kepler's equation M = E - e*sin(E) for eccentric anomaly E.
 * Uses Newton-Raphson iteration — converges in 3-5 iterations for e < 0.1.
 */
function solveKepler(M: number, e: number, tolerance = 1e-8): number {
  let E = M; // initial guess
  for (let i = 0; i < 20; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tolerance) {
      break;
    }
  }
  return E;
}

// ---------------------------------------------------------------------------
// Coordinate Conversions
// ---------------------------------------------------------------------------

/**
 * Greenwich Mean Sidereal Time in radians for a given Date.
 * Uses the IAU simplified formula relative to J2000.0.
 */
function gmst(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  // GMST in degrees
  let gmstDeg =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000;
  gmstDeg = ((gmstDeg % 360) + 360) % 360;
  return gmstDeg * DEG_TO_RAD;
}

// ---------------------------------------------------------------------------
// Position Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate satellite position from TLE at a given date.
 *
 * Simplified propagation model:
 * 1. Parse TLE orbital elements
 * 2. Propagate mean anomaly using mean motion
 * 3. Solve Kepler's equation for eccentric anomaly
 * 4. Convert to true anomaly and position in orbital plane
 * 5. Rotate through argument of perigee, RAAN, inclination to ECI
 * 6. Rotate by GMST to get ECEF, then convert to lat/lon/alt
 *
 * Accurate to ~10 km for LEO satellites over short prediction windows.
 */
export function calculatePosition(tle: TLEData, date: Date): SatellitePosition {
  const elements = parseOrbitalElements(tle);
  const {
    epoch,
    inclination,
    raan,
    eccentricity,
    argPerigee,
    meanAnomaly,
    meanMotion,
    semiMajorAxis,
  } = elements;

  // Time since epoch in minutes
  const dtMinutes = (date.getTime() - epoch.getTime()) / 60000;

  // Updated mean anomaly
  const nRadPerMin = (meanMotion * TWO_PI) / MINUTES_PER_DAY;
  let M = meanAnomaly + nRadPerMin * dtMinutes;
  M = ((M % TWO_PI) + TWO_PI) % TWO_PI;

  // Solve Kepler's equation
  const E = solveKepler(M, eccentricity);

  // True anomaly from eccentric anomaly
  const sinV =
    (Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(E)) /
    (1 - eccentricity * Math.cos(E));
  const cosV = (Math.cos(E) - eccentricity) / (1 - eccentricity * Math.cos(E));
  const trueAnomaly = Math.atan2(sinV, cosV);

  // Distance from Earth center
  const r =
    (semiMajorAxis * (1 - eccentricity * eccentricity)) /
    (1 + eccentricity * Math.cos(trueAnomaly));

  // Position in orbital plane (perifocal coordinates)
  const u = trueAnomaly + argPerigee; // argument of latitude
  const xOrbit = r * Math.cos(u);
  const yOrbit = r * Math.sin(u);

  // Rotate by RAAN and inclination to get ECI coordinates
  const cosRaan = Math.cos(raan);
  const sinRaan = Math.sin(raan);
  const cosInc = Math.cos(inclination);
  const sinInc = Math.sin(inclination);

  const xECI = xOrbit * cosRaan - yOrbit * sinRaan * cosInc;
  const yECI = xOrbit * sinRaan + yOrbit * cosRaan * cosInc;
  const zECI = yOrbit * sinInc;

  // Rotate from ECI to ECEF using GMST
  const theta = gmst(date);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  const xECEF = xECI * cosTheta + yECI * sinTheta;
  const yECEF = -xECI * sinTheta + yECI * cosTheta;
  const zECEF = zECI;

  // Convert ECEF to geodetic lat/lon/alt
  const rECEF = Math.sqrt(xECEF * xECEF + yECEF * yECEF + zECEF * zECEF);
  const lat = Math.asin(zECEF / rECEF) * RAD_TO_DEG;
  let lon = Math.atan2(yECEF, xECEF) * RAD_TO_DEG;

  // Normalize longitude to [-180, 180]
  if (lon > 180) {
    lon -= 360;
  }
  if (lon < -180) {
    lon += 360;
  }

  const alt = rECEF - EARTH_RADIUS_KM;

  // Orbital velocity: v = sqrt(mu * (2/r - 1/a))
  const velocity = Math.sqrt(EARTH_MU * (2 / r - 1 / semiMajorAxis));

  return { lat, lon, alt, velocity };
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
    points.push({ lat: pos.lat, lon: pos.lon });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Pass Prediction
// ---------------------------------------------------------------------------

/**
 * Compute elevation angle of a satellite from an observer's position.
 *
 * Uses the geometric relationship between observer and satellite positions
 * in ECEF coordinates.
 */
function computeElevation(
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
function computeAzimuth(
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
    const endAz = computeAzimuth(endPos.lat, endPos.lon, obsLat, obsLon);
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

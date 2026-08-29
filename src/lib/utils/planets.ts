/**
 * Low-precision planetary visibility
 *
 * Implements Paul Schlyter's "How to compute planetary positions"
 * (stjarnhimlen.se/comp/ppcomp.html) — a dependency-free Keplerian model
 * good to roughly 1 arcminute for the Sun and ~1 degree for the planets
 * over the next few centuries. No ephemeris library is added; this is the
 * standard low-precision method for exactly that reason.
 *
 * Pipeline: heliocentric orbital elements (linear drift in `d`, days since
 * 2000-01-00.0 UTC) -> heliocentric ecliptic position -> geocentric
 * ecliptic position (via the Sun's geocentric position derived from Earth's
 * own elements) -> equatorial RA/Dec (rotate by the obliquity of the
 * ecliptic) -> local horizontal alt/az (via local sidereal time).
 *
 * Jupiter and Saturn include Schlyter's mutual perturbation terms (a
 * longitude correction of a few tenths of a degree). Mercury, Venus, and
 * Mars do not need them at this precision.
 *
 * Magnitude uses Schlyter's phase-angle-based formulas. Saturn's formula
 * technically includes a ring-orientation term (dU, the Saturnicentric
 * longitude difference between Sun and Earth); it is NOT implemented here
 * (that requires Saturn's ring-plane geocentric geometry, out of scope for
 * a low-precision visibility card). Saturn's magnitude below omits that
 * term and instead folds a fixed mean correction into its base constant,
 * which keeps it within Saturn's normal range but will not react to the
 * ring-plane opening/closing cycle.
 */

import SunCalc from "suncalc";

const DEG = Math.PI / 180;
const SUN_ALTITUDE_THRESHOLD = -9; // degrees; boundary between "night" and "twilight/day" for visibility windows
const PLANET_UP_ALTITUDE = 5; // degrees; minimum altitude to count as "up" for visibility classification

export type PlanetName = "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn";

export interface PlanetVisibility {
  planet: PlanetName;
  ra: number;
  dec: number;
  altitude: number;
  azimuth: number;
  elongation: number;
  magnitude: number;
  visibility: "evening" | "morning" | "all-night" | "not-visible";
}

interface OrbitalElement {
  /** value at d=0 */
  base: number;
  /** change per day */
  perDay: number;
}

interface OrbitalElements {
  N: OrbitalElement; // longitude of the ascending node
  i: OrbitalElement; // inclination
  w: OrbitalElement; // argument of perihelion
  a: OrbitalElement; // semi-major axis (AU)
  e: OrbitalElement; // eccentricity
  M: OrbitalElement; // mean anomaly
}

// Schlyter's standard orbital elements (epoch 2000-01-00.0 UTC), degrees / AU / day.
const ELEMENTS: Record<PlanetName | "Earth", OrbitalElements> = {
  Mercury: {
    N: { base: 48.3313, perDay: 3.24587e-5 },
    i: { base: 7.0047, perDay: 5.0e-8 },
    w: { base: 29.1241, perDay: 1.01444e-5 },
    a: { base: 0.387098, perDay: 0 },
    e: { base: 0.205635, perDay: 5.59e-10 },
    M: { base: 168.6562, perDay: 4.0923344368 },
  },
  Venus: {
    N: { base: 76.6799, perDay: 2.4659e-5 },
    i: { base: 3.3946, perDay: 2.75e-8 },
    w: { base: 54.891, perDay: 1.38374e-5 },
    a: { base: 0.72333, perDay: 0 },
    e: { base: 0.006773, perDay: -1.302e-9 },
    M: { base: 48.0052, perDay: 1.6021302244 },
  },
  Earth: {
    // Used only to derive the Sun's geocentric position.
    N: { base: 0, perDay: 0 },
    i: { base: 0, perDay: 0 },
    w: { base: 282.9404, perDay: 4.70935e-5 },
    a: { base: 1, perDay: 0 },
    e: { base: 0.016709, perDay: -1.151e-9 },
    M: { base: 356.047, perDay: 0.9856002585 },
  },
  Mars: {
    N: { base: 49.5574, perDay: 2.11081e-5 },
    i: { base: 1.8497, perDay: -1.78e-8 },
    w: { base: 286.5016, perDay: 2.92961e-5 },
    a: { base: 1.523688, perDay: 0 },
    e: { base: 0.093405, perDay: 2.516e-9 },
    M: { base: 18.6021, perDay: 0.5240207766 },
  },
  Jupiter: {
    N: { base: 100.4542, perDay: 2.76854e-5 },
    i: { base: 1.303, perDay: -1.557e-7 },
    w: { base: 273.8777, perDay: 1.64505e-5 },
    a: { base: 5.20256, perDay: 0 },
    e: { base: 0.048498, perDay: 4.469e-9 },
    M: { base: 19.895, perDay: 0.0830853001 },
  },
  Saturn: {
    N: { base: 113.6634, perDay: 2.3898e-5 },
    i: { base: 2.4886, perDay: -1.081e-7 },
    w: { base: 339.3939, perDay: 2.97661e-5 },
    a: { base: 9.55475, perDay: 0 },
    e: { base: 0.055546, perDay: -9.499e-9 },
    M: { base: 316.967, perDay: 0.0334442282 },
  },
};

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/** Days since 2000-01-00.0 UTC (Schlyter's epoch; ~= 2000-01-01.0 minus 1 day). */
function daysSinceEpoch(date: Date): number {
  const epoch = Date.UTC(2000, 0, 0, 0, 0, 0);
  return (date.getTime() - epoch) / 86_400_000;
}

/** Normalize degrees to [0, 360). */
function rev(deg: number): number {
  return deg - Math.floor(deg / 360) * 360;
}

function elementAt(el: OrbitalElement, d: number): number {
  return el.base + el.perDay * d;
}

/** Solve Kepler's equation M = E - e*sin(E) for E (radians), via Newton iteration. */
function solveEccentricAnomaly(meanAnomalyDeg: number, e: number): number {
  const M = meanAnomalyDeg * DEG;
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let i = 0; i < 10; i++) {
    const delta = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += delta;
    if (Math.abs(delta) < 1e-9) break;
  }
  return E;
}

/** Jupiter's longitude perturbation from mutual Jupiter-Saturn interaction, in degrees. */
function jupiterPerturbationDeg(d: number): number {
  const Mj = rev(elementAt(ELEMENTS.Jupiter.M, d)) * DEG;
  const Ms = rev(elementAt(ELEMENTS.Saturn.M, d)) * DEG;
  return (
    -0.332 * Math.sin(2 * Mj - 5 * Ms - 67.6 * DEG) -
    0.056 * Math.sin(2 * Mj - 2 * Ms + 21 * DEG) +
    0.042 * Math.sin(3 * Mj - 5 * Ms + 21 * DEG) -
    0.036 * Math.sin(Mj - 2 * Ms) +
    0.022 * Math.cos(Mj - Ms) +
    0.023 * Math.sin(2 * Mj - 3 * Ms + 52 * DEG) -
    0.016 * Math.sin(Mj - 5 * Ms - 69 * DEG)
  );
}

/** Saturn's longitude perturbation from mutual Jupiter-Saturn interaction, in degrees. */
function saturnPerturbationDeg(d: number): number {
  const Mj = rev(elementAt(ELEMENTS.Jupiter.M, d)) * DEG;
  const Ms = rev(elementAt(ELEMENTS.Saturn.M, d)) * DEG;
  return (
    0.812 * Math.sin(2 * Mj - 5 * Ms - 67.6 * DEG) -
    0.229 * Math.cos(2 * Mj - 4 * Ms - 2 * DEG) +
    0.119 * Math.sin(Mj - 2 * Ms - 3 * DEG) +
    0.046 * Math.sin(2 * Mj - 6 * Ms - 69 * DEG) +
    0.014 * Math.sin(Mj - 3 * Ms + 32 * DEG)
  );
}

/** Heliocentric ecliptic position of a planet (AU), including Jupiter/Saturn perturbations. */
function heliocentricPosition(
  planet: PlanetName,
  d: number,
): Vector3 & { r: number } {
  const el = ELEMENTS[planet];
  const N = rev(elementAt(el.N, d)) * DEG;
  const i = rev(elementAt(el.i, d)) * DEG;
  const w = rev(elementAt(el.w, d)) * DEG;
  const a = elementAt(el.a, d);
  const e = elementAt(el.e, d);
  const M = rev(elementAt(el.M, d));

  const E = solveEccentricAnomaly(M, e);
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);

  // Ecliptic latitude/longitude from the orbital-plane projection (standard
  // Schlyter rotation by node N and inclination i).
  const vw = v + w;
  const xh =
    r * (Math.cos(N) * Math.cos(vw) - Math.sin(N) * Math.sin(vw) * Math.cos(i));
  const yh =
    r * (Math.sin(N) * Math.cos(vw) + Math.cos(N) * Math.sin(vw) * Math.cos(i));
  const zh = r * (Math.sin(vw) * Math.sin(i));
  const latEcl = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh));

  // The true (rotated) ecliptic longitude, not the orbital-plane angle vw —
  // perturbations below are longitude corrections applied to this.
  let lonEcl = Math.atan2(yh, xh);
  if (planet === "Jupiter") lonEcl += jupiterPerturbationDeg(d) * DEG;
  if (planet === "Saturn") lonEcl += saturnPerturbationDeg(d) * DEG;

  return {
    x: r * Math.cos(lonEcl) * Math.cos(latEcl),
    y: r * Math.sin(lonEcl) * Math.cos(latEcl),
    z: r * Math.sin(latEcl),
    r,
  };
}

/** Sun's geocentric ecliptic position (AU), derived from Earth's heliocentric elements. */
function sunPosition(d: number): Vector3 & { r: number } {
  const el = ELEMENTS.Earth;
  const e = elementAt(el.e, d);
  const M = rev(elementAt(el.M, d));
  const w = rev(elementAt(el.w, d));

  const E = solveEccentricAnomaly(M, e);
  const xv = Math.cos(E) - e;
  const yv = Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv) / DEG;
  const r = Math.sqrt(xv * xv + yv * yv);
  const lonSun = rev(v + w) * DEG;

  return { x: r * Math.cos(lonSun), y: r * Math.sin(lonSun), z: 0, r };
}

/** Mean obliquity of the ecliptic, degrees (Schlyter's linear approximation). */
function obliquityDeg(d: number): number {
  return 23.4393 - 3.563e-7 * d;
}

function toEquatorial(v: Vector3, obliquityDegrees: number): { ra: number; dec: number } {
  const obl = obliquityDegrees * DEG;
  const xe = v.x;
  const ye = v.y * Math.cos(obl) - v.z * Math.sin(obl);
  const ze = v.y * Math.sin(obl) + v.z * Math.cos(obl);
  return {
    ra: rev(Math.atan2(ye, xe) / DEG),
    dec: Math.atan2(ze, Math.sqrt(xe * xe + ye * ye)) / DEG,
  };
}

/** Greenwich mean sidereal time, degrees. */
function gmstDeg(date: Date, d: number): number {
  const earthEl = ELEMENTS.Earth;
  const sunMeanLongitude = rev(rev(elementAt(earthEl.M, d)) + rev(elementAt(earthEl.w, d)));
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gmst0 = rev(sunMeanLongitude + 180);
  return rev(gmst0 + utcHours * 15.041068); // 360.98565deg/day sidereal rate, per hour
}

/** Topocentric altitude/azimuth (degrees, azimuth clockwise from North) for an equatorial position. */
function toHorizontal(
  raDeg: number,
  decDeg: number,
  lat: number,
  lon: number,
  date: Date,
  d: number,
): { altitude: number; azimuth: number } {
  const lst = rev(gmstDeg(date, d) + lon);
  const HA = rev(lst - raDeg) * DEG;
  const dec = decDeg * DEG;
  const latR = lat * DEG;

  const altitude = Math.asin(
    Math.sin(dec) * Math.sin(latR) + Math.cos(dec) * Math.cos(latR) * Math.cos(HA),
  );
  const azimuthFromSouth = Math.atan2(
    Math.sin(HA),
    Math.cos(HA) * Math.sin(latR) - Math.tan(dec) * Math.cos(latR),
  );

  return {
    altitude: altitude / DEG,
    azimuth: rev(azimuthFromSouth / DEG + 180),
  };
}

/** Schlyter's phase-angle-based apparent magnitude. See module docblock re: Saturn's ring term. */
function magnitude(planet: PlanetName, r: number, delta: number, phaseAngleDeg: number): number {
  const distanceTerm = 5 * Math.log10(r * delta);
  const fv = phaseAngleDeg;
  switch (planet) {
    case "Mercury":
      return -0.36 + distanceTerm + 0.027 * fv + 2.2e-13 * fv ** 6;
    case "Venus":
      return -4.34 + distanceTerm + 0.013 * fv + 4.2e-7 * fv ** 3;
    case "Mars":
      return -1.51 + distanceTerm + 0.016 * fv;
    case "Jupiter":
      return -9.25 + distanceTerm + 0.014 * fv;
    case "Saturn":
      // Ring term (0.044 * dU) omitted; folded a fixed mean correction into
      // the base constant instead. See module docblock.
      return -9.0 + distanceTerm + 0.021 * fv;
  }
}

interface GeocentricPlanet {
  planet: PlanetName;
  ra: number;
  dec: number;
  distanceAu: number;
  elongationDeg: number;
  phaseAngleDeg: number;
}

const PLANET_NAMES: PlanetName[] = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"];

function computeGeocentric(planet: PlanetName, d: number, sun: Vector3 & { r: number }): GeocentricPlanet {
  const helio = heliocentricPosition(planet, d);
  const geo: Vector3 = { x: helio.x + sun.x, y: helio.y + sun.y, z: helio.z + sun.z };
  const delta = Math.sqrt(geo.x * geo.x + geo.y * geo.y + geo.z * geo.z);

  const obl = obliquityDeg(d);
  const { ra, dec } = toEquatorial(geo, obl);

  const dot = geo.x * sun.x + geo.y * sun.y + geo.z * sun.z;
  const cosElongation = Math.max(-1, Math.min(1, dot / (delta * sun.r)));
  const elongationDeg = Math.acos(cosElongation) / DEG;

  const cosPhase = (helio.r * helio.r + delta * delta - sun.r * sun.r) / (2 * helio.r * delta);
  const phaseAngleDeg = Math.acos(Math.max(-1, Math.min(1, cosPhase))) / DEG;

  return { planet, ra, dec, distanceAu: delta, elongationDeg, phaseAngleDeg };
}

/** Sun altitude in degrees (via suncalc) — used only for the visibility window search. */
function sunAltitudeDeg(date: Date, lat: number, lon: number): number {
  return SunCalc.getPosition(date, lat, lon).altitude / DEG;
}

/**
 * Find the instant, scanning hourly then bisecting to the minute, where the
 * sun's altitude crosses `SUN_ALTITUDE_THRESHOLD` in the given direction
 * within [searchStart, searchStart + maxHours) hours.
 */
function findSunCrossing(
  searchStart: Date,
  maxHours: number,
  direction: "descending" | "ascending",
  lat: number,
  lon: number,
): Date | null {
  const hourMs = 3_600_000;
  let prevTime = searchStart;
  let prevAlt = sunAltitudeDeg(prevTime, lat, lon);

  for (let h = 1; h <= maxHours; h++) {
    const time = new Date(searchStart.getTime() + h * hourMs);
    const alt = sunAltitudeDeg(time, lat, lon);
    const crossed =
      direction === "descending"
        ? prevAlt > SUN_ALTITUDE_THRESHOLD && alt <= SUN_ALTITUDE_THRESHOLD
        : prevAlt <= SUN_ALTITUDE_THRESHOLD && alt > SUN_ALTITUDE_THRESHOLD;

    if (crossed) {
      let lo = prevTime.getTime();
      let hi = time.getTime();
      for (let i = 0; i < 12; i++) {
        const mid = Math.floor((lo + hi) / 2);
        const midAlt = sunAltitudeDeg(new Date(mid), lat, lon);
        const midBelow = midAlt <= SUN_ALTITUDE_THRESHOLD;
        if (direction === "descending" ? midBelow : !midBelow) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      return new Date(hi);
    }

    prevTime = time;
    prevAlt = alt;
  }

  return null;
}

/** Local solar midnight (suncalc "nadir") nearest to `at`. */
function nearestNadir(at: Date, lat: number, lon: number): Date {
  const dayMs = 86_400_000;
  const candidates = [-1, 0, 1].map(
    (offset) => SunCalc.getTimes(new Date(at.getTime() + offset * dayMs), lat, lon).nadir,
  );
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate.getTime() - at.getTime()) < Math.abs(best.getTime() - at.getTime())
      ? candidate
      : best,
  );
}

function classifyVisibility(
  ra: number,
  dec: number,
  elongationDeg: number,
  midnight: Date,
  eveningTime: Date | null,
  morningTime: Date | null,
  lat: number,
  lon: number,
): "evening" | "morning" | "all-night" | "not-visible" {
  const d = daysSinceEpoch(midnight); // approximation shared across the night's 3 samples is fine at this precision
  const isUp = (time: Date) => toHorizontal(ra, dec, lat, lon, time, d).altitude > PLANET_UP_ALTITUDE;

  const eveningUp = eveningTime !== null && isUp(eveningTime);
  const morningUp = morningTime !== null && isUp(morningTime);

  if (eveningUp && morningUp) return "all-night";
  if (eveningUp) return "evening";
  if (morningUp) return "morning";
  // Fall back to elongation-driven all-night call for circumpolar cases where
  // no -9deg sun crossing exists within the search window.
  if ((eveningTime === null || morningTime === null) && elongationDeg > 150 && isUp(midnight)) {
    return "all-night";
  }
  return "not-visible";
}

export function getPlanetVisibilities(at: Date, lat: number, lon: number): PlanetVisibility[] {
  const d = daysSinceEpoch(at);
  const sun = sunPosition(d);

  const midnight = nearestNadir(at, lat, lon);
  const eveningTime = findSunCrossing(new Date(midnight.getTime() - 14 * 3_600_000), 14, "descending", lat, lon);
  const morningTime = findSunCrossing(midnight, 14, "ascending", lat, lon);

  return PLANET_NAMES.map((planet) => {
    const geo = computeGeocentric(planet, d, sun);
    const horizontal = toHorizontal(geo.ra, geo.dec, lat, lon, at, d);
    const mag = magnitude(planet, heliocentricPosition(planet, d).r, geo.distanceAu, geo.phaseAngleDeg);
    const visibility = classifyVisibility(
      geo.ra,
      geo.dec,
      geo.elongationDeg,
      midnight,
      eveningTime,
      morningTime,
      lat,
      lon,
    );

    return {
      planet,
      ra: geo.ra,
      dec: geo.dec,
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      elongation: geo.elongationDeg,
      magnitude: mag,
      visibility,
    };
  });
}

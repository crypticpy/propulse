/**
 * IGRF-13 Centered Dipole Geomagnetic Coordinate Transformations
 *
 * Provides coordinate transformations between geographic (geodetic) and
 * geomagnetic (centered dipole) coordinate systems for amateur radio
 * propagation analysis.
 *
 * The Earth's magnetic field is approximately a dipole, but the dipole axis
 * does not align with the geographic (rotation) axis. The geomagnetic poles
 * are offset from the geographic poles by roughly 10 degrees. This module
 * uses the IGRF-13 (International Geomagnetic Reference Field, 13th generation)
 * centered dipole approximation to transform between coordinate systems.
 *
 * For epoch 2025, the IGRF-13 geomagnetic north pole is located at
 * approximately 80.65°N, 72.68°W (287.32°E). This is the point where
 * the best-fit centered dipole axis intersects the Earth's surface in
 * the northern hemisphere.
 *
 * The centered dipole model is sufficient for:
 * - Auroral zone determination (geomagnetic latitude > 60°)
 * - Polar cap classification (geomagnetic latitude > 75°)
 * - L-shell / invariant latitude calculations for absorption modeling
 * - Propagation path analysis through auroral/polar regions
 *
 * The transformation is a rigid rotation of the coordinate system:
 * 1. Convert geographic (lat, lon) to Cartesian (x, y, z) on the unit sphere
 * 2. Apply rotation matrix R = Ry(poleLat - 90°) * Rz(-poleLon)
 *    to align the geomagnetic dipole axis with the z-axis
 * 3. Convert rotated Cartesian back to spherical (geomagLat, geomagLon)
 *
 * No external dependencies. All trigonometric constants are pre-computed
 * at module load time for performance.
 *
 * @see https://www.ngdc.noaa.gov/IAGA/vmod/igrf.html
 */

// ─── Conversion Constants ────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ─── IGRF-13 Geomagnetic Dipole Pole (Epoch 2025) ───────────────────────────

const POLE_LAT_DEG = 80.65;
const POLE_LON_DEG = -72.68;

// ─── Pre-computed Trigonometric Constants ─────────────────────────────────────

const POLE_LAT_RAD = POLE_LAT_DEG * DEG_TO_RAD;
const POLE_LON_RAD = POLE_LON_DEG * DEG_TO_RAD;

const SIN_POLE_LAT = Math.sin(POLE_LAT_RAD);
const COS_POLE_LAT = Math.cos(POLE_LAT_RAD);
const SIN_POLE_LON = Math.sin(POLE_LON_RAD);
const COS_POLE_LON = Math.cos(POLE_LON_RAD);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GeomagneticCoordinate {
  /** Geomagnetic latitude in degrees (-90 to 90) */
  geomagLat: number;
  /** Geomagnetic longitude in degrees (-180 to 180) */
  geomagLon: number;
}

export interface GeographicCoordinate {
  /** Geographic latitude in degrees (-90 to 90) */
  lat: number;
  /** Geographic longitude in degrees (-180 to 180) */
  lon: number;
}

// ─── Core Transformation Functions ──────────────────────────────────────────

/**
 * Transform geographic coordinates to geomagnetic (centered dipole) coordinates.
 *
 * The rotation is composed of two steps:
 * 1. Rz(-poleLon): Rotate about z-axis to place the pole meridian at 0° longitude
 * 2. Ry(poleLat - 90°): Tilt the z-axis from geographic north to dipole north
 */
export function geoToGeomagnetic(
  lat: number,
  lon: number,
): GeomagneticCoordinate {
  const latRad = lat * DEG_TO_RAD;
  const lonRad = lon * DEG_TO_RAD;

  const cosLat = Math.cos(latRad);
  const sinLat = Math.sin(latRad);
  const cosLon = Math.cos(lonRad);
  const sinLon = Math.sin(lonRad);

  const xGeo = cosLat * cosLon;
  const yGeo = cosLat * sinLon;
  const zGeo = sinLat;

  // Apply Rz(-poleLon)
  const xRz = xGeo * COS_POLE_LON + yGeo * SIN_POLE_LON;
  const yRz = -xGeo * SIN_POLE_LON + yGeo * COS_POLE_LON;
  const zRz = zGeo;

  // Apply Ry(poleLat - 90°)
  // cos(poleLat - 90°) = sin(poleLat), sin(poleLat - 90°) = -cos(poleLat)
  const xMag = xRz * SIN_POLE_LAT - zRz * COS_POLE_LAT;
  const yMag = yRz;
  const zMag = xRz * COS_POLE_LAT + zRz * SIN_POLE_LAT;

  const geomagLatRad = Math.asin(Math.max(-1, Math.min(1, zMag)));
  const geomagLonRad = Math.atan2(yMag, xMag);

  let geomagLonDeg = geomagLonRad * RAD_TO_DEG;
  if (geomagLonDeg > 180) geomagLonDeg -= 360;
  if (geomagLonDeg < -180) geomagLonDeg += 360;

  return {
    geomagLat: geomagLatRad * RAD_TO_DEG,
    geomagLon: geomagLonDeg,
  };
}

/**
 * Transform geomagnetic (centered dipole) coordinates back to geographic coordinates.
 * Inverse of geoToGeomagnetic: R^(-1) = Rz(+poleLon) * Ry(90° - poleLat).
 */
export function geomagneticToGeo(
  geomagLat: number,
  geomagLon: number,
): GeographicCoordinate {
  const geomagLatRad = geomagLat * DEG_TO_RAD;
  const geomagLonRad = geomagLon * DEG_TO_RAD;

  const cosGLat = Math.cos(geomagLatRad);
  const sinGLat = Math.sin(geomagLatRad);
  const cosGLon = Math.cos(geomagLonRad);
  const sinGLon = Math.sin(geomagLonRad);

  const xMag = cosGLat * cosGLon;
  const yMag = cosGLat * sinGLon;
  const zMag = sinGLat;

  // Inverse Ry
  const xRy = xMag * SIN_POLE_LAT + zMag * COS_POLE_LAT;
  const yRy = yMag;
  const zRy = -xMag * COS_POLE_LAT + zMag * SIN_POLE_LAT;

  // Inverse Rz
  const xGeo = xRy * COS_POLE_LON - yRy * SIN_POLE_LON;
  const yGeo = xRy * SIN_POLE_LON + yRy * COS_POLE_LON;
  const zGeo = zRy;

  const latRad = Math.asin(Math.max(-1, Math.min(1, zGeo)));
  const lonRad = Math.atan2(yGeo, xGeo);

  let lonDeg = lonRad * RAD_TO_DEG;
  if (lonDeg > 180) lonDeg -= 360;
  if (lonDeg < -180) lonDeg += 360;

  return {
    lat: latRad * RAD_TO_DEG,
    lon: lonDeg,
  };
}

// ─── Convenience Functions ──────────────────────────────────────────────────

/**
 * Get the geomagnetic latitude for a geographic location.
 * Most commonly needed value for propagation analysis.
 */
export function getGeomagneticLatitude(lat: number, lon: number): number {
  return geoToGeomagnetic(lat, lon).geomagLat;
}

/**
 * Determine whether a geographic location falls within the auroral zone (|geomagLat| > 60°).
 */
export function isAuroralZone(lat: number, lon: number): boolean {
  return Math.abs(getGeomagneticLatitude(lat, lon)) > 60;
}

/**
 * Determine whether a geographic location falls within the polar cap (|geomagLat| > 75°).
 */
export function isPolarCap(lat: number, lon: number): boolean {
  return Math.abs(getGeomagneticLatitude(lat, lon)) > 75;
}

// ─── Invariant Latitude & L-Shell ───────────────────────────────────────────

/**
 * Calculate the invariant latitude for a geographic location.
 * For a centered dipole, invariant latitude equals |geomagnetic latitude|.
 */
export function getInvariantLatitude(lat: number, lon: number): number {
  return Math.abs(getGeomagneticLatitude(lat, lon));
}

// ─── Great Circle Path Analysis ─────────────────────────────────────────────

const DEFAULT_PATH_SAMPLES = 36;

/**
 * Determine whether a great circle path crosses the auroral zone at any point.
 */
export function pathCrossesAuroralZone(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numSamples: number = DEFAULT_PATH_SAMPLES,
): boolean {
  const points = sampleGreatCirclePath(
    startLat,
    startLon,
    endLat,
    endLon,
    numSamples,
  );
  for (const point of points) {
    if (Math.abs(getGeomagneticLatitude(point.lat, point.lon)) > 60) {
      return true;
    }
  }
  return false;
}

/**
 * Find the maximum absolute geomagnetic latitude along a great circle path.
 */
export function getMaxGeomagneticLatOnPath(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numSamples: number = DEFAULT_PATH_SAMPLES,
): number {
  const points = sampleGreatCirclePath(
    startLat,
    startLon,
    endLat,
    endLon,
    numSamples,
  );
  let maxAbsGeomagLat = 0;
  for (const point of points) {
    const absGeomagLat = Math.abs(getGeomagneticLatitude(point.lat, point.lon));
    if (absGeomagLat > maxAbsGeomagLat) {
      maxAbsGeomagLat = absGeomagLat;
    }
  }
  return maxAbsGeomagLat;
}

// ─── Internal: Great Circle Sampling via Slerp ──────────────────────────────

function sampleGreatCirclePath(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numSamples: number,
): Array<{ lat: number; lon: number }> {
  const phi1 = startLat * DEG_TO_RAD;
  const lambda1 = startLon * DEG_TO_RAD;
  const phi2 = endLat * DEG_TO_RAD;
  const lambda2 = endLon * DEG_TO_RAD;

  const cosPhi1 = Math.cos(phi1);
  const sinPhi1 = Math.sin(phi1);
  const cosLam1 = Math.cos(lambda1);
  const sinLam1 = Math.sin(lambda1);

  const cosPhi2 = Math.cos(phi2);
  const sinPhi2 = Math.sin(phi2);
  const cosLam2 = Math.cos(lambda2);
  const sinLam2 = Math.sin(lambda2);

  const x0 = cosPhi1 * cosLam1;
  const y0 = cosPhi1 * sinLam1;
  const z0 = sinPhi1;

  const x1 = cosPhi2 * cosLam2;
  const y1 = cosPhi2 * sinLam2;
  const z1 = sinPhi2;

  const dot = Math.max(-1, Math.min(1, x0 * x1 + y0 * y1 + z0 * z1));
  const omega = Math.acos(dot);

  const points: Array<{ lat: number; lon: number }> = [];

  if (omega < 1e-10) {
    for (let i = 0; i <= numSamples; i++) {
      points.push({ lat: startLat, lon: startLon });
    }
    return points;
  }

  const sinOmega = Math.sin(omega);

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const a = Math.sin((1 - t) * omega) / sinOmega;
    const b = Math.sin(t * omega) / sinOmega;

    const x = a * x0 + b * x1;
    const y = a * y0 + b * y1;
    const z = a * z0 + b * z1;

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * RAD_TO_DEG;
    const lon = Math.atan2(y, x) * RAD_TO_DEG;

    points.push({ lat, lon });
  }

  return points;
}

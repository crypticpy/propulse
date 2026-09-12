/**
 * Geomagnetic field model and Rawer modified dip latitude.
 *
 * A faithful port of `P533/Src/P533/Magfit.c` at commit
 * cd172be56dc04b154e5d2fa91cbaa6ecf5284305 of
 * https://github.com/ITU-R-Study-Group-3/ITU-R-HF, which implements ITU-R
 * P.1239 section 2 equations (5) to (11) and is itself a transcription of
 * `MAGFIT.FOR` from REC533.
 *
 * This is not an interchangeable choice of field model. The CCIR numerical map
 * coefficients were fitted in a coordinate whose latitude variable is
 * `x = sin(modip)` with `modip` derived from *this* 6-degree expansion at
 * *300 km*, with the dip in *radians*. Substituting IGRF, or evaluating at
 * 100 km, or feeding the dip in degrees, all reproduce the ITU grid two to
 * three orders of magnitude worse:
 *
 *   magfit @ 300 km, dip in radians   max |dfoF2| = 1.0e-4 MHz   (ships)
 *   magfit @ 280 km / 320 km           max |dfoF2| = 2.4e-2 MHz
 *
 * Measured over all 16,796,736 grid points; see
 * `ml/propagation_validation/ionosphere_coefficients.py`.
 */

/** IUGG mean Earth radius in km, as the reference defines it. */
const R0_KM = 6371.009;

/** The reference's truncated degree/radian constants, kept for bit-parity. */
export const D2R = 0.0174532925;
export const R2D = 57.2957795;

// Gauss coefficients of the 6-degree field model, [m][n].
const G = [
  [0.0, 0.304112, 0.024035, -0.031518, -0.041794, 0.016256, -0.019523],
  [0.0, 0.021474, -0.051253, 0.06213, -0.045298, -0.034407, -0.004853],
  [0.0, 0.0, -0.013381, -0.024898, -0.021795, -0.019447, 0.003212],
  [0.0, 0.0, 0.0, -0.006496, 0.007008, -0.000608, 0.021413],
  [0.0, 0.0, 0.0, 0.0, -0.002044, 0.002775, 0.001051],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.000697, 0.000227],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.001115],
] as const;

const H = [
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.0, -0.057989, 0.033124, 0.01487, -0.011825, -0.000796, -0.005758],
  [0.0, 0.0, -0.001579, -0.004075, 0.010006, -0.002, -0.008735],
  [0.0, 0.0, 0.0, 0.00021, 0.00043, 0.004597, -0.003406],
  [0.0, 0.0, 0.0, 0.0, 0.001385, 0.002421, -0.000118],
  [0.0, 0.0, 0.0, 0.0, 0.0, -0.001218, -0.001116],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.000325],
] as const;

// Associated Legendre recursion coefficients, [m][n].
const CT = [
  [0.0, 0.0, 0.33333333, 0.266666666, 0.25714286, 0.25396825, 0.25252525],
  [0.0, 0.0, 0.0, 0.2, 0.22857142, 0.23809523, 0.24242424],
  [0.0, 0.0, 0.0, 0.0, 0.14285714, 0.19047619, 0.21212121],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.11111111, 0.16161616],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.09090909],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
] as const;

/**
 * `cos(latitude)` appears in a denominator, so the exact poles are singular in
 * the reference too (it divides by zero and produces an infinity that `atan`
 * happens to absorb). Nudging by half a micro-degree keeps the geometry finite
 * without moving any value a consumer could observe: the map's own grid step is
 * 1.5 degrees.
 */
const POLE_EPSILON_RAD = 1e-8;

export interface MagneticField {
  /** Magnetic dip (inclination) in radians, positive downward in the north. */
  readonly dipRad: number;
  /** Electron gyrofrequency in MHz. */
  readonly gyrofrequencyMHz: number;
}

/**
 * Magnetic dip and gyrofrequency at a point and height.
 *
 * @param latitudeRad geographic latitude, radians, positive north
 * @param longitudeRad geographic longitude, radians, positive east
 * @param heightKm height above the surface, km
 */
export function magneticField(
  latitudeRad: number,
  longitudeRad: number,
  heightKm: number,
): MagneticField {
  const limit = Math.PI / 2 - POLE_EPSILON_RAD;
  const lat = Math.min(Math.max(latitudeRad, -limit), limit);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const ar = R0_KM / (R0_KM + heightKm);

  // P and DP are indexed [m][n]; the recursion reads P[m-1][n-1], which for
  // m = n = 1 is P[0][0] = 1, so the seed must be in place before the loop.
  const P: number[][] = Array.from({ length: 7 }, () =>
    new Array<number>(7).fill(0),
  );
  const DP: number[][] = Array.from({ length: 7 }, () =>
    new Array<number>(7).fill(0),
  );
  P[0][0] = 1.0;

  let fx = 0;
  let fy = 0;
  let fz = 0;

  for (let n = 1; n <= 6; n += 1) {
    let sumZ = 0;
    let sumX = 0;
    let sumY = 0;
    for (let m = 0; m <= n; m += 1) {
      if (n === m) {
        P[m][n] = cosLat * P[m - 1][n - 1];
        DP[m][n] = cosLat * DP[m - 1][n - 1] + sinLat * P[m - 1][n - 1];
      } else if (n !== 1) {
        P[m][n] = sinLat * P[m][n - 1] - CT[m][n] * P[m][n - 2];
        DP[m][n] =
          sinLat * DP[m][n - 1] -
          cosLat * P[m][n - 1] -
          CT[m][n] * DP[m][n - 2];
      } else {
        P[m][n] = sinLat * P[m][n - 1];
        DP[m][n] = sinLat * DP[m][n - 1] - cosLat * P[m][n - 1];
      }
      const cs =
        G[m][n] * Math.cos(m * longitudeRad) +
        H[m][n] * Math.sin(m * longitudeRad);
      const sn =
        G[m][n] * Math.sin(m * longitudeRad) -
        H[m][n] * Math.cos(m * longitudeRad);
      sumZ += P[m][n] * cs;
      sumX += DP[m][n] * cs;
      sumY += m * P[m][n] * sn;
    }
    const scale = ar ** (n + 2);
    fz += scale * (n + 1) * sumZ;
    fx -= scale * sumX;
    fy += scale * sumY;
  }

  const horizontalSq = fx ** 2 + (fy / cosLat) ** 2;
  return {
    dipRad: Math.atan(fz / Math.sqrt(horizontalSq)),
    gyrofrequencyMHz: 2.8 * Math.sqrt(horizontalSq + fz ** 2),
  };
}

/** The height at which the CCIR map's modip coordinate is defined. */
export const MAP_DIP_HEIGHT_KM = 300;

/**
 * The height ITU-R P.533-14 evaluates the absorption gyrofrequency at, km.
 *
 * This is not `MAP_DIP_HEIGHT_KM` and must never be confused with it. The map's
 * modip coordinate is a property of the CCIR foF2 fit and is defined at 300 km;
 * the longitudinal gyrofrequency of equation (20) is a property of the D region
 * and is defined at 100 km. Two heights, two quantities, two calls.
 */
export const D_REGION_FIELD_HEIGHT_KM = 100;

/**
 * Longitudinal gyrofrequency `fL = |fH sin(dip)|`, MHz.
 *
 * The `(f + fL)^2` divisor of ITU-R P.533-14 equation (20). It is a property of
 * where the D-region crossing is, so a circuit whose crossings straddle tens of
 * degrees of dip has a different value at each of them.
 *
 * Pure and asset-free: it reads the same 6-degree expansion as the dip, so a
 * caller needs no provider, no fetch and no promise to obtain it.
 *
 * @param latitudeRad geographic latitude, radians, positive north
 * @param longitudeRad geographic longitude, radians, positive east
 * @param heightKm height above the surface, km. Defaults to the 100 km the
 *   recommendation specifies; the 300 km value is a measurably different
 *   number and is not a substitute.
 */
export function longitudinalGyrofrequencyMHz(
  latitudeRad: number,
  longitudeRad: number,
  heightKm: number = D_REGION_FIELD_HEIGHT_KM,
): number {
  const { dipRad, gyrofrequencyMHz } = magneticField(
    latitudeRad,
    longitudeRad,
    heightKm,
  );
  return Math.abs(gyrofrequencyMHz * Math.sin(dipRad));
}

/**
 * Rawer modified dip latitude, `mu = atan(I / sqrt(cos(phi)))`.
 *
 * `I` is in radians here. That is not the textbook form, which uses degrees,
 * but it is what reproduces the CCIR map, and parity with the map is the
 * requirement. See the module header for the measurement.
 */
export function modifiedDipLatitudeRad(
  latitudeRad: number,
  longitudeRad: number,
): number {
  const limit = Math.PI / 2 - POLE_EPSILON_RAD;
  const lat = Math.min(Math.max(latitudeRad, -limit), limit);
  const { dipRad } = magneticField(lat, longitudeRad, MAP_DIP_HEIGHT_KM);
  return Math.atan(dipRad / Math.sqrt(Math.cos(lat)));
}

/**
 * The CCIR numerical map: ITU-R P.1239 Annex 1 (Jones-Gallet) spherical
 * harmonic expansion for foF2 and M(3000)F2, plus the ITU-R P.1144 bilinear
 * grid interpolation that ITU-R P.533-14 actually performs on top of it.
 *
 *   Omega(phi, lambda, T) = sum_{j<K} a_j(T) * G_j(phi, lambda)
 *   a_j(T)                = U_{j,0} + sum_{k=1..H} [ U_{j,2k-1} sin(kT)
 *                                                  + U_{j,2k}   cos(kT) ]
 *   T                     = (15 * UT - 180) degrees
 *
 * with K = 76, H = 6 for foF2 and K = 49, H = 4 for M(3000)F2.
 *
 * The geographic functions are
 *
 *   G_0 .. G_{QF[0]}      = x^0 .. x^{QF[0]}
 *   then for m = 1..K1-1, for n = 0..QF[m], interleaved:
 *       x^n cos^m(phi) cos(m lambda),  x^n cos^m(phi) sin(m lambda)
 *
 * where x = sin(modip). The term counts QF and QM, the interleaving order and
 * the modip definition are not assumed: the build script rebuilds all
 * 16,796,736 values of the ITU's own `ionos%02d.bin` grids from these
 * coefficients and this code's basis, and gates on the residual. See the
 * measured table in `assets/manifest.json`.
 *
 * WHY THE MAP AND NOT THE GRID. The ITU reference ships 134 MB of pre-rendered
 * 1.5-degree grids. A per-point FFT over their 24 hourly slots shows foF2 has
 * exactly 13 non-zero time harmonics and M(3000)F2 exactly 9, to float32 noise:
 * the grids *are* a rendering of these coefficients. 274 kB of float64
 * coefficients is therefore not an approximation of the grids, it is their
 * source, and it reproduces them to 1.0e-4 MHz.
 */

import { D2R, modifiedDipLatitudeRad } from "./modip";
import type { ReadonlyFloat64Array } from "./types";

/** Latitude-term counts per longitude harmonic, foF2 (K = 76) and M(3000)F2 (K = 49). */
export const QF = [11, 11, 8, 4, 1, 0, 0, 0, 0] as const;
export const QM = [6, 7, 5, 2, 1, 0, 0] as const;

export const FOF2_GEOGRAPHIC_TERMS = 76;
export const FOF2_TIME_TERMS = 13;
export const M3000F2_GEOGRAPHIC_TERMS = 49;
export const M3000F2_TIME_TERMS = 9;

/** The 1.5-degree grid P.533 interpolates: 241 longitudes, 121 latitudes. */
export const GRID_INCREMENT_DEG = 1.5;
export const GRID_LONGITUDES = 241;
export const GRID_LATITUDES = 121;

const GRID_INCREMENT_RAD = GRID_INCREMENT_DEG * D2R;
const ZERO_LATITUDE_INDEX = 60;
const ZERO_LONGITUDE_INDEX = 120;

/**
 * P.533 caps the solar index before both the map blend and foE. Beyond R12 160
 * the linear-in-R12 assumption of P.1239 is not supported by the fitted maps.
 */
export const MAX_R12 = 160;

export type MapParameter = "foF2" | "m3000F2";

/**
 * Geographic basis functions at a point, for one parameter. Depends only on
 * position, so it is the expensive part worth reusing across hours and months.
 */
export function geographicFunctions(
  latitudeRad: number,
  longitudeRad: number,
  parameter: MapParameter,
): Float64Array {
  const q: readonly number[] = parameter === "foF2" ? QF : QM;
  const harmonics = q.length;
  const size =
    parameter === "foF2" ? FOF2_GEOGRAPHIC_TERMS : M3000F2_GEOGRAPHIC_TERMS;
  const out = new Float64Array(size);

  const x = Math.sin(modifiedDipLatitudeRad(latitudeRad, longitudeRad));
  const cosLat = Math.cos(latitudeRad);

  let index = 0;
  let power = 1;
  for (let n = 0; n <= q[0]; n += 1) {
    out[index] = power;
    index += 1;
    power *= x;
  }
  let cosLatPower = 1;
  for (let m = 1; m < harmonics; m += 1) {
    cosLatPower *= cosLat;
    const c = Math.cos(m * longitudeRad);
    const s = Math.sin(m * longitudeRad);
    let xPower = 1;
    for (let n = 0; n <= q[m]; n += 1) {
      const base = xPower * cosLatPower;
      out[index] = base * c;
      out[index + 1] = base * s;
      index += 2;
      xPower *= x;
    }
  }
  if (index !== size) {
    // A wrong QF/QM would silently change the meaning of every coefficient.
    throw new Error(
      `numerical map basis for ${parameter} emitted ${index} terms, expected ${size}`,
    );
  }
  return out;
}

/**
 * Diurnal terms `[1, sin T, cos T, sin 2T, cos 2T, ...]` for a UT hour.
 *
 * `utHours` is the map's own time argument. See `referenceMapHour` for the
 * relationship between it and the UTC hour a caller asks about.
 */
export function timeTerms(
  utHours: number,
  timeTermCount: number,
): Float64Array {
  const out = new Float64Array(timeTermCount);
  const angle = (15.0 * utHours - 180.0) * (Math.PI / 180);
  out[0] = 1;
  for (let k = 1; k <= (timeTermCount - 1) / 2; k += 1) {
    out[2 * k - 1] = Math.sin(k * angle);
    out[2 * k] = Math.cos(k * angle);
  }
  return out;
}

/**
 * P.533 indexes the 24 hourly grid slots with `path->hour`, which
 * `ReadInputConfiguration.c` sets to the input `Path.hour` minus one, and slot
 * `i` holds the map evaluated at `UT = i + 1`. So the map hour for UTC hour `H`
 * is `H + 1`: the ITU grid is hour-ending.
 *
 * This is preserved rather than corrected. `SolarParameters()` in the same
 * reference uses `path->hour` directly as the UTC hour, so the reference is
 * internally inconsistent by one hour between its solar geometry and its F2
 * map. Parity with P.533 is the requirement here; silently shifting the map by
 * an hour would make every foF2 disagree with the ITU executable and there
 * would be no way for a caller to tell which convention it had been given.
 */
export function referenceMapHour(utcHours: number): number {
  return utcHours + 1;
}

/** Evaluate one parameter from its coefficient block and a prepared basis. */
export function evaluateMap(
  coefficients: ReadonlyFloat64Array,
  geographic: Float64Array,
  time: Float64Array,
): number {
  const timeCount = time.length;
  let total = 0;
  for (let j = 0; j < geographic.length; j += 1) {
    const base = j * timeCount;
    let a = 0;
    for (let k = 0; k < timeCount; k += 1) {
      a += coefficients[base + k] * time[k];
    }
    total += a * geographic[j];
  }
  return total;
}

export interface GridNode {
  readonly j: number;
  readonly k: number;
}

export interface GridNeighbourhood {
  readonly ll: GridNode;
  readonly lr: GridNode;
  readonly ul: GridNode;
  readonly ur: GridNode;
  /** Fractional row (latitude) distance, 0..1. */
  readonly fracK: number;
  /** Fractional column (longitude) distance, 0..1. */
  readonly fracJ: number;
}

/**
 * The four 1.5-degree grid neighbours P.533 would use, with its own
 * quadrant-dependent ordering and its own edge rules: longitude rolls over east
 * to west, latitude does not roll over at the poles but collapses, and the four
 * corners collapse to one dimension.
 *
 * Ported from `IonosphericParameters()` in
 * `P533/Src/P533/CalculateCPParameters.c`. The quadrant branches look redundant
 * but they are not: they decide which neighbour is the anchor, and therefore
 * which way `fracJ`/`fracK` run.
 *
 * THE FRACTIONS ARE MIRRORED OUTSIDE THE NORTH-EAST QUADRANT, AND THAT IS THE
 * REFERENCE'S BEHAVIOUR, NOT A PORTING ERROR.
 *
 * The reference forms `fracj = |lng/inc| - trunc(|lng/inc|)`, a distance
 * measured *away from the prime meridian*, and then feeds it to a bilinear
 * interpolation whose column weight runs from the lower-left neighbour to the
 * lower-right one. In the north-east quadrant those two directions coincide.
 * West of the prime meridian they are opposite, so the weight lands on the
 * wrong neighbour; the same happens to `frack` south of the equator.
 *
 * Worked example, 52.214167 N 42.034722 W, January, 12 UT, R12 50. The four
 * surrounding nodes evaluate to LL 5.300, LR 5.401, UL 5.176, UR 5.277 and the
 * point sits 0.977 of the way from the 43.5 W column to the 42.0 W column. The
 * reference uses fracj = 0.023 and reports 5.202. Evaluating the map directly
 * at the point gives 5.298, and reversing the fraction gives 5.2982. Measured
 * over the 30 reference control points in `fixtures/reference-parity.json`, the
 * reversed fraction reproduces direct map evaluation to 2e-4 MHz everywhere,
 * while the reference's own value is out by up to 0.096 MHz of foF2 (0.19 MHz
 * at the equatorial anomaly).
 *
 * So this function is kept bug-compatible and is used only by `reference` mode,
 * whose entire purpose is byte-parity with the ITU executable for the
 * validation harness. `enhanced` mode never calls it: it evaluates the
 * numerical map at the requested point, which needs no grid and has no
 * quadrant. Consumers that want the right answer want `enhanced`.
 */
export function gridNeighbourhood(
  latitudeRad: number,
  longitudeRad: number,
): GridNeighbourhood {
  const inc = GRID_INCREMENT_RAD;
  const maxJ = GRID_LONGITUDES - 1;
  const maxK = GRID_LATITUDES - 1;

  const node = (j: number, k: number): GridNode => ({ j, k });
  let ll: GridNode;
  let lr: GridNode;
  let ul: GridNode;
  let ur: GridNode;

  if (latitudeRad >= 0) {
    if (longitudeRad >= 0) {
      // North-east quadrant: the lower-left neighbour is the anchor.
      const k = ZERO_LATITUDE_INDEX + Math.trunc(latitudeRad / inc);
      const j = ZERO_LONGITUDE_INDEX + Math.trunc(longitudeRad / inc);
      ll = node(j, k);
      lr = node(j + 1, k);
      ur = node(j + 1, k + 1);
      ul = node(j, k + 1);
      if (j !== maxJ) {
        if (k === maxK) {
          ur = node(ur.j, k);
          ul = node(ul.j, k);
        }
      } else if (k !== maxK) {
        lr = node(0, lr.k);
        ur = node(0, ur.k);
      } else {
        lr = node(0, k);
        ur = node(0, k);
        ul = node(j, k);
      }
    } else {
      // North-west quadrant: the lower-right neighbour is the anchor.
      const k = ZERO_LATITUDE_INDEX + Math.trunc(latitudeRad / inc);
      const j = ZERO_LONGITUDE_INDEX + Math.trunc(longitudeRad / inc);
      lr = node(j, k);
      ll = node(j - 1, k);
      ul = node(j - 1, k + 1);
      ur = node(j, k + 1);
      if (j !== 0) {
        if (k === maxK) {
          ur = node(ur.j, k);
          ul = node(ul.j, k);
        }
      } else if (k !== maxK) {
        ll = node(maxJ, ll.k);
        ul = node(maxJ, ul.k);
      } else {
        ll = node(maxJ, k);
        ur = node(j, k);
        ul = node(maxJ, k);
      }
    }
  } else if (longitudeRad >= 0) {
    // South-east quadrant: the upper-left neighbour is the anchor.
    const k = ZERO_LATITUDE_INDEX + Math.trunc(latitudeRad / inc);
    const j = ZERO_LONGITUDE_INDEX + Math.trunc(longitudeRad / inc);
    ul = node(j, k);
    ur = node(j + 1, k);
    ll = node(j, k - 1);
    lr = node(j + 1, k - 1);
    if (j !== maxJ) {
      if (k === 0) {
        ll = node(ll.j, k);
        lr = node(lr.j, k);
      }
    } else if (k !== 0) {
      lr = node(0, lr.k);
      ur = node(0, ur.k);
    } else {
      lr = node(0, k);
      ur = node(0, k);
      ll = node(j, k);
    }
  } else {
    // South-west quadrant: the upper-right neighbour is the anchor.
    const k = ZERO_LATITUDE_INDEX + Math.trunc(latitudeRad / inc);
    const j = ZERO_LONGITUDE_INDEX + Math.trunc(longitudeRad / inc);
    ur = node(j, k);
    ul = node(j - 1, k);
    ll = node(j - 1, k - 1);
    lr = node(j, k - 1);
    if (j !== 0) {
      if (k === 0) {
        lr = node(lr.j, k);
        ll = node(ll.j, k);
      }
    } else if (k !== 0) {
      ll = node(maxJ, ll.k);
      ul = node(maxJ, ul.k);
    } else {
      lr = node(j, k);
      ll = node(maxJ, k);
      ul = node(maxJ, k);
    }
  }

  const absK = Math.abs(latitudeRad / inc);
  const absJ = Math.abs(longitudeRad / inc);
  return {
    ll,
    lr,
    ul,
    ur,
    fracK: absK - Math.trunc(absK),
    fracJ: absJ - Math.trunc(absJ),
  };
}

/** ITU-R P.1144 bilinear interpolation, in the reference's argument order. */
export function bilinearInterpolation(
  lowerLeft: number,
  lowerRight: number,
  upperLeft: number,
  upperRight: number,
  row: number,
  column: number,
): number {
  return (
    lowerLeft * (1 - row) * (1 - column) +
    upperLeft * row * (1 - column) +
    lowerRight * (1 - row) * column +
    upperRight * row * column
  );
}

/** Geographic coordinates of a grid node, in radians. */
export function gridNodeCoordinatesRad(node: GridNode): {
  latitudeRad: number;
  longitudeRad: number;
} {
  return {
    latitudeRad: node.k * GRID_INCREMENT_RAD - Math.PI / 2,
    longitudeRad: node.j * GRID_INCREMENT_RAD - Math.PI,
  };
}

/** The reference's linear blend between the R12 = 0 and R12 = 100 map levels. */
export function blendBySolarIndex(
  low: number,
  high: number,
  r12: number,
): number {
  const clipped = Math.min(r12, MAX_R12);
  return (high * clipped + low * (100 - clipped)) / 100;
}

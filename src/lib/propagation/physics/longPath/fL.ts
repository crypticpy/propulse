/**
 * ITU-R P.533-14 section 5.3.2, the lower reference frequency fL of a path
 * longer than 7 000 km (PROP-08, #954 slice D).
 *
 * Section 5.3.2, in full: "The LUF is strongly influenced by non-deviative
 * absorption. HF waves are absorbed by penetrating the D-Layer. For the
 * determination of the LUF, the path is divided into nL equal hops dL in
 * length (none longer than 3 000 km). The penetration points are determined by
 * assuming a fixed reflection height of 300 km and a penetration height of
 * 90 km (two penetration points per hop). The fL is calculated by equation
 * (33):
 *
 *     fL = ( 5.3 [ (1 + 0.009 R12) sum_1^m cos^0.5(chi)
 *                  / ( cos(i90) log_e(9.5e6 / p') ) ]^0.5 - fH ) (Aw + 1)
 *                                                         MHz          (33)
 *
 * where m is the number of penetration points 2 nL, R12 the sun spot number
 * which does not saturate for high values and can exceed 160, and chi the solar
 * zenith angle which can be calculated by
 *
 *     cos(chi) = sin(phi_m) sin(delta) + cos(phi_m) cos(delta) cos(eta)   (34)
 *
 * with delta the solar declination, phi_m the geographical latitude of the mth
 * penetration point and eta the solar hour angle, both in radians. The solar
 * declination can be approximated by the subsolar latitude for the middle of
 * the month (sx) from Table 4, and the solar hour angle by
 *
 *     eta ~= (UTC/12 - 1) pi + y_m                                       (35)
 *
 * where y_m is the geographical longitude of the mth penetration point
 * (radians). In the summation, chi is determined for each traverse of the
 * ray-path through the height of 90 km. When chi > 90 degrees, cos^0.5 chi is
 * set to zero. i90 is the angle of incidence at a height of 90 km, p' the slant
 * path length and Aw the winter-anomaly factor determined at the path midpoint.
 *
 * Initially, the fL for 24 hours is determined from equation (33) or the
 * night-LUF. The night-LUF (fLN) is calculated from
 *
 *     fLN = sqrt(D / 3000)                                               (36)
 *
 * For each hour, the larger of the values calculated from equations (32) and
 * (35) are taken as the fL for that hour. In this way, the 24-hour minimum fL
 * value is fLN. Next, the decay from day-LUF to night-LUF is calculated. This
 * is because the absorption does not follow the sun's zenith angle exactly, but
 * is delayed around sunset.
 *
 * The day-LUF to night-LUF hour (tr) is defined as the hour where the current
 * fL is less than 2 fLN while the previous hour fL is greater than 2 fLN. If tr
 * exists, then fL must be recalculated for the hours tr and the succeeding
 * three hours. If tr does not exist, then the determination of fL for 24 hours
 * is complete.
 *
 *     fL(tr) = e^-0.23 fL(tr - 1) (dt (1 - e^-0.23) + e^-0.23)           (37)
 *
 * with dt = (2 fLN - fL(tr)) / (fL(tr - 1) - fL(tr)), and for the succeeding
 * three hours (n = 1, 2 and 3)
 *
 *     fL(tr + n) = fL(tr + n - 1) e^-0.23                                (38)
 *
 * The newly recalculated fL values replace the initial fL values only if they
 * are larger. Once all fL values in a 24-hour period are calculated, the
 * current hour fL value is selected and the fL calculation is complete."
 *
 * TWO OF THE TEXT'S OWN EQUATION NUMBERS ARE TYPOGRAPHICAL. "the larger of the
 * values calculated from equations (32) and (35)" can only mean equations (33)
 * and (36): equation (32) is the K-factor of section 5.3.1, which is
 * dimensionless, and equation (35) is the hour angle, which is an angle. The
 * reference reads them the same way and so does every published description of
 * the FTZ method this section comes from. This is stated rather than silently
 * corrected.
 *
 * THIS LEAF NEEDS NO IONOSPHERE. Equations (33) to (38) take the sunspot
 * number, the geometry, the mean gyrofrequency and the calendar, and nothing
 * else; every ionospheric quantity they could want is already inside fH and
 * p', which `fM.ts` produced. So there is no sampler here and no provider
 * dependency: the whole 24-hour curve is a pure function of its inputs.
 *
 * WHICH p' IS IN EQUATION (33). The recommendation uses one symbol for the
 * slant path length and defines it once, in equation (40)'s where-clause: "p is
 * calculated using equations (19) and (13) with hr = 300 km". Section 5.3.1's
 * hop division is the one that produces such a p' for the whole path, so the
 * same number serves equation (33) and equation (40) and it arrives here as an
 * input rather than being recomputed on the fL hop division. The reference
 * reads it the same way: it computes `path->ptick` from the fM geometry and
 * passes that into `FindfL()`. The alternative reading, p' on the fL hop
 * division, was measured and is worth at most a few hundredths of a decibel
 * because p' enters only through log_e(9.5e6/p').
 *
 * WHAT "UNITY" MEANS IN THE WINTER-ANOMALY SENTENCE. The text says Aw "is
 * unity for geographic latitudes 0 degrees to 30 degrees and at 90 degrees, and
 * reaches the maximum values given in Table 5 at 60 degrees". Read literally
 * that is self-contradictory: Table 5's own entries run from 0.00 to 0.30, so
 * Aw would fall from 1 at the equator to 0.30 at 60 degrees in January, and
 * equation (33)'s factor (Aw + 1) would be 2 in the tropics and 1.30 where the
 * winter anomaly is strongest. Worse, every summer cell of Table 5 is 0.00,
 * which under the literal reading would mean a summer 60-degree path gets a
 * factor of 1 while the equator gets 2. The only self-consistent reading, and
 * the reference's, is that the quantity which is unity outside the anomaly is
 * the FACTOR (Aw + 1): Aw is 0 from 0 to 30 degrees and at 90 degrees, rises
 * linearly to the Table 5 value at 60 degrees, and falls linearly back to 0 at
 * 90 degrees. That is what this module does.
 *
 * WHERE THE REFERENCE AND THE TEXT DISAGREE, AND WHAT WE DO. The pinned ITU
 * build is cd172be5, `MedianSkywaveFieldStrengthLong.c`.
 *
 *  1. THE SOLAR ZENITH ANGLE IS THE TEXT'S APPROXIMATION, NOT A FULL SOLAR
 *     MODEL. THE TEXT gives equation (34) and then states both of its inputs as
 *     approximations: delta "can be approximated by the subsolar latitude for
 *     the middle of the month (sx) from Table 4", and eta "can be approximated
 *     by" equation (35). WE FOLLOW THE TEXT, Table 4 and equation (35)
 *     included; Table 4 is in `assets/p533-fl-tables.json` and would otherwise
 *     have no consumer at all. THE REFERENCE uses its own `SolarParameters()`
 *     declination and hour angle, which carry the equation of time and a
 *     day-of-year declination. The two differ by up to about 4 degrees of hour
 *     angle (the equation of time reaches 16 minutes) and by a degree or so of
 *     declination, which moves the summation of cos^0.5(chi) by a few per cent
 *     near the terminator and much less elsewhere. The parity fixture records
 *     the resulting fL and El difference per case rather than absorbing it.
 *  2. THE HOUR THAT IS SELECTED. THE TEXT: "the CURRENT HOUR fL value is
 *     selected". WE SELECT fL at the prediction's own UTC hour, the same hour
 *     equation (32) reads fBM at. THE REFERENCE selects `fL[path->hour + 1]`
 *     and says why in a comment: its array is indexed as though hour 1 were the
 *     first element, a leftover of the Fortran FTZ routine this section derives
 *     from. Its own fBM lookup does not do this, so the reference reads fL one
 *     hour later than fM on the same circuit. The same leak makes its local
 *     noon an hour early; see `fM.ts` deviation 2.
 *  3. e^-0.23 IS EVALUATED, NOT ROUNDED. THE TEXT writes e^-0.23 in equations
 *     (37) and (38). THE REFERENCE substitutes the literal 0.7945, which is
 *     e^-0.23 rounded to four places and low by 3.4e-5 relative. Worth about
 *     0.0001 dB on El and listed only so that a digit-level comparison of the
 *     two implementations has an explanation.
 *  4. THE TRANSITION TEST IS STRICT. THE TEXT: "tr is defined as the hour where
 *     the current fL is LESS THAN 2 fLN while the previous hour fL is GREATER
 *     THAN 2 fLN". WE USE the strict comparisons the text states. THE REFERENCE
 *     uses `>=` and `<=`, which additionally admits the case where both hours
 *     sit exactly on 2 fLN; that case makes equation (37)'s dt divide by zero,
 *     so the reference's own widening is what would produce a NaN and the
 *     text's strictness is what prevents one. Nothing is clamped here: the
 *     strict reading simply has no zero denominator.
 *  5. THE RECALCULATED VALUE AT tr ITSELF REPLACES ONLY IF IT IS LARGER. THE
 *     TEXT: "The newly recalculated fL values replace the initial fL values
 *     only if they are larger", stated after both equation (37) and equation
 *     (38) and therefore covering both. WE APPLY IT TO ALL FOUR HOURS. THE
 *     REFERENCE applies it to the three succeeding hours and not to tr: it
 *     overwrites `fL[tr]` first and then compares that element with itself,
 *     so its guard is always false. The decay is normally above the initial
 *     night value, so the two readings usually agree.
 *  6. TABLE 5, NORTHERN SEPTEMBER. The published Table 5 prints 0.01; the
 *     reference's array holds 0.00, and its array is exactly antisymmetric
 *     under a six-month shift where the published table is not. WE CARRY THE
 *     PUBLISHED VALUE. It reaches equation (33) only through a September path
 *     whose midpoint is between 30 and 90 degrees north, where it changes
 *     (Aw + 1) by at most 1 per cent.
 *
 * NO NaN AND NO SILENT CLAMP. Equation (33)'s square root can be asked for a
 * negative argument only if log_e(9.5e6/p') is negative, which needs a slant
 * path of more than 9.5 million km, and its outer subtraction can go negative
 * when fH exceeds the bracket, which is a real night-time case. A negative fL
 * from equation (33) is not clamped to zero and not returned as a frequency:
 * equation (36)'s floor is what the text applies next, and the text's own
 * sentence ("In this way, the 24-hour minimum fL value is fLN") says the floor
 * is the answer. Out-of-domain inputs return a labelled `unsupported` record.
 */

import tables from "../assets/p533-fl-tables.json";
import { MAX_ROUTE_DISTANCE_KM } from "./fM";
import { hopGeometry } from "@/lib/propagation/geometry/hop";
import {
  routeSampleAtFraction,
  type GeodeticPoint,
  type ResolvedRoute,
} from "@/lib/propagation/geometry/route";

/** Section 5.3.2's upper bound on the fL hop length dL, km. */
export const LUF_MAX_HOP_KM = 3000;

/** Section 5.3.2's fixed reflection height, km. */
export const LUF_REFLECTION_HEIGHT_KM = 300;

/** Section 5.3.2's penetration height, km. */
export const LUF_PENETRATION_HEIGHT_KM = 90;

/** Equation (33)'s leading coefficient. */
export const LUF_COEFFICIENT = 5.3; // equation (33)

/** Equation (33)'s sunspot coefficient. */
export const LUF_SUNSPOT_COEFFICIENT = 0.009; // equation (33)

/** Equation (33)'s numerator constant, km. */
export const LUF_PATH_CONSTANT_KM = 9.5e6; // equation (33)

/** Equation (36)'s reference distance, km. */
export const NIGHT_LUF_DISTANCE_KM = 3000; // equation (36)

/** The exponent of equations (37) and (38). */
export const LUF_DECAY_EXPONENT = -0.23; // equations (37) and (38)

/** Equations (37) and (38)'s decay per hour, e^-0.23. */
export const LUF_DECAY_PER_HOUR = Math.exp(LUF_DECAY_EXPONENT);

/** How many hours after tr equation (38) recalculates. */
export const LUF_DECAY_HOURS = 3; // section 5.3.2, "the succeeding three hours"

/** The latitudes Table 5's linear interpolation is anchored on, degrees. */
export const WINTER_ANOMALY_LATITUDES_DEG = [30, 60, 90] as const;

const DEG_TO_RAD = Math.PI / 180;
const HOURS_PER_DAY = 24;

/** One traverse of the ray path through 90 km, with its own hour's geometry. */
export interface LufPenetrationPoint {
  /** 0-based index within the 2 nL points, transmitter end first. */
  readonly index: number;
  /** Which hop, 0-based, and which end of it. */
  readonly hopIndex: number;
  readonly end: "transmitter" | "receiver";
  /** Ground distance from the transmitter along the route, km. */
  readonly offsetKm: number;
  readonly point: GeodeticPoint;
}

/** Equation (33) evaluated at one whole UTC hour. */
export interface LufHour {
  readonly utcHour: number;
  /** sum_1^m cos^0.5(chi), dimensionless. Equation (33). */
  readonly zenithCosineRootSum: number;
  /** How many of the m points were sunlit at this hour. */
  readonly sunlitPointCount: number;
  /** Equation (33) before equation (36)'s floor, MHz. May be negative. */
  readonly rawLufMHz: number;
  /** max(equation (33), equation (36)), MHz, before the decay. */
  readonly initialLufMHz: number;
  /** The published fL for this hour, MHz, after equations (37) and (38). */
  readonly lufMHz: number;
}

export interface ResolvedLongPathLuf {
  readonly kind: "resolved";
  readonly groundDistanceKm: number;
  /** nL, the number of equal hops. */
  readonly hopCount: number;
  /** dL = D / nL, km. */
  readonly hopGroundDistanceKm: number;
  /** Equation (13) at the 300 km height for a dL hop, radians. */
  readonly elevationRad: number;
  /** i90, the angle of incidence at 90 km, radians. Equation (33). */
  readonly incidenceAngle90Rad: number;
  /** m = 2 nL points, transmitter end of hop 0 first. */
  readonly penetrationPoints: readonly LufPenetrationPoint[];
  /** Aw at the path midpoint, dimensionless. Table 5. */
  readonly winterAnomalyFactor: number;
  /** delta, the Table 4 subsolar latitude used as the declination, degrees. */
  readonly declinationDeg: number;
  /** fLN of equation (36), MHz. */
  readonly nightLufMHz: number;
  /** The 24 hours, index 0 being 00 UTC. */
  readonly hours: readonly LufHour[];
  /** tr of section 5.3.2, or null when no such hour exists. */
  readonly transitionUtcHour: number | null;
  /** fL at the prediction's own hour, MHz. See deviation 2. */
  readonly fLMHz: number;
}

export interface UnsupportedLongPathLuf {
  readonly kind: "unsupported";
  readonly reason: "out_of_domain";
  readonly detail: string;
  readonly groundDistanceKm: number;
}

export type LongPathLufResult = ResolvedLongPathLuf | UnsupportedLongPathLuf;

export interface LongPathLufInputs {
  readonly route: ResolvedRoute;
  /** 0-based month index, January is 0. Table 4 and Table 5 are monthly. */
  readonly monthIndex: number;
  /** The prediction's UTC hour. Whole hours only; the table is hourly. */
  readonly utcHour: number;
  /** R12. Equation (33) states it "does not saturate ... and can exceed 160". */
  readonly r12: number;
  /** fH, the mean gyrofrequency at the fM control points, MHz. Equation (39). */
  readonly gyrofrequencyMHz: number;
  /** p', equation (19) at hr = 300 km over the whole path, km. */
  readonly virtualSlantRangeKm: number;
}

/**
 * delta of equation (34), taken from Table 4. Degrees.
 *
 * `monthIndex` is a whole 0..11 and is the caller's to check; `longPathLuf`
 * is the guard, and a table with one column per month has nothing to answer
 * with outside its own columns.
 */
export function subsolarLatitudeDeg(monthIndex: number): number {
  return tables.table_4.subsolar_latitude_deg[monthIndex]; // Table 4
}

/**
 * Aw at one geographic latitude in one month, from Table 5.
 *
 * Zero from the equator to 30 degrees and at the pole, the Table 5 value at 60
 * degrees, linear in latitude between. The hemisphere is chosen by the sign of
 * the latitude with the equator counted northern, which is the reference's rule
 * and the only one Table 5's two rows admit.
 *
 * `monthIndex` is a whole 0..11 and is the caller's to check, for the same
 * reason `subsolarLatitudeDeg` says so.
 */
export function winterAnomalyFactor(
  latitudeDeg: number,
  monthIndex: number,
): number {
  const row =
    latitudeDeg < 0 ? tables.table_5.southern : tables.table_5.northern;
  const peak = row[monthIndex]; // Table 5, at 60 degrees
  const [low, mid, high] = WINTER_ANOMALY_LATITUDES_DEG;
  const magnitude = Math.abs(latitudeDeg);
  if (magnitude <= low || magnitude >= high) return 0;
  return magnitude < mid
    ? (peak * (magnitude - low)) / (mid - low)
    : (peak * (high - magnitude)) / (high - mid);
}

/** eta of equation (35), radians, for a longitude in degrees east. */
export function solarHourAngleRad(
  utcHours: number,
  longitudeDeg: number,
): number {
  return (
    (utcHours / 12 - 1) * Math.PI + longitudeDeg * DEG_TO_RAD // equation (35)
  );
}

/** cos(chi) of equation (34). */
export function solarZenithCosine(
  latitudeDeg: number,
  longitudeDeg: number,
  declinationDeg: number,
  utcHours: number,
): number {
  const phi = latitudeDeg * DEG_TO_RAD;
  const delta = declinationDeg * DEG_TO_RAD;
  const eta = solarHourAngleRad(utcHours, longitudeDeg);
  return (
    Math.sin(phi) * Math.sin(delta) +
    Math.cos(phi) * Math.cos(delta) * Math.cos(eta) // equation (34)
  );
}

/**
 * fLN of equation (36), MHz.
 *
 * Section 5.3.2 names it the night-LUF and then says what it is for: "In this
 * way, the 24-hour minimum fL value is fLN."
 */
export function nightLufMHz(groundDistanceKm: number): number {
  return Math.sqrt(groundDistanceKm / NIGHT_LUF_DISTANCE_KM); // equation (36)
}

/** Equation (33), before equation (36)'s floor. MHz, and may be negative. */
export function rawLufMHz(inputs: {
  readonly zenithCosineRootSum: number;
  readonly r12: number;
  readonly incidenceAngle90Rad: number;
  readonly virtualSlantRangeKm: number;
  readonly gyrofrequencyMHz: number;
  readonly winterAnomalyFactor: number;
}): number {
  const {
    zenithCosineRootSum,
    r12,
    incidenceAngle90Rad,
    virtualSlantRangeKm,
    gyrofrequencyMHz,
    winterAnomalyFactor: aw,
  } = inputs;
  const numerator =
    (1 + LUF_SUNSPOT_COEFFICIENT * r12) * zenithCosineRootSum; // equation (33)
  const denominator =
    Math.cos(incidenceAngle90Rad) *
    Math.log(LUF_PATH_CONSTANT_KM / virtualSlantRangeKm); // equation (33)
  return (
    (LUF_COEFFICIENT * Math.sqrt(numerator / denominator) - gyrofrequencyMHz) *
    (aw + 1)
  ); // equation (33)
}

/**
 * The sunset decay of equations (37) and (38) applied to a 24-hour curve.
 *
 * Exported because it is the part of section 5.3.2 with no geometry in it at
 * all: given 24 initial values and fLN it is a closed calculation, and a test
 * can drive it directly with hand-made curves instead of through an ionosphere.
 * Returns a new array and the tr it found; the input is not mutated.
 */
export function applySunsetDecay(
  initialMHz: readonly number[],
  nightLuf: number,
): { readonly hours: readonly number[]; readonly transitionUtcHour: number | null } {
  const hours = [...initialMHz];
  const threshold = 2 * nightLuf; // section 5.3.2, "2*fLN"
  let tr: number | null = null;
  for (let now = 0; now < HOURS_PER_DAY && tr === null; now += 1) {
    const previous = (now - 1 + HOURS_PER_DAY) % HOURS_PER_DAY;
    // Deviation 4: the text's comparisons are strict, which is also what keeps
    // dt's denominator away from zero.
    if (hours[previous] > threshold && hours[now] < threshold) {
      tr = now;
      const dt =
        (threshold - hours[now]) / (hours[previous] - hours[now]); // equation (37)
      const decayed =
        LUF_DECAY_PER_HOUR *
        hours[previous] *
        (dt * (1 - LUF_DECAY_PER_HOUR) + LUF_DECAY_PER_HOUR); // equation (37)
      // Deviation 5: "only if they are larger" covers tr as well.
      hours[now] = Math.max(hours[now], decayed);
    }
  }
  if (tr !== null) {
    for (let n = 1; n <= LUF_DECAY_HOURS; n += 1) {
      const now = (tr + n) % HOURS_PER_DAY;
      const previous = (now - 1 + HOURS_PER_DAY) % HOURS_PER_DAY;
      hours[now] = Math.max(
        hours[now],
        hours[previous] * LUF_DECAY_PER_HOUR, // equation (38)
      );
    }
  }
  return { hours, transitionUtcHour: tr };
}

function unsupported(
  detail: string,
  groundDistanceKm: number,
): UnsupportedLongPathLuf {
  return { kind: "unsupported", reason: "out_of_domain", detail, groundDistanceKm };
}

/**
 * fL and its 24-hour curve for one path longer than 7 000 km.
 *
 * Consumes one already-resolved route (contract M06) and the two quantities
 * section 5.3.1 produced, fH and p'. Nothing here fetches anything.
 */
export function longPathLuf(inputs: LongPathLufInputs): LongPathLufResult {
  const {
    route,
    monthIndex,
    utcHour,
    r12,
    gyrofrequencyMHz,
    virtualSlantRangeKm,
  } = inputs;
  const D = route.groundDistanceKm;

  if (!Number.isFinite(D) || D <= 0) {
    return unsupported(
      `the route has no usable ground distance (${String(D)} km).`,
      D,
    );
  }
  if (D > MAX_ROUTE_DISTANCE_KM) {
    return unsupported(
      `the route is ${D.toFixed(1)} km, longer than the ` +
        `${MAX_ROUTE_DISTANCE_KM.toFixed(1)} km circumference of the declared ` +
        `sphere, so it is not a path length.`,
      D,
    );
  }
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return unsupported(
      `monthIndex must be a whole month 0..11, received ` +
        `${String(monthIndex)}; Tables 4 and 5 have one column per month.`,
      D,
    );
  }
  if (!Number.isInteger(utcHour) || utcHour < 0 || utcHour >= HOURS_PER_DAY) {
    return unsupported(
      `utcHour must be a whole hour 0..23, received ${String(utcHour)}. ` +
        `Section 5.3.2 builds an hourly curve and selects the current hour ` +
        `from it; a fractional hour would need an interpolation the ` +
        `recommendation does not state.`,
      D,
    );
  }
  if (!Number.isFinite(r12) || r12 < 0) {
    return unsupported(
      `R12 must be finite and not negative, received ${String(r12)}.`,
      D,
    );
  }
  if (!Number.isFinite(gyrofrequencyMHz) || gyrofrequencyMHz < 0) {
    return unsupported(
      `fH must be finite and not negative, received ` +
        `${String(gyrofrequencyMHz)} MHz.`,
      D,
    );
  }
  if (
    !Number.isFinite(virtualSlantRangeKm) ||
    virtualSlantRangeKm <= 0 ||
    virtualSlantRangeKm >= LUF_PATH_CONSTANT_KM
  ) {
    return unsupported(
      `p' must be positive and shorter than ` +
        `${String(LUF_PATH_CONSTANT_KM)} km, received ` +
        `${String(virtualSlantRangeKm)} km; equation (33) takes ` +
        `log_e(9.5e6 / p'), which is zero or negative otherwise.`,
      D,
    );
  }

  const hopCount = Math.max(1, Math.ceil(D / LUF_MAX_HOP_KM));
  const hopGroundDistanceKm = D / hopCount;

  // Equation (13) at the fixed 300 km height, the 90 km angle of incidence and
  // the 90 km penetration points are all one solve in `geometry/hop.ts`, which
  // already places "two penetration points per hop" at the offsets this section
  // describes. Nothing about them is re-derived here.
  const geometry = hopGeometry({
    groundDistanceKm: D,
    hopCount,
    mirrorHeightKm: LUF_REFLECTION_HEIGHT_KM,
  });
  if (geometry.kind !== "supported") {
    return unsupported(
      `a ${String(hopCount)}-hop division of ${D.toFixed(1)} km gives hops of ` +
        `${hopGroundDistanceKm.toFixed(1)} km, which a mirror at ` +
        `${String(LUF_REFLECTION_HEIGHT_KM)} km cannot close: ${geometry.detail}`,
      D,
    );
  }
  const { elevationAngleRad: elevationRad, incidenceAngle90Rad } = geometry;

  const penetrationPoints: LufPenetrationPoint[] = geometry.penetrationFractions.map(
    (fraction, index) => ({
      index,
      hopIndex: Math.floor(index / 2),
      end: index % 2 === 0 ? "transmitter" : "receiver",
      offsetKm: fraction * D,
      point: routeSampleAtFraction(route, fraction),
    }),
  );

  const midpoint = routeSampleAtFraction(route, 0.5);
  const aw = winterAnomalyFactor(midpoint.latitudeDeg, monthIndex);
  const declinationDeg = subsolarLatitudeDeg(monthIndex);
  const fLN = nightLufMHz(D);

  const initial: number[] = [];
  const raw: number[] = [];
  const sums: number[] = [];
  const sunlit: number[] = [];
  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    let sum = 0;
    let lit = 0;
    for (const penetration of penetrationPoints) {
      const cosChi = solarZenithCosine(
        penetration.point.latitudeDeg,
        penetration.point.longitudeDeg,
        declinationDeg,
        hour,
      );
      // "When chi > 90 degrees, cos^0.5 chi is set to zero", which is exactly
      // the points where cos(chi) is not positive.
      if (cosChi > 0) {
        sum += Math.sqrt(cosChi);
        lit += 1;
      }
    }
    sums.push(sum);
    sunlit.push(lit);
    const value = rawLufMHz({
      zenithCosineRootSum: sum,
      r12,
      incidenceAngle90Rad,
      virtualSlantRangeKm,
      gyrofrequencyMHz,
      winterAnomalyFactor: aw,
    });
    raw.push(value);
    initial.push(Math.max(value, fLN)); // equations (33) and (36)
  }

  const decayed = applySunsetDecay(initial, fLN);
  const hours: LufHour[] = [];
  for (let hour = 0; hour < HOURS_PER_DAY; hour += 1) {
    hours.push({
      utcHour: hour,
      zenithCosineRootSum: sums[hour],
      sunlitPointCount: sunlit[hour],
      rawLufMHz: raw[hour],
      initialLufMHz: initial[hour],
      lufMHz: decayed.hours[hour],
    });
  }

  return {
    kind: "resolved",
    groundDistanceKm: D,
    hopCount,
    hopGroundDistanceKm,
    elevationRad,
    incidenceAngle90Rad,
    penetrationPoints,
    winterAnomalyFactor: aw,
    declinationDeg,
    nightLufMHz: fLN,
    hours,
    transitionUtcHour: decayed.transitionUtcHour,
    // Deviation 2: the text's "current hour", not the reference's hour + 1.
    fLMHz: decayed.hours[utcHour],
  };
}

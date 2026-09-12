/**
 * ITU-R P.533-14 section 5.2.2 equations (17) and (28) and section 6 equations
 * (43) and (44): the median sky-wave field strength of each mode, the resultant
 * field strength of the circuit, and the available receiver power (PROP-08,
 * #954 slice C).
 *
 * The four equations, quoted whole:
 *
 *     Ew = 136.6 + Pt + Gt + 20 log f - Lb                dB(1 uV/m)   (17)
 *     Es = 10 log10 sum_w 10^(Ew/10)                      dB(1 uV/m)   (28)
 *     Prw = Ew + Grw - 20 log10 f - 107.2                 dBW          (43)
 *     Pr = 10 log10 sum_w 10^(Prw/10)                     dBW          (44)
 *
 * with "Pt: transmitter power (dB(1 kW))", "Gt: transmitting antenna gain at
 * the required azimuth angle and elevation angle relative to an isotropic
 * antenna (dB)", "Grw: a lossless receiving antenna of gain (dB relative to an
 * isotropic radiator) in the direction of signal incidence", and Lb the ray
 * path basic transmission loss of equation (18), which `losses.ts` sums from
 * the terms `absorptionLoss.ts` and `auroralLoss.ts` produce.
 *
 * UNITS AND REFERENCE PLANES, stated once, because contract M08 requires a
 * consumer to be able to name them without inference.
 *
 *  - `Ew` and `Es` are dB above 1 microvolt per metre. They are FIELD
 *    STRENGTHS at the receiving site, and they already contain the transmitter
 *    power and the transmitting antenna gain. They contain no receiving
 *    antenna.
 *  - `Prw` and `Pr` are dBW available at the terminals of a LOSSLESS receiving
 *    antenna of gain Grw, in the direction that mode arrives from. That is the
 *    reference plane, and it is before any feeder, any preselector and any
 *    receiver noise figure.
 *  - Free-space spreading, ionospheric absorption, the above-the-MUF loss, the
 *    ground-reflection loss, the auroral loss and Lz are ALL already inside
 *    `Ew` through `Lb`. A consumer adding any of them again is double-counting.
 *  - Antenna gain enters exactly twice, `Gt` in equation (17) and `Grw` in
 *    equation (43), and never again.
 *
 * ANTENNAS ARE THE CALLER'S. There is no station model here. `Pt` defaults to
 * 0 dB(1 kW), which is one kilowatt, and both gains default to 0 dBi, an
 * isotropic radiator. Those are the golden corpus's own assumptions and they
 * are declared on the result rather than assumed silently. A gain may be a
 * scalar or a function of the mode, because equation (17) asks for the gain
 * "at the required azimuth angle and ELEVATION angle" and every mode arrives
 * at a different elevation; the azimuth is a property of the route and not of
 * the mode, so the caller closes over it.
 *
 * WHICH MODES CONTRIBUTE. Contract M07 names four mode states, and equation
 * (28) says "Discounting modes screened by the E layer":
 *
 *  - `supported` contributes its Ew.
 *  - `above_basic_muf_with_loss` contributes its Ew, with the above-the-MUF
 *    loss Lm of equations (24) to (26) inside Lb. This is M07's fourth state
 *    and slice C is where it is produced, because Lm is what distinguishes it.
 *    It is a state of THIS record and not of `PropagationMode`: slice B's
 *    record says whether section 5.2.1 selects the mode, and nothing here
 *    mutates that meaning.
 *  - `geometrically_unsupported` and `screened` contribute nothing at all, not
 *    a zero and not a very large loss. `fieldStrengthDbuVPerM` is null for
 *    them and they are absent from the sums of equations (28) and (44).
 *
 * A FIFTH LABEL EXISTS AND IS NOT AN M07 STATE. `absorption_unavailable` is
 * carried when a selected mode's absorption cannot be evaluated at all, which
 * today happens only through `absorptionLoss.ts`'s deviation 6: the fixed
 * 300 km penetration geometry reaches 3835.8 km in one hop and a longer hop
 * has no assumed ray. Such a mode is a real mode that P.533-14 selects, so
 * calling it `geometrically_unsupported` would be a false statement about the
 * mode; it is labelled for what it is, contributes nothing, and appears in
 * `unevaluatedModes` so that a caller cannot lose it by accident.
 *
 * WHICH ELEVATION AND WHICH SLANT RANGE. `PropagationMode.elevationRad` and
 * `PropagationMode.virtualSlantRangeKm`, never the `selection*` comparator
 * fields. `modeTypes.ts` states the rule in capitals and this module obeys it:
 * section 5.1 is headed "Elevation angle" and defines equation (13)'s hr
 * itself, so the elevation a signal budget uses is the one taken at that
 * height whenever that height closes the hop (`elevationSource` is
 * `"section_5_1"`). When it does not (`elevationSource` is
 * `"selection_height"`, slice E1a deviation 3), the same two fields already
 * carry equation (13) at `selectionMirrorHeightKm`, and this module reads
 * them as given rather than recomputing anything from `mirrorHeightKm`. The
 * pinned ITU build takes both from the equation (2) height in every case,
 * which slice B declared as an inherited divergence; every Ew, Es, Prw and Pr
 * here inherits it, and the parity fixture carries the per-case size of it
 * rather than absorbing it into a tolerance.
 *
 * DEVIATIONS. Numbered, each with the published text and what the pinned ITU
 * reference build cd172be5 does instead. The deviations that live in the loss
 * terms themselves are numbered in `losses.ts`, `absorptionLoss.ts` and
 * `auroralLoss.ts` and are not repeated here.
 *
 *  1. THE RAY PATH OF THE ABSORPTION TERM ABOVE THE BASIC MUF IS NOT APPLIED
 *     UNLESS THE CALLER SUPPLIES IT. THE TEXT, after equation (23): "For
 *     frequencies above the basic MUF, the absorption ... is calculated
 *     assuming the same ray-paths as those at the basic MUF." The ray path
 *     enters `absorptionLoss.ts` as the elevation angle, and the elevation of a
 *     mode at its basic MUF is the section 5.1 height solved at f = fb, which
 *     is a quantity slice B produces when it resolves a mode set AT THAT
 *     FREQUENCY. This module consumes one already-resolved `ResolvedModeSet` at
 *     the operating frequency and does not resolve a second one, so it cannot
 *     derive the frozen ray path on its own. `basicMufElevationRad` is the
 *     input that supplies it, `losses.ts`'s `absorptionRayPathFrequencyMHz`
 *     says which frequency to solve at, and when the caller supplies nothing
 *     the operating-frequency elevation is used and the substitution is named
 *     in `assumptions` rather than hidden. THE REFERENCE cannot implement the
 *     rule at all: its elevation comes from the equation (2) height, which has
 *     no frequency in it.
 *  2. THE DISTANCE RANGE OF EQUATIONS (43) AND (44). THE TEXT, section 6: "For
 *     distance ranges up to 7 000 km, where field strength is calculated by the
 *     method of section 5.2 ... In the intermediate range 7 000 to 9 000 km,
 *     the power is determined from equation (42) using the powers corresponding
 *     to Es and El." Section 5.2.1 selects modes out to 9 000 km, so Ew and Es
 *     are defined over the whole short-path range while Pr is final only up to
 *     7 000 km. We compute Prw and Pr everywhere the modes exist, because
 *     equation (42) needs the short-path power as one of its two arguments, and
 *     we label the result: `powerRange` is `up_to_7000_km` or
 *     `blend_7000_to_9000_km`, and in the second case `Pr` is the short-path
 *     TERM of equation (42) and not the circuit's answer. Slice D owns
 *     equation (42). THE REFERENCE agrees on the boundary
 *     (`MedianAvailableReceiverPower` takes its short branch for
 *     `distance <= 7000`) and simply leaves the power unset in between until
 *     its own long-path pass fills it.
 *  3. THE DOMINANT MODE. The recommendation does not define one; it is a
 *     reporting convenience and the golden corpus has a column for it. THE
 *     REFERENCE picks the mode with the largest Prw. We do the same and say so
 *     here, so that nobody reads `dominantMode` as part of the method. It is
 *     null when nothing contributes.
 *
 * ONE READING THAT IS NOT A DEVIATION. Table 1d's control points are selected
 * with "d0: hop length of lowest-order mode", so they are a property of the
 * path and the layer, and every mode of a layer shares one set of them; only
 * the Lh distance regime is taken over the mode's own hop. `auroralPoints`
 * below says this again where it is applied, and the reference reads it the
 * same way.
 */

import { selectControlPoints, type ControlPointSite } from "./controlPoints";
import {
  absorptionLoss,
  type AbsorptionLoss,
  type PenetrationPointSampler,
} from "./absorptionLoss";
import {
  auroralLoss,
  midPathLocalTimeHours,
  type AuroralLoss,
} from "./auroralLoss";
import {
  aboveMufLoss,
  basicTransmissionLossDb,
  groundReflectionLossDb,
  type AboveMufLoss,
  type BasicTransmissionLoss,
} from "./losses";
import type { PropagationLayer, PropagationMode } from "./modeTypes";
import type { ResolvedModeSet } from "./modeSet";
import {
  DEGENERATE_ANGLE_RAD,
  routeMidpoint,
  type ResolvedRoute,
  type UnitVector,
} from "@/lib/propagation/geometry/route";

/** The constant of equation (17), dB. */
export const FIELD_STRENGTH_CONSTANT_DB = 136.6;

/** The constant of equation (43), dB. */
export const RECEIVER_POWER_CONSTANT_DB = 107.2;

/** Section 6's boundary for equations (43) and (44), km. See deviation 2. */
export const RECEIVER_POWER_MAX_KM = 7000;

/** Pt when the caller states none: one kilowatt. */
export const DEFAULT_TRANSMITTER_POWER_DB_KW = 0;

/** Gt and Grw when the caller states none: an isotropic radiator. */
export const ISOTROPIC_GAIN_DBI = 0;

/**
 * What an antenna is asked, per mode.
 *
 * The azimuth is deliberately absent: it is a property of the route, the same
 * for every mode, and the caller who owns the antenna pattern already has it.
 */
export interface AntennaGainContext {
  readonly label: string;
  readonly layer: PropagationLayer;
  readonly hopCount: number;
  readonly elevationRad: number;
  readonly elevationDeg: number;
}

/** A fixed gain in dBi, or one evaluated per mode. */
export type AntennaGain = number | ((context: AntennaGainContext) => number);

/**
 * What this record says about a mode.
 *
 * The first four are contract M07's states. The fifth is not; see the module
 * header for why it exists and why it is not spelled as one of the four.
 */
export type ModeFieldStrengthState =
  | "supported"
  | "above_basic_muf_with_loss"
  | "geometrically_unsupported"
  | "screened"
  | "absorption_unavailable";

export interface ModeFieldStrength {
  readonly label: string;
  readonly layer: PropagationLayer;
  readonly hopCount: number;
  readonly state: ModeFieldStrengthState;
  /** Why this mode contributes nothing, when it does not. */
  readonly noContributionReason: string | null;
  /** Ew, equation (17), dB(1 uV/m). Null when the mode contributes nothing. */
  readonly fieldStrengthDbuVPerM: number | null;
  /** Prw, equation (43), dBW. Null when the mode contributes nothing. */
  readonly receiverPowerDbW: number | null;
  readonly basicTransmissionLoss: BasicTransmissionLoss | null;
  readonly aboveMuf: AboveMufLoss | null;
  readonly absorption: AbsorptionLoss | null;
  readonly auroral: AuroralLoss | null;
  /** Gt actually applied, dBi. */
  readonly transmitterGainDbi: number | null;
  /** Grw actually applied, dBi. */
  readonly receiverGainDbi: number | null;
  /** The section 5.1 elevation this budget was taken at, radians. */
  readonly elevationRad: number | null;
  /** p of equation (19) for the whole mode, km. */
  readonly virtualSlantRangeKm: number | null;
  readonly basicMufMHz: number;
}

export type ShortPathPowerRange = "up_to_7000_km" | "blend_7000_to_9000_km";

export interface ShortPathFieldStrength {
  readonly kind: "field_strength";
  readonly groundDistanceKm: number;
  readonly frequencyMHz: number;
  /** Every mode of the set, in the order slice B produced them. */
  readonly modes: readonly ModeFieldStrength[];
  /** The subset that contributes to equations (28) and (44). */
  readonly contributingModes: readonly ModeFieldStrength[];
  /**
   * Modes section 5.2.1 selected whose field strength could not be evaluated.
   * Empty on every circuit the recommendation's own geometry closes.
   */
  readonly unevaluatedModes: readonly ModeFieldStrength[];
  /** Es, equation (28), dB(1 uV/m). Null when nothing contributes. */
  readonly fieldStrengthDbuVPerM: number | null;
  /** Pr, equation (44), dBW. Null when nothing contributes. */
  readonly receiverPowerDbW: number | null;
  /** See deviation 3. The largest Prw, or null. */
  readonly dominantMode: ModeFieldStrength | null;
  /** See deviation 2. */
  readonly powerRange: ShortPathPowerRange;
  readonly transmitterPowerDbKw: number;
  readonly assumptions: readonly string[];
}

export interface ShortPathFieldStrengthInputs {
  readonly route: ResolvedRoute;
  /** Slice B's resolved mode set for this route at this frequency. */
  readonly modes: ResolvedModeSet;
  /** 0-based month index, January is 0. */
  readonly monthIndex: number;
  /** UTC hour of the prediction, used for the mid-path local time of Lh. */
  readonly utcHours: number;
  /** R12, the smoothed sunspot number of equation (20). */
  readonly ssn: number;
  readonly absorptionSample: PenetrationPointSampler;
  /** Pt, dB(1 kW). Defaults to 0, one kilowatt. */
  readonly transmitterPowerDbKw?: number;
  /** Gt, dBi. Defaults to isotropic. */
  readonly transmitterGain?: AntennaGain;
  /** Grw, dBi. Defaults to isotropic. */
  readonly receiverGain?: AntennaGain;
  /** Lz, dB. Defaults to the published 8.72; see `losses.ts` deviation 1. */
  readonly otherLossesDb?: number;
  /** See `absorptionLoss.ts` deviation 2. Defaults to the text's 300 km. */
  readonly penetrationReflectionHeightKm?: number;
  /**
   * See deviation 1. The elevation of this mode at its basic MUF, radians.
   * Consulted only for modes above their basic MUF; at or below it the
   * operating-frequency ray path already is the one the text names.
   */
  readonly basicMufElevationRad?: (mode: PropagationMode) => number | null;
}

function gainDbi(gain: AntennaGain, context: AntennaGainContext): number {
  return typeof gain === "number" ? gain : gain(context);
}

function powerSumDb(valuesDb: readonly number[]): number | null {
  if (valuesDb.length === 0) return null;
  return (
    10 * Math.log10(valuesDb.reduce((total, db) => total + 10 ** (db / 10), 0))
  );
}

/** `a` and `b` differ by more than `DEGENERATE_ANGLE_RAD` in some component. */
function unitVectorsDiffer(a: UnitVector, b: UnitVector): boolean {
  return (
    Math.abs(a.x - b.x) > DEGENERATE_ANGLE_RAD ||
    Math.abs(a.y - b.y) > DEGENERATE_ANGLE_RAD ||
    Math.abs(a.z - b.z) > DEGENERATE_ANGLE_RAD
  );
}

function formatUnitVector(v: UnitVector): string {
  return `(${v.x.toFixed(9)}, ${v.y.toFixed(9)}, ${v.z.toFixed(9)})`;
}

/**
 * Table 1d's control points for one layer, which are a property of the PATH.
 *
 * Table 1 defines "d0: hop length of lowest-order mode", so the five-point row
 * a path longer than dmax uses is anchored on the lowest-order mode's hop and
 * not on each mode's own. Every mode of a layer therefore shares one set of
 * points, and only the Lh distance regime, which the text takes over "the
 * transmission range", is per mode. The reference agrees: it fixes the control
 * points once per path from `n0` and indexes the Lh range on the mode's own
 * `distance/(n+1)`.
 *
 * `not_applicable` yields no points, and a mean over no points is zero, which
 * is what the recommendation's own "0 dB below 42.5 degrees" already produces
 * for every path Table 1d declines to name points for.
 */
function auroralPoints(
  route: ResolvedRoute,
  modeSet: ResolvedModeSet,
  layer: PropagationLayer,
): readonly ControlPointSite[] {
  const lowestOrder = modeSet.modes.find((mode) => mode.layer === layer);
  if (lowestOrder === undefined) return [];
  const selection = selectControlPoints({
    route,
    purpose: "absorption",
    layer,
    dmaxKm: modeSet.dmaxKm,
    hopGroundDistanceKm: lowestOrder.hopGroundDistanceKm,
  });
  return selection.kind === "points" ? selection.points : [];
}

/**
 * Ew, Es, Prw and Pr for one circuit at one frequency.
 *
 * Consumes one already-resolved mode set (contract M06: one route, one
 * resolution) and one injected sampler for the ionosphere at the penetration
 * points (contract M03). Nothing here fetches anything.
 */
export function shortPathFieldStrength(
  inputs: ShortPathFieldStrengthInputs,
): ShortPathFieldStrength {
  const {
    route,
    modes: modeSet,
    monthIndex,
    utcHours,
    ssn,
    absorptionSample,
    transmitterPowerDbKw = DEFAULT_TRANSMITTER_POWER_DB_KW,
    transmitterGain = ISOTROPIC_GAIN_DBI,
    receiverGain = ISOTROPIC_GAIN_DBI,
    otherLossesDb,
    penetrationReflectionHeightKm,
    basicMufElevationRad,
  } = inputs;

  // `route` and `modes` are independent inputs the caller assembles
  // separately; every penetration and control point below is found on
  // `route`, so a mode set resolved for a different route would silently
  // relocate every sample this function takes. `groundDistanceKm` alone does
  // not identify a route: two geographically different circuits can share a
  // ground distance, so the origin and tangent the mode set was sampled along
  // are checked too, each within `DEGENERATE_ANGLE_RAD`, the same tolerance
  // `resolveRoute` uses to tell two points apart on this sphere.
  const distanceMismatch =
    Math.abs(modeSet.groundDistanceKm - route.groundDistanceKm) > 1e-6;
  const originMismatch = unitVectorsDiffer(modeSet.routeOrigin, route.origin);
  const tangentMismatch = unitVectorsDiffer(
    modeSet.routeTangent,
    route.tangent,
  );
  if (distanceMismatch || originMismatch || tangentMismatch) {
    const mismatches: string[] = [];
    if (distanceMismatch) {
      mismatches.push(
        `modeSet.groundDistanceKm ${String(modeSet.groundDistanceKm)} does ` +
          `not match route.groundDistanceKm ${String(route.groundDistanceKm)}`,
      );
    }
    if (originMismatch) {
      mismatches.push(
        `modeSet.routeOrigin ${formatUnitVector(modeSet.routeOrigin)} does ` +
          `not match route.origin ${formatUnitVector(route.origin)}`,
      );
    }
    if (tangentMismatch) {
      mismatches.push(
        `modeSet.routeTangent ${formatUnitVector(modeSet.routeTangent)} does ` +
          `not match route.tangent ${formatUnitVector(route.tangent)}`,
      );
    }
    throw new RangeError(
      `modes was resolved for a different route: ${mismatches.join("; ")}.`,
    );
  }
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new RangeError(
      `monthIndex must be an integer 0..11, received ${String(monthIndex)}.`,
    );
  }
  if (!Number.isFinite(utcHours)) {
    throw new RangeError(
      `utcHours must be finite, received ${String(utcHours)}.`,
    );
  }
  if (!Number.isFinite(transmitterPowerDbKw)) {
    throw new RangeError(
      `transmitterPowerDbKw must be finite, received ` +
        `${String(transmitterPowerDbKw)}.`,
    );
  }
  // Equation (20) scales the absorption by (1 + 0.0067 R12); R12 is a
  // smoothed sunspot number and is never negative, and a NaN here would
  // reach every field strength and power below.
  if (!Number.isFinite(ssn) || ssn < 0) {
    throw new RangeError(
      `ssn must be finite and non-negative, received ${String(ssn)}.`,
    );
  }

  const frequencyMHz = modeSet.frequencyMHz;
  const midPathHours = midPathLocalTimeHours(
    utcHours,
    routeMidpoint(route).longitudeDeg,
  );
  const assumptions: string[] = [];
  let frozenRayPathModes = 0;
  let operatingRayPathModes = 0;

  const auroralSiteCache = new Map<
    PropagationLayer,
    readonly ControlPointSite[]
  >();
  const auroralSites = (
    layer: PropagationLayer,
  ): readonly ControlPointSite[] => {
    const cached = auroralSiteCache.get(layer);
    if (cached !== undefined) return cached;
    const points = auroralPoints(route, modeSet, layer);
    auroralSiteCache.set(layer, points);
    return points;
  };

  const records: ModeFieldStrength[] = modeSet.modes.map((mode) => {
    const identity = {
      label: mode.label,
      layer: mode.layer,
      hopCount: mode.hopCount,
      basicMufMHz: mode.basicMufMHz,
    };
    const nothing = {
      ...identity,
      fieldStrengthDbuVPerM: null,
      receiverPowerDbW: null,
      basicTransmissionLoss: null,
      aboveMuf: null,
      absorption: null,
      auroral: null,
      transmitterGainDbi: null,
      receiverGainDbi: null,
      elevationRad: null,
      virtualSlantRangeKm: null,
    };

    if (mode.status !== "supported") {
      return {
        ...nothing,
        state: mode.status,
        noContributionReason:
          mode.status === "screened"
            ? "Equation (28) discounts modes screened by the E layer."
            : `Section 5.2.1 does not select this mode: ` +
              `${String(mode.unsupportedReason)}.`,
      };
    }

    // A supported mode always has the section 5.1 geometry; `modeTypes.ts`
    // states the invariant that the three fields are null only together and
    // only with a `geometrically_unsupported` status.
    const elevationRad = mode.elevationRad;
    const virtualSlantRangeKm = mode.virtualSlantRangeKm;
    if (elevationRad === null || virtualSlantRangeKm === null) {
      throw new RangeError(
        `mode ${mode.label} is supported but has no section 5.1 geometry, ` +
          `which slice B's invariant forbids.`,
      );
    }

    // The rule after equation (23) applies to "frequencies above the basic
    // MUF" only; at or below it the operating-frequency ray path IS the
    // basic-MUF-or-lower ray path (`absorptionRayPathFrequencyMHz` returns f
    // there), so the caller's basic-MUF elevation is not consulted and the
    // mode is neither frozen nor a substitution.
    const aboveBasicMuf = frequencyMHz > mode.basicMufMHz;
    const frozen = aboveBasicMuf
      ? (basicMufElevationRad?.(mode) ?? null)
      : null;
    if (aboveBasicMuf) {
      if (frozen === null) operatingRayPathModes += 1;
      else frozenRayPathModes += 1;
    }

    const absorption = absorptionLoss({
      route,
      hopCount: mode.hopCount,
      frequencyMHz,
      monthIndex,
      ssn,
      rayPathElevationRad: frozen ?? elevationRad,
      sample: absorptionSample,
      penetrationReflectionHeightKm,
    });
    if (absorption.kind === "unsupported") {
      return {
        ...nothing,
        state: "absorption_unavailable" as const,
        noContributionReason: absorption.detail,
      };
    }

    const auroral = auroralLoss({
      points: auroralSites(mode.layer),
      month: monthIndex + 1,
      midPathLocalTimeHours: midPathHours,
      transmissionRangeKm: mode.hopGroundDistanceKm,
    });

    const aboveMuf = aboveMufLoss({
      layer: mode.layer,
      frequencyMHz,
      basicMufMHz: mode.basicMufMHz,
    });

    const loss = basicTransmissionLossDb({
      frequencyMHz,
      virtualSlantRangeKm,
      absorptionDb: absorption.lossDb,
      aboveMufDb: aboveMuf.lossDb,
      groundReflectionDb: groundReflectionLossDb(mode.hopCount),
      auroralDb: auroral.lossDb,
      otherLossesDb,
    });

    const context: AntennaGainContext = {
      label: mode.label,
      layer: mode.layer,
      hopCount: mode.hopCount,
      elevationRad,
      elevationDeg: (elevationRad * 180) / Math.PI,
    };
    // Gt and Grw enter equations (17) and (43) directly. A fixed gain is
    // checked here on its first mode and a per-mode callback's return on
    // every mode, because "at the required azimuth angle and elevation
    // angle" (equation (17)) means the callback may legitimately answer
    // differently for each one.
    const transmitterGainDbi = gainDbi(transmitterGain, context);
    if (!Number.isFinite(transmitterGainDbi)) {
      throw new RangeError(
        `transmitterGain must produce a finite dBi value for mode ` +
          `${mode.label}, received ${String(transmitterGainDbi)}.`,
      );
    }
    const receiverGainDbi = gainDbi(receiverGain, context);
    if (!Number.isFinite(receiverGainDbi)) {
      throw new RangeError(
        `receiverGain must produce a finite dBi value for mode ` +
          `${mode.label}, received ${String(receiverGainDbi)}.`,
      );
    }

    const fieldStrengthDbuVPerM =
      FIELD_STRENGTH_CONSTANT_DB +
      transmitterPowerDbKw +
      transmitterGainDbi +
      20 * Math.log10(frequencyMHz) -
      loss.lossDb;
    const receiverPowerDbW =
      fieldStrengthDbuVPerM +
      receiverGainDbi -
      20 * Math.log10(frequencyMHz) -
      RECEIVER_POWER_CONSTANT_DB;

    return {
      ...identity,
      state: aboveMuf.aboveBasicMuf
        ? ("above_basic_muf_with_loss" as const)
        : ("supported" as const),
      noContributionReason: null,
      fieldStrengthDbuVPerM,
      receiverPowerDbW,
      basicTransmissionLoss: loss,
      aboveMuf,
      absorption,
      auroral,
      transmitterGainDbi,
      receiverGainDbi,
      elevationRad,
      virtualSlantRangeKm,
    };
  });

  const contributingModes = records.filter(
    (record) => record.fieldStrengthDbuVPerM !== null,
  );
  const unevaluatedModes = records.filter(
    (record) => record.state === "absorption_unavailable",
  );

  const fieldStrengthDbuVPerM = powerSumDb(
    contributingModes.map((record) => record.fieldStrengthDbuVPerM as number),
  );
  const receiverPowerDbW = powerSumDb(
    contributingModes.map((record) => record.receiverPowerDbW as number),
  );
  const dominantMode = contributingModes.reduce<ModeFieldStrength | null>(
    (best, record) =>
      best === null ||
      (record.receiverPowerDbW as number) > (best.receiverPowerDbW as number)
        ? record
        : best,
    null,
  );

  assumptions.push(
    `Pt is ${transmitterPowerDbKw.toFixed(2)} dB(1 kW) and the antenna gains ` +
      `are the caller's; a gain of 0 dBi is an isotropic radiator and is what ` +
      `this leaf uses when none is stated.`,
  );
  if (operatingRayPathModes > 0) {
    assumptions.push(
      `The absorption ray path was taken at the operating frequency for ` +
        `${String(operatingRayPathModes)} of ` +
        `${String(operatingRayPathModes + frozenRayPathModes)} evaluated ` +
        `modes above their basic MUF. Section 5.2.2 holds it at the basic ` +
        `MUF there; supply basicMufElevationRad to apply that rule.`,
    );
  }
  if (unevaluatedModes.length > 0) {
    assumptions.push(
      `${String(unevaluatedModes.length)} selected mode(s) contributed no ` +
        `power because their absorption could not be evaluated: ` +
        `${unevaluatedModes.map((record) => record.label).join(", ")}.`,
    );
  }

  return {
    kind: "field_strength",
    groundDistanceKm: modeSet.groundDistanceKm,
    frequencyMHz,
    modes: records,
    contributingModes,
    unevaluatedModes,
    fieldStrengthDbuVPerM,
    receiverPowerDbW,
    dominantMode,
    powerRange:
      modeSet.groundDistanceKm <= RECEIVER_POWER_MAX_KM
        ? "up_to_7000_km"
        : "blend_7000_to_9000_km",
    transmitterPowerDbKw,
    assumptions,
  };
}

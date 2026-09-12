/**
 * ITU-R P.533-14 section 5.2.2, the terms of the ray path basic transmission
 * loss Lb (PROP-08, #954 slice C).
 *
 * Equation (18), quoted whole:
 *
 *     Lb = 32.45 + 20 log f + 20 log p + Li + Lm + Lg + Lh + Lz
 *
 * with "f: transmitting frequency (MHz)" and "p: virtual slant range (km)"
 * of equation (19). This module owns four of those six terms as pure scalar
 * functions of named inputs:
 *
 *  - the free-space part, 32.45 + 20 log f + 20 log p;
 *  - Lm, the "above-the-MUF" loss of equations (24) to (26);
 *  - Lg, the summed ground-reflection loss of equation (27);
 *  - Lz, the fixed "other losses" term.
 *
 * Li is the absorption loss of equation (20) and lives in `absorptionLoss.ts`,
 * because it needs an ionosphere at every penetration point. Lh is the auroral
 * and other signal loss of Table 2 and lives in `auroralLoss.ts`, because it
 * needs a geomagnetic latitude at every Table 1d control point. Both are
 * summed into Lb here, through `basicTransmissionLossDb`, so that equation (18)
 * is written down exactly once.
 *
 * UNITS AND REFERENCE PLANE. Every quantity here is a loss in decibels, a
 * positive number, and Lb is a basic transmission loss: the loss between two
 * isotropic antennas, carrying no antenna gain and no feeder loss. Equation
 * (17), which `fieldStrengthShort.ts` owns, adds Gt to it; contract M08's
 * reference plane naming is stated there, not here.
 *
 * NOTHING IS CLAMPED except where the recommendation itself states a cap:
 * equations (25) and (26) each name one ("or 81 dB whichever is the smaller",
 * "or 62 dB whichever is the smaller") and those two are applied. A circuit
 * whose loss is enormous returns an enormous number.
 *
 * DEVIATIONS. Numbered, each with the published text and what the pinned ITU
 * reference build cd172be5 does instead. The recommendation is the authority
 * (mathematical contract M03 names the pinned P533.c as the oracle behind the
 * golden file, not as the definition of the method); where the two disagree we
 * follow the text and the difference is measured, declared and carried in
 * `fixtures/p533-short-field-strength.cases.json.reference_divergence`.
 *
 *  1. Lz, the "other losses" term. THE TEXT: "Lz: term containing those effects
 *     in sky-wave propagation not otherwise included in this method. The
 *     present recommended value is 8.72 dB given in section 5.2." THE
 *     REFERENCE: `MedianSkywaveFieldStrengthShort.c` line 19 defines
 *     `#define NOIL 9.14` and assigns it to `path->Lz`. WE FOLLOW THE TEXT.
 *     The consequence is exact and constant: every Lb here is 0.42 dB lower
 *     than the reference's and every field strength 0.42 dB higher, on every
 *     mode of every circuit. NOTE 1 under section 5.2 says Lz "is dependent on
 *     the elements of the prediction method, so that any changes in those
 *     elements should be accompanied by revision of the Lz value", and it is
 *     the excess loss between the predicted field strength and the D1 databank.
 *     That note is the reason the difference exists (the reference's method has
 *     other differences from the text, see deviations 2 and 3 and
 *     `absorptionLoss.ts`), and it is also the reason we cannot pick whichever
 *     number makes parity look better: 8.72 dB is the published value of the
 *     published method, and this module implements the published method.
 *  2. Lm for E modes. THE TEXT, equation (25): "For E modes for f > fb:
 *     Lm = 130 (f/fb - 1)^2 dB or 81 dB whichever is the smaller." THE
 *     REFERENCE: `MIN(46.0*pow(((f/BMUF) - 1.0), 0.5) + 5, 58.0)`, which is a
 *     square root rather than a square, an added 5 dB and a 58 dB cap. The two
 *     are not small variations of one another: at f/fb = 1.1 the text gives
 *     1.3 dB and the reference 19.5 dB; at f/fb = 1.4 the text gives 20.8 dB
 *     and the reference 34.1 dB; above f/fb = 1.79 the text saturates at 81 dB
 *     and the reference at 58 dB. WE FOLLOW THE TEXT.
 *  3. Lm for F2 modes. THE TEXT, equation (26): "For F2 modes for f > fb:
 *     Lm = 36 (f/fb - 1)^(1/2) dB or 62 dB whichever is the smaller." THE
 *     REFERENCE: two branches on the PATH length, which the text does not have
 *     at all: `MIN(36.0*pow((f/BMUF - 1.0), 0.5) + 5.0, 60.0)` for paths up to
 *     3000 km and `MIN(70.0*(f/BMUF - 1.0) + 8, 80.0)` beyond. The first is the
 *     published formula plus 5 dB with the cap moved from 62 to 60; the second
 *     is a different function. WE FOLLOW THE TEXT, so our above-MUF loss is
 *     5 dB smaller than the reference's on every short-path F2 mode below its
 *     cap, and differs by more on paths over 3000 km.
 *  4. The ray path the absorption term is taken over above the basic MUF. THE
 *     TEXT, immediately after equation (23): "For frequencies above the basic
 *     MUF, the absorption continues to vary with frequency and is calculated
 *     assuming the same ray-paths as those at the basic MUF." The frequency
 *     that ray path belongs to is `absorptionRayPathFrequencyMHz` below, and
 *     the only frequency-dependent part of the ray path is the section 5.1
 *     mirror height (through xr = f/foF2) and therefore the elevation angle and
 *     the angle of incidence; equation (20)'s own f and fv keep the operating
 *     frequency, which is what "the absorption continues to vary with
 *     frequency" says. THE REFERENCE does not implement this rule: it takes the
 *     elevation from the equation (2) height, which does not depend on
 *     frequency at all, so there is nothing in it to hold at the basic MUF.
 *     `fieldStrengthShort.ts` consumes this function and states what it does
 *     when the caller supplies no basic-MUF ray path.
 *
 * ONE READING THAT IS NOT A DEVIATION, because the reference agrees. "For
 * frequency f equal to or less than the basic MUF (fb) as defined in equation
 * (1) and equation (3) of the given mode: Lm = 0". Equation (1) is the E-layer
 * basic MUF and equation (3) the F2 one, and "of the given mode" makes fb the
 * MODE's basic MUF, not the path's. `PropagationMode.basicMufMHz` is that
 * quantity, and the reference compares against `path->Md_E[n].BMUF` and
 * `path->Md_F2[n].BMUF`, which are the same thing.
 */

/** Free-space constant of equation (18) for f in MHz and p in km, dB. */
export const FREE_SPACE_CONSTANT_DB = 32.45;

/**
 * Lz, the "other losses" term of equation (18), dB.
 *
 * 8.72 dB, the published value. See deviation 1 for the reference's 9.14 and
 * for why this is not a number to tune.
 */
export const OTHER_LOSSES_DB = 8.72;

/** Coefficient of equation (25), the E-mode above-the-MUF loss. */
export const E_ABOVE_MUF_COEFFICIENT = 130;

/** Cap of equation (25), dB: "or 81 dB whichever is the smaller". */
export const E_ABOVE_MUF_CAP_DB = 81;

/** Coefficient of equation (26), the F2-mode above-the-MUF loss. */
export const F2_ABOVE_MUF_COEFFICIENT = 36;

/** Cap of equation (26), dB: "or 62 dB whichever is the smaller". */
export const F2_ABOVE_MUF_CAP_DB = 62;

/**
 * The free-space part of equation (18), dB: `32.45 + 20 log f + 20 log p`.
 *
 * `p` is the equation (19) virtual slant range of the WHOLE n-hop circuit, not
 * of one hop, because equation (19) already carries the factor n. Passing a
 * single hop's range understates the spreading by `20 log n`.
 */
export function freeSpaceLossDb(
  frequencyMHz: number,
  virtualSlantRangeKm: number,
): number {
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) {
    throw new RangeError(
      `frequencyMHz must be positive and finite, received ${String(frequencyMHz)}.`,
    );
  }
  if (!Number.isFinite(virtualSlantRangeKm) || virtualSlantRangeKm <= 0) {
    throw new RangeError(
      `virtualSlantRangeKm must be positive and finite, received ` +
        `${String(virtualSlantRangeKm)}.`,
    );
  }
  return (
    FREE_SPACE_CONSTANT_DB +
    20 * Math.log10(frequencyMHz) +
    20 * Math.log10(virtualSlantRangeKm)
  );
}

/**
 * Lg, equation (27), dB: "summed ground-reflection loss at intermediate
 * reflection points: For an n-hop mode: Lg = 2(n - 1)".
 *
 * Zero for a one-hop mode, which has no intermediate ground reflection at all.
 * The recommendation puts no terrain, sea-state or polarisation dependence on
 * it and neither does this: 2 dB per intermediate bounce, whatever is under it.
 */
export function groundReflectionLossDb(hopCount: number): number {
  if (!Number.isInteger(hopCount) || hopCount < 1) {
    throw new RangeError(
      `hopCount must be a positive integer, received ${String(hopCount)}.`,
    );
  }
  return 2 * (hopCount - 1);
}

/** Which of equations (25) and (26) applies. */
export type AboveMufLayer = "E" | "F2";

export interface AboveMufLossInputs {
  readonly layer: AboveMufLayer;
  readonly frequencyMHz: number;
  /** fb, the basic MUF OF THIS MODE: equation (1) for E, equation (3) for F2. */
  readonly basicMufMHz: number;
}

export interface AboveMufLoss {
  /** Lm, dB. Zero at or below the basic MUF, equation (24). */
  readonly lossDb: number;
  /** Whether f is above fb, which is contract M07's fourth mode state. */
  readonly aboveBasicMuf: boolean;
  /** Whether the published cap of equation (25) or (26) is what was returned. */
  readonly capped: boolean;
  /** f / fb, carried because a report that shows Lm should be able to say why. */
  readonly frequencyRatio: number;
}

/**
 * Lm, the "above-the-MUF" loss of equations (24) to (26), dB.
 *
 * Equation (24): "For frequency f equal to or less than the basic MUF (fb) as
 * defined in equation (1) and equation (3) of the given mode: Lm = 0". The
 * comparison is "equal to or less than", so a mode exactly at its basic MUF
 * takes no loss.
 *
 * Equation (25), E modes, f > fb: `Lm = 130 (f/fb - 1)^2` or 81 dB, the
 * smaller. Equation (26), F2 modes, f > fb: `Lm = 36 (f/fb - 1)^(1/2)` or
 * 62 dB, the smaller. See deviations 2 and 3 for the reference's own formulas,
 * which are neither of these.
 */
export function aboveMufLoss(inputs: AboveMufLossInputs): AboveMufLoss {
  const { layer, frequencyMHz, basicMufMHz } = inputs;
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) {
    throw new RangeError(
      `frequencyMHz must be positive and finite, received ${String(frequencyMHz)}.`,
    );
  }
  if (!Number.isFinite(basicMufMHz) || basicMufMHz <= 0) {
    throw new RangeError(
      `basicMufMHz must be positive and finite, received ${String(basicMufMHz)}.`,
    );
  }
  const frequencyRatio = frequencyMHz / basicMufMHz;
  if (frequencyMHz <= basicMufMHz) {
    return { lossDb: 0, aboveBasicMuf: false, capped: false, frequencyRatio };
  }
  const excess = frequencyRatio - 1;
  const uncapped =
    layer === "E"
      ? E_ABOVE_MUF_COEFFICIENT * excess ** 2
      : F2_ABOVE_MUF_COEFFICIENT * Math.sqrt(excess);
  const capDb = layer === "E" ? E_ABOVE_MUF_CAP_DB : F2_ABOVE_MUF_CAP_DB;
  return {
    lossDb: Math.min(uncapped, capDb),
    aboveBasicMuf: true,
    capped: uncapped >= capDb,
    frequencyRatio,
  };
}

/**
 * The frequency the absorption term's RAY PATH is evaluated at, MHz.
 *
 * Section 5.2.2, after equation (23): "For frequencies above the basic MUF, the
 * absorption continues to vary with frequency and is calculated assuming the
 * same ray-paths as those at the basic MUF." So the geometry is frozen at fb
 * while equation (20)'s own f keeps the operating frequency: `min(f, fb)` for
 * the ray path, f everywhere else.
 *
 * This is a statement about the section 5.1 mirror height, which depends on the
 * frequency through xr = f/foF2, and therefore about the elevation angle of
 * equation (13) and the angle of incidence of equation (22). It says nothing
 * about the penetration points, which section 5.2.2 fixes at a 300 km
 * reflection height for every mode and every frequency; see `absorptionLoss.ts`.
 */
export function absorptionRayPathFrequencyMHz(
  frequencyMHz: number,
  basicMufMHz: number,
): number {
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) {
    throw new RangeError(
      `frequencyMHz must be positive and finite, received ${String(frequencyMHz)}.`,
    );
  }
  if (!Number.isFinite(basicMufMHz) || basicMufMHz <= 0) {
    throw new RangeError(
      `basicMufMHz must be positive and finite, received ${String(basicMufMHz)}.`,
    );
  }
  return Math.min(frequencyMHz, basicMufMHz);
}

/** The six terms of equation (18), each already in dB. */
export interface BasicTransmissionLossTerms {
  readonly frequencyMHz: number;
  /** p, equation (19), for the whole circuit, km. */
  readonly virtualSlantRangeKm: number;
  /** Li, equation (20). */
  readonly absorptionDb: number;
  /** Lm, equations (24) to (26). */
  readonly aboveMufDb: number;
  /** Lg, equation (27). */
  readonly groundReflectionDb: number;
  /** Lh, Table 2. */
  readonly auroralDb: number;
  /**
   * Lz. Defaults to the published 8.72 dB and exists as an input only so a
   * caller can state a different published edition's value; no product caller
   * passes anything.
   */
  readonly otherLossesDb?: number;
}

export interface BasicTransmissionLoss {
  /** Lb, dB, equation (18). */
  readonly lossDb: number;
  /** `32.45 + 20 log f + 20 log p`, dB, itemised for a signal-budget report. */
  readonly freeSpaceDb: number;
  readonly absorptionDb: number;
  readonly aboveMufDb: number;
  readonly groundReflectionDb: number;
  readonly auroralDb: number;
  readonly otherLossesDb: number;
}

/**
 * Lb, the ray path basic transmission loss of equation (18), dB.
 *
 * A sum, itemised. The itemisation is not decoration: contract M08 requires the
 * heads to declare which mechanisms a loss already contains, and a consumer
 * that cannot see the parts cannot make that declaration without guessing.
 */
export function basicTransmissionLossDb(
  terms: BasicTransmissionLossTerms,
): BasicTransmissionLoss {
  // Every term is itself already a loss in dB (equations (20), (24)-(27) and
  // the fixed Lz), and none of this codebase's own producers can emit a
  // negative one: Li (dRegion.ts's absorptionTerm) is a product of ATnoon
  // (measured minimum ~66 across its whole fitted domain), the penetration
  // factor phi (floored at its own 1.0 or clamped to >= 0) and F(chi) (floored
  // at 0.02), all divided by a positive (1 + 0.0067 R12) and cos i; Lm
  // (aboveMufLoss) is a square or a square root of a non-negative excess,
  // capped but never floored below zero; Lg (groundReflectionLossDb) is
  // 2(n - 1) for an integer n >= 1; Lh (auroralLoss) is a mean over Table 2
  // entries that are all in [0, 21.4] dB, or zero below 42.5 degrees; and a
  // caller-supplied otherLossesDb (Lz) is a loss by definition. A direct
  // caller of this leaf bypasses whichever module computed a term, so a
  // non-finite or negative value is only ever caught here.
  if (!Number.isFinite(terms.absorptionDb) || terms.absorptionDb < 0) {
    throw new RangeError(
      `absorptionDb must be finite and non-negative, received ` +
        `${String(terms.absorptionDb)}.`,
    );
  }
  if (!Number.isFinite(terms.aboveMufDb) || terms.aboveMufDb < 0) {
    throw new RangeError(
      `aboveMufDb must be finite and non-negative, received ` +
        `${String(terms.aboveMufDb)}.`,
    );
  }
  if (
    !Number.isFinite(terms.groundReflectionDb) ||
    terms.groundReflectionDb < 0
  ) {
    throw new RangeError(
      `groundReflectionDb must be finite and non-negative, received ` +
        `${String(terms.groundReflectionDb)}.`,
    );
  }
  if (!Number.isFinite(terms.auroralDb) || terms.auroralDb < 0) {
    throw new RangeError(
      `auroralDb must be finite and non-negative, received ` +
        `${String(terms.auroralDb)}.`,
    );
  }
  if (
    terms.otherLossesDb !== undefined &&
    (!Number.isFinite(terms.otherLossesDb) || terms.otherLossesDb < 0)
  ) {
    throw new RangeError(
      `otherLossesDb must be finite and non-negative, received ` +
        `${String(terms.otherLossesDb)}.`,
    );
  }
  const freeSpaceDb = freeSpaceLossDb(
    terms.frequencyMHz,
    terms.virtualSlantRangeKm,
  );
  const otherLossesDb = terms.otherLossesDb ?? OTHER_LOSSES_DB;
  return {
    lossDb:
      freeSpaceDb +
      terms.absorptionDb +
      terms.aboveMufDb +
      terms.groundReflectionDb +
      terms.auroralDb +
      otherLossesDb,
    freeSpaceDb,
    absorptionDb: terms.absorptionDb,
    aboveMufDb: terms.aboveMufDb,
    groundReflectionDb: terms.groundReflectionDb,
    auroralDb: terms.auroralDb,
    otherLossesDb,
  };
}

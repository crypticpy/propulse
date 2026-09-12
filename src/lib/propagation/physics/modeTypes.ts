/**
 * The propagation-mode record, ITU-R P.533-14 section 5.2.1 (PROP-08, #954
 * slice B).
 *
 * One plain data type, shared by every later slice. A mode is a layer, a hop
 * count, the geometry that hop implies, the basic MUF of section 3.5, the
 * E-layer screening frequency of section 4, and a status saying whether
 * P.533-14 considers it at all. No class, no methods: slice C sums field
 * strengths over these, slice E reports them, and neither should have to ask a
 * mode to recompute itself.
 *
 * WHICH HEIGHT THE ELEVATION ANGLE IS TAKEN AT. Section 5.1 is headed
 * "Elevation angle" and defines equation (13)'s hr itself:
 *
 *     "d:  hop length of an n-hop mode given by d = D/n
 *      hr: equivalent plane-mirror reflection height
 *          for E modes hr = 110 km
 *          for F2 modes hr is taken as a function of time, location and hop
 *          length."
 *
 * and then gives the (a), (b), (c) formulas for that height immediately below
 * ("The mirror reflection height for F2 modes, hr, is calculated as follows").
 * So equation (13)'s hr for an F2 mode IS the section 5.1 height, the long
 * G/J/U formula in `geometry/reflectionHeight.ts`, evaluated at this mode's own
 * hop length. That is what `mirrorHeightKm` holds and what `elevationRad`,
 * `elevationDeg` and `virtualSlantRangeKm` are computed from. It is the number
 * every product surface uses, and `traceRayPath` already ships this reading
 * (#1108).
 *
 * Equation (2)'s height, `hr = min(1490/M(3000)F2 - 176, 500)`, is a different
 * quantity with a different job. Section 3.5.1.1 uses it to find the
 * lowest-order mode n0 "by geometrical considerations", and section 5.2.1's
 * first bullet repeats it as the height the *set of modes* is chosen at, with
 * M(3000)F2 read at the mid-path control point up to dmax and at the Table 1c
 * control point with the lower foF2 beyond. It decides which modes exist. It
 * does not appear in equation (13).
 *
 * WHICH HEIGHT THE MODE'S EXISTENCE IS DECIDED AT. Section 5.2.1's first
 * criterion is headed "mirror-reflection heights" and is one of the criteria
 * every selected mode "meets": "for E modes, from a height hr = 110 km; for F2
 * modes, from a height hr determined from equation (2)". So whether a mode
 * reflects at all, and the reference's 3 degree floor that goes with section
 * 3.5.1.1's "geometrical considerations", are read off the equation (2) height.
 * `selectionMirrorHeightKm`, `selectionElevationDeg` and
 * `selectionSlantRangeKm` are that geometry, and `status` and
 * `unsupportedReason` are the only things computed from them.
 *
 * THOSE FIELDS ARE ALSO THE REFERENCE COMPARATOR.
 * `MedianSkywaveFieldStrengthShort()` in the pinned ITU build cd172be5 computes
 * the mode elevation, and so the slant range, the antenna gains and everything
 * downstream, from the equation (2) height; only the elevation inside
 * `ELayerScreeningFrequency()` uses the section 5.1 height. That is a defect of
 * the same kind as its G polynomial dropping the published `+ 90.47 xr` term:
 * the golden columns prove what the reference does, not what the recommendation
 * says. Because the selection geometry is that same geometry,
 * `selectionElevationDeg` and `selectionSlantRangeKm` are exactly the oracle's
 * `ele`, `DMele` and `ptick`, and `parity.modeSet.test.ts` asserts those columns
 * against them. That is the whole mechanism: this leaf carries no model-identity
 * switch and never will, because mathematical contract M03 defines the
 * `itu-reference-cd172be` identity as the pinned P533.c sequence itself, run
 * through the PROP-06 harness, and says no transcription substitutes for it.
 * The TypeScript leaves are `propulse-physics-v1`, which is why the G
 * polynomial's `+ 90.47 xr` term (#1133) and the Rop table (#1154) follow the
 * published text too. Selecting the elevation geometry by model id would make
 * one leaf a partial re-implementation of an identity it cannot satisfy; the
 * `selection...` fields make the reference's reading visible without
 * recomputing it. NO FIELD STRENGTH, ANTENNA GAIN OR LOSS MAY BE COMPUTED FROM
 * THEM. Slice C takes `elevationRad` and `virtualSlantRangeKm`, which means its
 * own golden Ew and Pr parity inherits this declared divergence rather than
 * hiding it.
 *
 * On G03, 1576.37 km with a section 5.1 height of 191.62 km, equation (13)
 * gives 9.91 degrees and the reference reports ele = DMele = 16.69 degrees,
 * which is equation (13) at the 297.68 km equation (2) height. Both numbers are
 * on this record, under names that say which is which.
 *
 * TWO CASES THE RECOMMENDATION DOES NOT ADDRESS, AND THE RULING ON THEM. The
 * two heights are independent, so a hop the equation (2) height reflects can be
 * longer than the section 5.1 height reaches; and section 5.1's (a), (b), (c)
 * are polynomial fits that the recommendation bounds nowhere below, so they can
 * return a height at or under zero outright. Equation (13) is an arctangent
 * with no floor, so it returns a negative angle in the first case and equation
 * (19) returns nothing; in the second there is no mirror for equation (13) to
 * be taken at. P.533-14 says what to do with neither, and the reference never
 * meets either, because it reports the equation (2) elevation for every mode.
 *
 * SUCH A MODE CONTRIBUTES, AT THE SELECTION GEOMETRY (#954 slice E1;
 * `modeSet.ts` deviation 3). Section 5.2.1 is the text's authority on which
 * modes exist and it selects this mode; section 5.1's height is a fit whose
 * domain does not cover every hop the equation (2) height admits. Dropping a
 * mode the text says exists is the larger error, and the only closing geometry
 * the text supplies for it is equation (2)'s, which is also the geometry the
 * pinned reference uses for every mode. So `elevationRad`, `elevationDeg` and
 * `virtualSlantRangeKm` are taken at `selectionMirrorHeightKm` instead,
 * `elevationSource` reads `"selection_height"` rather than `"section_5_1"`,
 * and `geometryNote` records which section 5.1 failure happened and at what
 * height. `mirrorHeightKm` still holds the section 5.1 number, whatever it was.
 *
 * Only when the selection height cannot close the hop either is there no
 * geometry at all: the mode is then `geometrically_unsupported` with the reason
 * `no_reflection`, and `elevationRad`, `elevationDeg` and
 * `virtualSlantRangeKm` are `null` together. That is the only state in which
 * they are null.
 *
 * It happens on the golden corpus at G11 (6322.24 km, 2F2, selection height
 * 311.00 km, section 5.1 height 195.22 km), the one circuit where the
 * reference's own dominant mode cannot close its hop at its own section 5.1
 * height. Under the ruling that mode contributes at 3.71 degrees, the
 * reference's own elevation. The parity fixture declares the case and carries
 * the measured effect.
 *
 * STATUS. Mathematical contract M07 names four states. Slice B produces three
 * of them; `above_basic_muf_with_loss` is slice C's, because it needs the
 * above-MUF loss Lm of equations (24) to (26).
 *
 * A mode that fails a section 5.2.1 criterion is LABELLED, never dropped
 * (contract M07). The recommendation's own text is a selection rule - "up to
 * six F2 modes are selected, each of which meets all of the following separate
 * criteria" - and the reference simply skips the modes that fail. Skipping
 * them loses the reason, and the reason is what a report has to show: "this
 * band is closed because the E layer is screening every F2 mode" is a
 * different statement from "there are no F2 modes". The consumer filters on
 * `status === "supported"`; nothing here does it for them.
 *
 * Units: MHz, km, degrees and radians side by side (both, because the
 * recommendation's equations are in radians and every consumer of an elevation
 * angle in this codebase wants degrees, and converting at four call sites is
 * four chances to convert one of them twice).
 */

/** The two regular layers P.533-14 sections 2 to 5.2 admit. */
export type PropagationLayer = "E" | "F2";

/**
 * Whether P.533-14 considers this mode, and if not, why not.
 *
 *  - `supported`: the mode meets every section 5.2.1 criterion. It may still
 *    be above the basic MUF, which is slice C's `above_basic_muf_with_loss`
 *    and is not a slice B distinction.
 *  - `geometrically_unsupported`: the mode fails a criterion about where the
 *    ray goes. See `ModeUnsupportedReason` for which one.
 *  - `screened`: an F2 mode whose E-layer maximum screening frequency fs is at
 *    or above the operating frequency. Section 5.2.1 selects the F2 modes
 *    "which have an E-layer maximum screening frequency evaluated as described
 *    in section 4 which is less than the operating frequency", so `fs < f` is
 *    supported and `f <= fs` is screened. E modes are never screened: fs is
 *    the frequency at which the E layer stops the ray before it reaches the F2
 *    layer, which is not a question that can be asked of a mode reflecting
 *    from the E layer itself.
 */
export type ModeStatus = "supported" | "geometrically_unsupported" | "screened";

/**
 * Which criterion a `geometrically_unsupported` mode failed.
 *
 *  - `no_reflection`: equation (13) at `selectionMirrorHeightKm`, section
 *    5.2.1's own selection height, is at or below the horizon, so the mirror
 *    section 5.2.1's first criterion names cannot close a hop this long. The
 *    mode still reports the section 5.1 geometry when that height closes the
 *    hop; it is only when neither height closes it that `elevationRad`,
 *    `elevationDeg` and `virtualSlantRangeKm` are `null`, and this is the only
 *    reason under which that can happen. For an E mode the two heights are the
 *    same 110 km, so this is the only reason that can null the three on an E
 *    mode; `hop_exceeds_e_mode_limit` and `below_minimum_elevation` keep their
 *    selection geometry.
 *  - `below_minimum_elevation`: `selectionElevationDeg` is positive but under
 *    `MIN_ELEVATION_DEG`, the 3 degree floor the reference applies when it
 *    chooses the lowest-order mode. Section 3.5.1.1 puts that floor on the
 *    equation (2) geometry, so that is where it is applied. See `modeSet.ts`
 *    for why it can still fire on a mode the reference keeps.
 *  - `hop_exceeds_dmax`: section 5.2.1 admits as the lowest-order F2 mode only
 *    one "with a hop length up to dmax (km)". A lowest-order mode whose hop is
 *    longer than dmax fails that, and the higher orders are then considered on
 *    their own merits.
 *  - `hop_exceeds_e_mode_limit`: section 5.2.1 admits as the lowest-order E
 *    mode only one "with hop length up to 2 000 km".
 */
export type ModeUnsupportedReason =
  | "no_reflection"
  | "below_minimum_elevation"
  | "hop_exceeds_dmax"
  | "hop_exceeds_e_mode_limit";

export interface PropagationMode {
  /**
   * `${hopCount}${layer}`: "1F2", "2E". The reference's own report spelling
   * (`Report.c` prints `%1dE` and `%1dF2` from a single 0-8 index, 0-2 for E
   * and 3-8 for F2), so a golden `DMidx` can be matched against this directly.
   */
  readonly label: string;
  readonly layer: PropagationLayer;
  /** n, the number of hops. */
  readonly hopCount: number;
  /** d = D / n, km. */
  readonly hopGroundDistanceKm: number;
  /**
   * Equation (13)'s hr for this mode, km.
   *
   * 110 km for E modes and the section 5.1 height of this hop for F2 modes,
   * which is what section 5.1 says hr is. When `elevationSource` is
   * `"section_5_1"` (the normal case) this is the height every product number
   * on the record is computed from. Section 5.2.1's own selection height is
   * `selectionMirrorHeightKm`.
   *
   * Always the number section 5.1 produced, including the rare case where that
   * is not positive, or positive but too low to close this hop. The geometry
   * fields (`elevationRad`, `elevationDeg`, `virtualSlantRangeKm`) and every
   * product number derived from them are then taken at
   * `selectionMirrorHeightKm` instead, `elevationSource` is
   * `"selection_height"` and `geometryNote` says so; this field still reports
   * what section 5.1 gave and must not be used to recompute that geometry.
   */
  readonly mirrorHeightKm: number;
  /**
   * Equation (13) at the height `elevationSource` names, radians, or `null`
   * where neither height reaches this mode's hop.
   *
   * `"section_5_1"` (the normal case): equation (13) at `mirrorHeightKm`.
   * `"selection_height"`: equation (13) at `selectionMirrorHeightKm`, because
   * the section 5.1 height was not positive or could not close the hop. See the
   * module header's ruling.
   *
   * INVARIANT, shared with `elevationDeg` and `virtualSlantRangeKm`: the three
   * are `null` together, and only when `status` is `geometrically_unsupported`
   * with `unsupportedReason` `no_reflection`. A mode with any other status, or
   * any other reason, reports all three.
   */
  readonly elevationRad: number | null;
  /**
   * The same angle in degrees, and the angle a consumer points an antenna at.
   * `null` under the invariant on `elevationRad`.
   */
  readonly elevationDeg: number | null;
  /**
   * Which mirror height `elevationRad`, `elevationDeg` and
   * `virtualSlantRangeKm` were taken at.
   *
   * `"section_5_1"` for every mode whose section 5.1 height is positive and
   * closes the hop, which is section 5.1's own reading and the normal case.
   * `"selection_height"` for exactly the modes the ruling in the module header
   * covers, and for a `no_reflection` mode, which closed at neither height.
   * A consumer that must not mix the two readings can filter on this; a
   * consumer that only wants an angle can ignore it, because either way the
   * angle is equation (13) at a height P.533-14 names for this mode.
   */
  readonly elevationSource: "section_5_1" | "selection_height";
  /**
   * Why `elevationSource` is not `"section_5_1"`, in one sentence, or `null`
   * when it is.
   *
   * Prose for a report and for a test to read; nothing is computed from it. It
   * names the section 5.1 height that failed and how, so that a circuit whose
   * dominant mode is running on the fallback geometry says so on the record
   * rather than in a comment.
   */
  readonly geometryNote: string | null;
  /**
   * Equation (11) fs, MHz, or `null` where section 4 does not evaluate it.
   *
   * Equation (12) is taken at `elevationRad`, the mode's own elevation: section
   * 4 names "delta_F: elevation angle for the F2-layer mode (determined from
   * equation (13))", and now that equation (13) is evaluated at the section 5.1
   * height there is only one such angle. The separate screening elevation this
   * record used to carry has been folded away because it was the same number.
   *
   * `null` for every E mode, for every F2 mode on a path longer than 4000 km,
   * and for a mode with no elevation to take it at. `null` is not "zero": the reference's initialised 0.0 compares
   * below every operating frequency and so admits the mode, which is the same
   * outcome as not testing it, but it is a different claim and a report should
   * not print 0 MHz as a screening frequency.
   */
  readonly screeningFrequencyMHz: number | null;
  /** The basic MUF of this mode, MHz. Equation (1) for E, (3) or (7) for F2. */
  readonly basicMufMHz: number;
  /**
   * Equation (19) virtual slant range of the whole n-hop circuit, km, at the
   * height `elevationSource` names, or `null` under the invariant on
   * `elevationRad`.
   *
   * This is the length free-space spreading is computed over, so it is a
   * product number and it moves with whichever height the elevation was taken
   * at.
   */
  readonly virtualSlantRangeKm: number | null;
  /**
   * Equation (2)'s height for this mode, km: section 5.2.1's first criterion.
   *
   * 110 km for E modes, `min(1490/M(3000)F2 - 176, 500)` for F2 modes with
   * M(3000)F2 read at the mid-path control point up to dmax and at the Table 1c
   * control point with the lower foF2 beyond. `status` and `unsupportedReason`
   * are decided on this height, and nothing else is.
   */
  readonly selectionMirrorHeightKm: number;
  /**
   * Equation (13) at `selectionMirrorHeightKm`, degrees, or `null` where that
   * height cannot close the hop.
   *
   * Two things at once, and the doc says both because the name cannot. It is
   * the angle section 5.2.1's selection is decided on, and it is exactly what
   * ITU-R-HF cd172be5 reports as `ele` and `DMele`, so the golden columns are
   * asserted against it. NO FIELD STRENGTH, GAIN OR LOSS MAY BE COMPUTED FROM
   * IT: the angle a consumer points an antenna at is `elevationDeg`.
   */
  readonly selectionElevationDeg: number | null;
  /**
   * Equation (19) at `selectionMirrorHeightKm`, km, or `null` where that height
   * cannot close the hop.
   *
   * What ITU-R-HF cd172be5 reports as `ptick`. Benchmark only: nothing computes
   * a product number from it, and the length free-space spreading is taken over
   * is `virtualSlantRangeKm`.
   */
  readonly selectionSlantRangeKm: number | null;
  readonly status: ModeStatus;
  /** Non-null exactly when `status` is `geometrically_unsupported`. */
  readonly unsupportedReason: ModeUnsupportedReason | null;
}

/** `${hopCount}${layer}`, the reference's report spelling. */
export function modeLabel(layer: PropagationLayer, hopCount: number): string {
  return `${String(hopCount)}${layer}`;
}

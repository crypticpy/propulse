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
 * TWO MIRROR HEIGHTS, AND THEY ARE NOT THE SAME NUMBER. This is the single
 * most surprising thing in the record, so it is named here rather than left to
 * be discovered:
 *
 *  - `mirrorHeightKm` is the height the *elevation angle* is taken at. For E
 *    modes it is 110 km. For F2 modes section 5.2.1 gives it as equation (2),
 *    `hr = min(1490/M(3000)F2 - 176, 500)`, with M(3000)F2 read at the
 *    mid-path control point for paths up to dmax and at the Table 1c control
 *    point with the lower foF2 for paths from dmax to 9000 km.
 *  - `screeningReflectionHeightKm` is the section 5.1 mirror height, the long
 *    G/J/U formula in `geometry/reflectionHeight.ts`, evaluated at this mode's
 *    own hop length. It is F2-only and it exists only where section 4 asks for
 *    it, which is a path of 4000 km or less. It is what the reference reports
 *    as `DMhr`.
 *
 * Section 5.1 reads as though one height serves both purposes: equation (13)
 * is given with "hr: equivalent plane-mirror reflection height ... for F2
 * modes hr is taken as a function of time, location and hop length", which is
 * the section 5.1 height. The reference implementation does not do that. Its
 * `MedianSkywaveFieldStrengthShort()` computes the mode elevation, and so the
 * slant range, the antenna gains and everything downstream of them, from the
 * equation (2) height; only the elevation *inside* the screening calculation
 * (`ELayerScreeningFrequency()`) uses the section 5.1 height. The golden cases
 * settle it: on G03, 1576.37 km with DMhr = 191.62 km, equation (13) at the
 * section 5.1 height gives 9.91 degrees and the reference reports
 * ele = DMele = 16.69 degrees, which is equation (13) at an equation (2)
 * height near 298 km. We follow the reference because the oracle proves that
 * reading, and both heights are kept on the record so the choice stays
 * visible instead of collapsing into one field.
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
 *  - `no_reflection`: the take-off elevation of equation (13) is at or below
 *    the horizon, so a mirror at this height cannot close a hop this long.
 *  - `below_minimum_elevation`: the elevation is positive but under
 *    `MIN_ELEVATION_DEG`, the 3 degree floor the reference applies when it
 *    chooses the lowest-order mode. See `modeSet.ts` for why this can fire on
 *    a mode the reference keeps, and for the evidence that it does not fire on
 *    any golden case.
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
   * The mirror height the elevation angle was taken at, km. 110 km for E
   * modes, the equation (2) height for F2 modes. See the module header: this
   * is not the section 5.1 height.
   */
  readonly mirrorHeightKm: number;
  /** Equation (13) at `mirrorHeightKm`, radians. Zero or negative if the mode does not reflect. */
  readonly elevationRad: number;
  /** The same angle in degrees, for consumers and for the reference's `ele` column. */
  readonly elevationDeg: number;
  /**
   * The section 5.1 mirror height for this mode's hop, km, or `null`.
   *
   * F2 modes only, and only on a path of 4000 km or less: section 4 states
   * "E-layer screening of F2 modes is considered for paths up to 4 000 km",
   * and the height is computed as part of that. The reference reports it as
   * `DMhr` and leaves it at its initialised 0.0 on longer paths, which is the
   * same statement as this `null`.
   */
  readonly screeningReflectionHeightKm: number | null;
  /**
   * Equation (11) fs, MHz, or `null` where section 4 does not evaluate it.
   *
   * `null` for every E mode, and for every F2 mode on a path longer than
   * 4000 km. `null` is not "zero": the reference's initialised 0.0 compares
   * below every operating frequency and so admits the mode, which is the same
   * outcome as not testing it, but it is a different claim and a report should
   * not print 0 MHz as a screening frequency.
   */
  readonly screeningFrequencyMHz: number | null;
  /**
   * The elevation, in radians, that `screeningFrequencyMHz` was computed from.
   *
   * Equation (13) at `screeningReflectionHeightKm`, which is a different angle
   * from `elevationRad`. `null` wherever `screeningFrequencyMHz` is.
   */
  readonly screeningElevationRad: number | null;
  /** The basic MUF of this mode, MHz. Equation (1) for E, (3) or (7) for F2. */
  readonly basicMufMHz: number;
  /**
   * Equation (19) virtual slant range of the whole n-hop circuit, km, or
   * `null` when the mode does not reflect.
   *
   * Carried here because it is a property of this mode's geometry and because
   * it is the reference's `ptick` column, which is the only golden evidence
   * for which modes the mode set ends on.
   */
  readonly virtualSlantRangeKm: number | null;
  readonly status: ModeStatus;
  /** Non-null exactly when `status` is `geometrically_unsupported`. */
  readonly unsupportedReason: ModeUnsupportedReason | null;
}

/** `${hopCount}${layer}`, the reference's report spelling. */
export function modeLabel(layer: PropagationLayer, hopCount: number): string {
  return `${String(hopCount)}${layer}`;
}

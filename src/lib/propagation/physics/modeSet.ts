/**
 * ITU-R P.533-14 section 5.2.1, the modes considered (PROP-08, #954 slice B).
 *
 * Section 5.2.1, in full: "Up to three E modes (for paths up to 4 000 km) and
 * up to six F2 modes are selected, each of which meets all of the following
 * separate criteria:
 *
 *  - mirror-reflection heights:
 *      for E modes, from a height hr = 110 km;
 *      for F2 modes, from a height hr determined from equation (2), where
 *      M(3000)F2 is evaluated at the mid-path control point (path lengths up
 *      to dmax (km)), or at the control point given in Table 1c) for which
 *      foF2 has the lower value (path lengths from dmax to 9 000 km);
 *  - E modes: the lowest-order mode with hop length up to 2 000 km, and the
 *    next two higher-order modes;
 *  - F2 modes: the lowest-order mode with a hop length up to dmax (km) and the
 *    next five higher-order modes, which have an E-layer maximum screening
 *    frequency evaluated as described in section 4 which is less than the
 *    operating frequency."
 *
 * This module turns that paragraph into a list of `PropagationMode` records.
 * Every mode P.533 could name is on the list; the ones that fail a criterion
 * carry a status saying which, and are not dropped (contract M07). Nothing
 * here computes a field strength, and nothing here fetches an ionosphere: the
 * caller passes one `sample` callback, the same contract `basicMuf` takes,
 * widened only by R12 because the section 5.1 mirror height needs it.
 *
 * WHAT IS REUSED RATHER THAN REDONE.
 *
 *  - The basic MUF of every mode, its lowest order n0 and dmax come from
 *    `basicMuf()`. Equations (1), (3), (7) and (8) are not written twice, and
 *    the mode orders this module iterates are exactly the ones slice A found.
 *  - Equation (13), the elevation, is `hopGeometry()` in `geometry/hop.ts`:
 *    `delta = atan2(cos psi - R0/(R0 + hr), sin psi)` with `psi = d/(2 R0)` is
 *    the recommendation's `arctan(cot(d/2R0) - (R0/(R0+hr)) cosec(d/2R0))`
 *    written without the two reciprocals. The same call returns equation
 *    (19)'s virtual slant range, so the two cannot disagree about the angle.
 *  - Equation (2), `hr = min(1490/M(3000)F2 - 176, 500)`, is
 *    `mirrorHeightFromM3000F2`.
 *  - The section 5.1 mirror height is `f2ReflectionHeight`, and the Table 1c
 *    averaging rule is `selectControlPoints`.
 *  - Equations (11) and (12) are `eLayerScreening.ts`.
 *
 * THE TWO HEIGHTS, BECAUSE IT IS THE THING TO GET WRONG. They are different
 * quantities with different jobs and both are needed:
 *
 *  - EQUATION (2), `hr = min(1490/M(3000)F2 - 176, 500)`, decides WHICH MODES
 *    EXIST. Section 3.5.1.1 finds n0 at it and section 5.2.1's first bullet
 *    repeats it with the Table 1c rule for paths beyond dmax. It does not
 *    appear in equation (13).
 *  - SECTION 5.1's height, the long G/J/U formula of `reflectionHeight.ts`, is
 *    equation (13)'s hr. Section 5.1 is headed "Elevation angle" and defines it
 *    there: "hr: equivalent plane-mirror reflection height; for E modes
 *    hr = 110 km; for F2 modes hr is taken as a function of time, location and
 *    hop length", with the (a), (b), (c) formulas immediately below. Every
 *    elevation and every slant range on the mode record comes from it, and so
 *    does the incidence angle inside the screening frequency, which is why the
 *    record no longer carries a separate screening elevation: section 4's
 *    delta_F is "the elevation angle for the F2-layer mode (determined from
 *    equation (13))", and there is now only one such angle.
 *
 * Section 5.2.1's FIRST criterion is one of the criteria every selected mode
 * "meets", and it names the equation (2) height, so that height is where a
 * mode's existence is decided: `status` and `unsupportedReason` come from the
 * geometry at `selectionMirrorHeightKm` and from nothing else. The reference
 * takes equation (13) there too, which is the defect; because the geometry is
 * the same, `selectionElevationDeg` and `selectionSlantRangeKm` are exactly its
 * `ele`, `DMele` and `ptick`, and the golden columns are asserted against them.
 * See deviation 2 below and `modeTypes.ts`.
 *
 * WHERE THE REFERENCE AND THE TEXT DISAGREE, AND WHAT WE DO.
 *
 *  1. "The control point given in Table 1c) for which foF2 has the lower
 *     value" (path longer than dmax). Table 1c names three points on such a
 *     path: T + d0/2, M and R - d0/2. The reference's `SmallestCPfoF2()`
 *     searches all *five* control points, Table 1d's T + 1000 and R - 1000
 *     included, and then has a defect: it returns the argmin correctly unless
 *     the argmin is control point 0 (T + 1000), in which case its final
 *     "return the last non zero index" loop returns a different point
 *     altogether. WE FOLLOW THE TEXT and search Table 1c's three points.
 *     The golden cases do not settle it, and both readings were measured on
 *     the eight golden circuits longer than dmax. Ours reproduces the oracle's
 *     `ele` exactly on six of them and differs on G07 (0.0149 degrees, 3.778 km
 *     of slant range) and G10 (0.2055 degrees, 36.679 km). A five-point search
 *     without the reference's defect is no better: it reproduces G07 and G10
 *     and then misses G11 by 0.14 degrees and G13 by 0.018 degrees, because the
 *     reference's own defect moves its answer on those two. So the oracle
 *     agrees with neither reading everywhere, the text names three points, and
 *     three points is what we search. `parity.modeSet.test.ts` carries the
 *     measurement and gives G07 and G10 their own declared budget rather than
 *     widening everybody's.
 *  2. The elevation height. WE FOLLOW THE TEXT. Section 5.1 is headed
 *     "Elevation angle" and defines equation (13)'s hr in the same breath: "for
 *     F2 modes hr is taken as a function of time, location and hop length",
 *     followed by the (a), (b), (c) formulas for exactly that height. The
 *     reference instead computes the mode elevation, the slant range and every
 *     downstream gain from the equation (2) height, and uses the section 5.1
 *     height only for the elevation inside `ELayerScreeningFrequency()`. That
 *     is a defect of the same kind as its G polynomial dropping the published
 *     `+ 90.47 xr` term: the golden `ele`, `DMele` and `ptick` columns prove
 *     what the reference does, not what the recommendation says. This codebase
 *     already ships the section 5.1 height for elevation in `traceRayPath`
 *     (#1108), so following it here also makes the two agree.
 *     The cost is declared, not hidden: `selectionElevationDeg` and
 *     `selectionSlantRangeKm` carry the reference's reading, the golden columns
 *     are asserted against THOSE at the derived budgets, and the divergence
 *     between the product elevation and the golden value is recorded per case
 *     in the fixture's `reference_divergence` block with a wide bound so that
 *     drift is noticed and is never presented as parity. Slice C's field
 *     strength consumes `elevationRad` and `virtualSlantRangeKm`, so its own
 *     golden Ew and Pr parity inherits this divergence.
 *     WHAT DOES NOT MOVE IS THE MODE SET. Section 5.2.1's first criterion names
 *     the equation (2) height, so `status` stays on that geometry; taking the
 *     section 5.1 elevation as the selection test instead was measured and
 *     would label the reference's own dominant mode `geometrically_unsupported`
 *     on three of the fourteen golden circuits (G09 at 2.55 degrees, G13 at
 *     2.23, G11 below the horizon at -0.21), which is a different and much
 *     larger claim than a shifted angle.
 *     AND ONE CASE NEITHER READING ADDRESSES. The two heights being
 *     independent, the section 5.1 height can fail to close a hop that the
 *     selection height reflects: equation (13) then returns an angle at or
 *     below zero and equation (19) returns nothing. P.533-14 does not say what
 *     to do, and the reference never meets the case because it reports the
 *     equation (2) elevation. Such a mode is labelled
 *     `geometrically_unsupported` with the reason
 *     `mirror_height_cannot_close_hop`, its `elevationRad`, `elevationDeg` and
 *     `virtualSlantRangeKm` are null rather than a negative angle, and its
 *     `selection...` fields stay populated so the record still shows why the
 *     mode was selected. It happens on G11 alone in the golden corpus, the one
 *     circuit where the reference's own dominant mode is not supported at its
 *     own section 5.1 height; the fixture declares that in
 *     `reference_divergence.below_horizon_case` and slice C excludes the mode
 *     under contract M07. See `modeTypes.ts`.
 *  3. The 3 degree elevation floor. `MIN_ELEVATION_DEG` is the reference's
 *     `MINELEANGLES`, which it applies when choosing n0 and never again. It is
 *     applied here to `selectionElevationDeg`, because section 3.5.1.1 puts it
 *     on the equation (2) geometry: "the lowest-order mode, n0, is determined
 *     by geometrical considerations, using the mirror reflection height hr
 *     derived at the mid-path control point from the equation (2)". It can
 *     still fire on a mode the reference keeps, because beyond dmax section
 *     5.2.1 moves that height to the Table 1c point with the lower foF2 while
 *     n0 was chosen at the mid-path one. `parity.modeSet.test.ts` records that
 *     it never fires on the golden corpus and `modeSet.test.ts` constructs a
 *     state where it does.
 *  4. The reference's E-mode loop `break`s at the first mode that fails a
 *     criterion instead of continuing. The criteria are monotone in n - a
 *     higher order means a shorter hop, a higher elevation and a larger basic
 *     MUF - so the two are the same set. We continue, because a labelled mode
 *     list with a hole in it is worse than one without.
 *
 * TWO OF SECTION 5.2.1'S CRITERIA ARE ALREADY SUBSUMED, AND ARE WRITTEN ANYWAY.
 * "The lowest-order mode with hop length up to 2 000 km" (E) and "with a hop
 * length up to dmax (km)" (F2) cannot fail as long as n0 comes from
 * `lowestOrderHopCount`, which admits n only when `D/n` is under
 * `min(maxHopForMinElevationKm(hr), 4000)`:
 *  - for E, `maxHopForMinElevationKm(110)` is 2 R0 (pi/2 - 3 deg - i(3 deg,
 *    110 km)) = 1775.6 km, which is under 2000 km, so every E mode n0 admits
 *    already satisfies the criterion;
 *  - for F2, `min(maxHopForMinElevationKm(hr), 4000)` is at or under dmax over
 *    the whole physical range of M(3000)F2 and foF2/foE (swept in
 *    `modeSet.test.ts`, maximum gap 0 km).
 * The criteria are still tested here, because they are the recommendation's
 * words and because the subsumption is a property of another leaf's gate, not
 * of section 5.2.1. If `lowestOrderHopCount` ever loosens, the criterion has to
 * survive it.
 *
 * Units: MHz, km, radians on the wire and degrees beside them.
 */

import {
  hopGeometry,
  mirrorHeightFromM3000F2,
} from "@/lib/propagation/geometry/hop";
import { f2ReflectionHeight } from "@/lib/propagation/geometry/reflectionHeight";
import type {
  GeodeticPoint,
  ResolvedRoute,
} from "@/lib/propagation/geometry/route";
import {
  basicMuf,
  E_LAYER_MIRROR_HEIGHT_KM,
  MIN_ELEVATION_DEG,
  type BasicMufMode,
  type MufControlPointState,
  type ResolvedBasicMuf,
  type SampledControlPoint,
  type UnsupportedBasicMuf,
} from "./basicMuf";
import {
  selectControlPoints,
  type ControlPointLabel,
  type ControlPointSite,
} from "./controlPoints";
import {
  isScreened,
  pathScreeningFoE,
  screeningFrequencyMHz,
  type PathScreeningFoE,
} from "./eLayerScreening";
import {
  modeLabel,
  type ModeUnsupportedReason,
  type PropagationMode,
} from "./modeTypes";

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Section 5.2.1's limit on the lowest-order E mode's hop, km: "the lowest-order
 * mode with hop length up to 2 000 km".
 *
 * Numerically the same as `MID_POINT_ONLY_PATH_KM`, Table 1's first
 * breakpoint, and deliberately not that constant: one is a statement about how
 * far a single E hop is worth considering, the other about when a path needs
 * more than one control point. They agree today by coincidence of the
 * recommendation's round numbers, not by derivation.
 */
export const E_MODE_MAX_HOP_KM = 2000;

/** Everything a control point has to answer for a mode set. */
export interface ModeControlPointState extends MufControlPointState {
  /**
   * The smoothed sunspot number the state was evaluated at, as the section 5.1
   * mirror height's `dM` term needs it. Already clipped to the model's
   * ceiling by whatever produced the state; this module does not clip.
   */
  readonly r12: number;
}

export type ModeControlPointSampler = (
  point: GeodeticPoint,
  label: ControlPointLabel,
) => ModeControlPointState;

export interface ModeSetInputs {
  readonly route: ResolvedRoute;
  /** The operating frequency, MHz. Screening and the section 5.1 height need it. */
  readonly frequencyMHz: number;
  readonly sample: ModeControlPointSampler;
}

/** Which control point the equation (2) mode-existence height was read at. */
export type F2MirrorHeightSource =
  "mid_path" | "table_1c_lowest_fof2" | "no_f2_mode";

export interface ResolvedModeSet {
  readonly kind: "resolved";
  readonly groundDistanceKm: number;
  readonly frequencyMHz: number;
  /** dmax at M, restricted to 4000 km. Section 3.5.1.1. */
  readonly dmaxKm: number;
  /**
   * Section 5.2.1's first criterion, the equation (2) height for this path, km.
   *
   * The height the mode SET is chosen at, not the height any elevation a
   * consumer reads is taken at. It is also the reference's elevation height, so
   * it is what the `selection...` comparator fields on each mode come from.
   */
  readonly f2SelectionMirrorHeightKm: number | null;
  readonly f2SelectionMirrorHeightSource: F2MirrorHeightSource;
  /** The control point `f2SelectionMirrorHeightKm` came from. */
  readonly f2SelectionMirrorHeightLabel: ControlPointLabel | null;
  /** Section 4's foE for this path, or the statement that it has none. */
  readonly screening: PathScreeningFoE;
  /** Every mode P.533-14 names, E modes first, each in ascending hop order. */
  readonly modes: readonly PropagationMode[];
  /** The subset section 5.2.1 selects. A convenience, not a second truth. */
  readonly supportedModes: readonly PropagationMode[];
  /** Slice A's result, carried so a caller need not solve it twice. */
  readonly basicMuf: ResolvedBasicMuf;
  /** Every control point sampled, once each, in the order first asked. */
  readonly controlPoints: readonly SampledControlPoint[];
}

export interface UnsupportedModeSet {
  readonly kind: "unsupported";
  readonly reason: UnsupportedBasicMuf["reason"];
  readonly detail: string;
  readonly groundDistanceKm: number;
}

export type ModeSetResult = ResolvedModeSet | UnsupportedModeSet;

interface SampledPoint {
  readonly site: ControlPointSite;
  readonly state: ModeControlPointState;
}

/**
 * The modes P.533-14 section 5.2.1 considers for one circuit at one frequency.
 *
 * Returns `unsupported` only where slice A does: beyond 9000 km, where the
 * short-path method does not apply, and where no mode of either layer reaches
 * at all. A path whose every mode is screened is still `resolved`, with an
 * empty `supportedModes` and six labelled reasons why.
 */
export function modeSet({
  route,
  frequencyMHz,
  sample,
}: ModeSetInputs): ModeSetResult {
  const D = route.groundDistanceKm;
  if (!Number.isFinite(D) || D <= 0) {
    throw new RangeError(
      `the route has no usable ground distance (${String(D)} km).`,
    );
  }
  if (!Number.isFinite(frequencyMHz) || frequencyMHz <= 0) {
    throw new RangeError(
      `frequencyMHz must be positive and finite, received ${String(frequencyMHz)}.`,
    );
  }

  // One sample per distinct control point. `basicMuf` asks for M and, on a
  // long path, Table 1a's two; section 4 asks for Table 1b's; both heights ask
  // for Table 1c's. Several of those are the same place.
  const seen = new Map<string, ModeControlPointState>();
  const controlPoints: SampledControlPoint[] = [];
  const cachedSample: ModeControlPointSampler = (point, label) => {
    const key = `${label}|${String(point.latitudeDeg)}|${String(point.longitudeDeg)}`;
    const hit = seen.get(key);
    if (hit !== undefined) return hit;
    const state = sample(point, label);
    seen.set(key, state);
    controlPoints.push({ label, point, state });
    return state;
  };

  const muf = basicMuf({ route, sample: cachedSample });
  if (muf.kind !== "resolved") {
    return {
      kind: "unsupported",
      reason: muf.reason,
      detail: muf.detail,
      groundDistanceKm: D,
    };
  }

  const screening = pathScreeningFoE({ route, sample: cachedSample });

  // Section 5.2.1's first criterion: the equation (2) height the F2 mode set is
  // chosen at, taken at M for a path up to dmax and at the Table 1c control
  // point with the lower foF2 beyond. NOT the height a reported elevation is
  // taken at; see the module header.
  let f2SelectionMirrorHeightKm: number | null = null;
  let f2SelectionMirrorHeightSource: F2MirrorHeightSource = "no_f2_mode";
  let f2SelectionMirrorHeightLabel: ControlPointLabel | null = null;
  let table1cPoints: readonly SampledPoint[] = [];

  if (muf.f2 !== null) {
    const d0 = D / muf.f2.lowestOrderHopCount;
    const selection = selectControlPoints({
      route,
      purpose: "reflection_height",
      layer: "F2",
      dmaxKm: muf.dmaxKm,
      hopGroundDistanceKm: d0,
    });
    /* c8 ignore next 6 -- Table 1c has a row for every path under 9000 km and
       `basicMuf` already refused the rest, so this cannot be reached; it is
       here because treating a missing row as "use the midpoint" would put a
       plausible wrong height on every long circuit. */
    if (selection.kind !== "points") {
      throw new Error(
        `Table 1c named no control point for a ${D.toFixed(1)} km path: ${selection.reason}`,
      );
    }
    table1cPoints = selection.points.map((site) => ({
      site,
      state: cachedSample(site.point, site.label),
    }));

    if (D <= muf.dmaxKm) {
      // `basicMuf` already took equation (2) at M; taking it again from the
      // same M(3000)F2 would be a second chance to disagree.
      f2SelectionMirrorHeightKm = muf.mirrorHeightKm;
      f2SelectionMirrorHeightSource = "mid_path";
      f2SelectionMirrorHeightLabel = "M";
    } else {
      const lowest = table1cPoints.reduce((a, b) =>
        b.state.foF2MHz < a.state.foF2MHz ? b : a,
      );
      f2SelectionMirrorHeightKm = mirrorHeightFromM3000F2(lowest.state.m3000F2);
      f2SelectionMirrorHeightSource = "table_1c_lowest_fof2";
      f2SelectionMirrorHeightLabel = lowest.site.label;
    }
  }

  const modes: PropagationMode[] = [];
  for (const mode of muf.e?.modes ?? []) {
    modes.push(
      buildEMode({
        mode,
        groundDistanceKm: D,
        lowestOrderHopCount: muf.e?.lowestOrderHopCount ?? mode.hopCount,
      }),
    );
  }
  for (const mode of muf.f2?.modes ?? []) {
    modes.push(
      buildF2Mode({
        mode,
        groundDistanceKm: D,
        frequencyMHz,
        dmaxKm: muf.dmaxKm,
        lowestOrderHopCount: muf.f2?.lowestOrderHopCount ?? mode.hopCount,
        selectionMirrorHeightKm: f2SelectionMirrorHeightKm as number,
        screening,
        table1cPoints,
      }),
    );
  }

  return {
    kind: "resolved",
    groundDistanceKm: D,
    frequencyMHz,
    dmaxKm: muf.dmaxKm,
    f2SelectionMirrorHeightKm,
    f2SelectionMirrorHeightSource,
    f2SelectionMirrorHeightLabel,
    screening,
    modes,
    supportedModes: modes.filter((mode) => mode.status === "supported"),
    basicMuf: muf,
    controlPoints,
  };
}

interface EModeInputs {
  readonly mode: BasicMufMode;
  readonly groundDistanceKm: number;
  readonly lowestOrderHopCount: number;
}

function buildEMode({
  mode,
  groundDistanceKm,
  lowestOrderHopCount,
}: EModeInputs): PropagationMode {
  const geometry = hopGeometry({
    groundDistanceKm,
    hopCount: mode.hopCount,
    mirrorHeightKm: E_LAYER_MIRROR_HEIGHT_KM,
  });
  const closes = geometry.kind === "supported";
  const elevationDeg = closes ? geometry.elevationAngleRad * RAD_TO_DEG : null;
  const base: ModeBase = {
    label: modeLabel("E", mode.hopCount),
    layer: "E",
    hopCount: mode.hopCount,
    hopGroundDistanceKm: mode.hopGroundDistanceKm,
    mirrorHeightKm: E_LAYER_MIRROR_HEIGHT_KM,
    elevationRad: closes ? geometry.elevationAngleRad : null,
    elevationDeg,
    // Section 4 screens F2 modes with the E layer; an E mode has no fs.
    screeningFrequencyMHz: null,
    basicMufMHz: mode.basicMufMHz,
    virtualSlantRangeKm: closes ? geometry.virtualSlantRangeKm : null,
    // Section 5.1 says hr = 110 km for E modes and equation (2) is an F2
    // formula, so selection and report are the same geometry here, and the
    // reference agrees with us on E modes.
    selectionMirrorHeightKm: E_LAYER_MIRROR_HEIGHT_KM,
    selectionElevationDeg: elevationDeg,
    selectionSlantRangeKm: closes ? geometry.virtualSlantRangeKm : null,
  };

  // First, because it is the one reason that leaves the record with no
  // elevation to report. `lowestOrderHopCount` only admits an E mode whose hop
  // 110 km reaches, so this is unreachable today; the invariant is stated by
  // the type and has to hold here as well as in `buildF2Mode`.
  if (!closes) return unsupportedMode(base, "mirror_height_cannot_close_hop");
  const reason =
    mode.hopCount === lowestOrderHopCount &&
    mode.hopGroundDistanceKm > E_MODE_MAX_HOP_KM
      ? "hop_exceeds_e_mode_limit"
      : (elevationDeg as number) < MIN_ELEVATION_DEG
        ? "below_minimum_elevation"
        : null;
  if (reason !== null) return unsupportedMode(base, reason);
  return { ...base, status: "supported", unsupportedReason: null };
}

interface F2ModeInputs {
  readonly mode: BasicMufMode;
  readonly groundDistanceKm: number;
  readonly frequencyMHz: number;
  readonly dmaxKm: number;
  readonly lowestOrderHopCount: number;
  /** Equation (2)'s height for the path: section 5.2.1's first criterion. */
  readonly selectionMirrorHeightKm: number;
  readonly screening: PathScreeningFoE;
  readonly table1cPoints: readonly SampledPoint[];
}

function buildF2Mode(inputs: F2ModeInputs): PropagationMode {
  const {
    mode,
    groundDistanceKm,
    frequencyMHz,
    dmaxKm,
    lowestOrderHopCount,
    selectionMirrorHeightKm,
    screening,
    table1cPoints,
  } = inputs;

  // Section 5.2.1's first criterion, which decides whether the mode is there at
  // all: "for F2 modes, from a height hr determined from equation (2)". Every
  // status and every reason below is read off this geometry, and it is also the
  // geometry the pinned reference reports as ele, DMele and ptick.
  const selection = hopGeometry({
    groundDistanceKm,
    hopCount: mode.hopCount,
    mirrorHeightKm: selectionMirrorHeightKm,
  });
  const selectionSupported = selection.kind === "supported";
  const selectionElevationDeg = selection.elevationAngleRad * RAD_TO_DEG;

  // Equation (13)'s hr, which section 5.1 defines as the section 5.1 height of
  // this mode's own hop. Every number a consumer reads comes from here.
  const mirrorHeightKm = sectionFiveOneHeightKm({
    groundDistanceKm,
    hopCount: mode.hopCount,
    frequencyMHz,
    table1cPoints,
  });
  const geometry = hopGeometry({
    groundDistanceKm,
    hopCount: mode.hopCount,
    mirrorHeightKm,
  });
  // The two heights are independent, so a hop equation (2) reflects can be
  // longer than the section 5.1 height reaches. Equation (13) returns a
  // negative angle there and equation (19) returns nothing; the recommendation
  // addresses neither, so the mode is labelled and reports no elevation at all.
  // See the `modeTypes.ts` header.
  const closes = geometry.kind === "supported";

  // Equations (11) and (12), section 4. Section 4 names "delta_F: elevation
  // angle for the F2-layer mode (determined from equation (13))", and now that
  // equation (13) is read as section 5.1 defines it there is exactly one such
  // angle, so the screening frequency and the reported elevation cannot drift
  // apart.
  const fsMHz =
    screening.kind === "evaluated" && closes
      ? screeningFrequencyMHz(screening.foEMHz, geometry.elevationAngleRad)
      : null;

  const base: ModeBase = {
    label: modeLabel("F2", mode.hopCount),
    layer: "F2",
    hopCount: mode.hopCount,
    hopGroundDistanceKm: mode.hopGroundDistanceKm,
    mirrorHeightKm,
    elevationRad: closes ? geometry.elevationAngleRad : null,
    elevationDeg: closes ? geometry.elevationAngleRad * RAD_TO_DEG : null,
    screeningFrequencyMHz: fsMHz,
    basicMufMHz: mode.basicMufMHz,
    virtualSlantRangeKm: closes ? geometry.virtualSlantRangeKm : null,
    selectionMirrorHeightKm,
    selectionElevationDeg: selectionSupported ? selectionElevationDeg : null,
    selectionSlantRangeKm: selectionSupported
      ? selection.virtualSlantRangeKm
      : null,
  };

  // Tested before section 5.2.1's own criteria, because it is the one reason
  // that leaves the record with no elevation to report, and the type's
  // invariant is that the three product fields are null exactly here.
  if (!closes) return unsupportedMode(base, "mirror_height_cannot_close_hop");
  if (!selectionSupported) return unsupportedMode(base, "no_reflection");

  // Section 5.2.1's own criterion first, the reference's elevation floor
  // second: both end as `geometrically_unsupported`, so the order decides only
  // which reason a report shows, and the recommendation's reason is the one to
  // show.
  const reason: ModeUnsupportedReason | null =
    mode.hopCount === lowestOrderHopCount && mode.hopGroundDistanceKm > dmaxKm
      ? "hop_exceeds_dmax"
      : selectionElevationDeg < MIN_ELEVATION_DEG
        ? "below_minimum_elevation"
        : null;
  if (reason !== null) return unsupportedMode(base, reason);

  return {
    ...base,
    status: isScreened(fsMHz, frequencyMHz) ? "screened" : "supported",
    unsupportedReason: null,
  };
}

interface SectionFiveOneInputs {
  readonly groundDistanceKm: number;
  readonly hopCount: number;
  readonly frequencyMHz: number;
  readonly table1cPoints: readonly SampledPoint[];
}

/**
 * The section 5.1 mirror height of one mode, km.
 *
 * Section 5.1: "In the case of paths up to dmax (km), hr is evaluated at the
 * path mid-point: for longer paths, it is determined for all the control
 * points given in Table 1c) and the mean value is used." `selectControlPoints`
 * already returned the right list for the path length - one point or three -
 * so the mean is over whatever it gave, and there is no second length test
 * here to disagree with it.
 *
 * The hop count is pinned to this mode's, so every control point answers for
 * the same hop rather than re-deriving one from its own M(3000)F2.
 */
function sectionFiveOneHeightKm({
  groundDistanceKm,
  hopCount,
  frequencyMHz,
  table1cPoints,
}: SectionFiveOneInputs): number {
  /* c8 ignore next 6 -- `modeSet` throws before it builds any F2 mode if
     Table 1c named no control point, so the list is never empty here; the
     guard is present because averaging over nothing would produce NaN and a
     NaN height reflects every hop. */
  if (table1cPoints.length === 0) {
    throw new Error(
      "the section 5.1 mirror height needs at least one Table 1c control point.",
    );
  }
  const sum = table1cPoints.reduce(
    (total, { state }) =>
      total +
      f2ReflectionHeight({
        m3000F2: state.m3000F2,
        foF2MHz: state.foF2MHz,
        foEMHz: state.foEMHz,
        r12: state.r12,
        frequencyMHz,
        groundDistanceKm,
        hopCount,
      }).heightKm,
    0,
  );
  return sum / table1cPoints.length;
}

type ModeBase = Omit<PropagationMode, "status" | "unsupportedReason">;

function unsupportedMode(
  base: ModeBase,
  unsupportedReason: ModeUnsupportedReason,
): PropagationMode {
  return { ...base, status: "geometrically_unsupported", unsupportedReason };
}

/**
 * Mirror-reflection hop geometry for HF circuits (PROP-03, #949), implementing
 * the mathematical contract's M06 hop fixtures and the slant-range quantity
 * M15's absorption pass accounting is defined against.
 *
 * Conventions and units:
 *
 *  - Earth radius `R0 = EARTH_RADIUS_KM` (6371 km), the same declared sphere
 *    `route.ts` resolves on. Heights are kilometres above that sphere.
 *  - Angles held on a result are **radians** and named `...Rad`. Distances are
 *    kilometres. Nothing here is rounded; rounding belongs at a presentation
 *    boundary, not in a physics leaf.
 *  - The model is the ITU-R P.533-14 mirror reflection: an `n`-hop circuit of
 *    ground length `D` is `n` identical hops of length `D/n`, each reflecting
 *    from a mirror at height `hr`.
 *
 * The quantities, with the relations they come from. `psi` is the half-hop
 * angle subtended at the Earth's centre:
 *
 *      psi   = D / (2 n R0)
 *      delta = atan2(cos(psi) - R0/(R0 + hr), sin(psi))       elevation angle
 *      sin(i_h) = (R0 / (R0 + h)) cos(delta)                  incidence at h
 *      p'    = |2 R0 sin(psi) / cos(delta + psi)| * n         virtual slant range
 *
 * `p'` is P.533-14 equation (19). It is the path length the wave actually
 * travels, and it is the length that free-space spreading must be computed
 * over. Using the ground range `D` instead understates the spreading loss by
 * `20 log10(p'/D)` on every circuit, which is where issue #949 starts.
 *
 * `delta <= 0` means the ray leaves below the local horizon: with that mirror
 * height the hop is geometrically longer than one reflection can reach. That is
 * not a small number to clamp away, it is a statement that the requested mode
 * does not exist, and it is returned as an `unsupported` result. The previous
 * implementation clamped the elevation to 1 degree, which manufactured a mode
 * that closes the circuit at any distance.
 *
 * D-region pass accounting (P.533-14 `PEN = TRUE`): an `n`-hop ray crosses the
 * absorbing D region `2n` times, once on the way up and once on the way down
 * per hop. The crossings are placed at the penetration points, offset from each
 * hop end by the ground distance the ray covers below 90 km:
 *
 *      dh90 = R0 (pi/2 - delta - i_90)
 *
 * so hop `k` (0-based, hop ground length `dh = D/n`) is entered at
 * `k dh + dh90` and left at `(k+1) dh - dh90`. Absorption is evaluated at each
 * of those `2n` points and averaged, then multiplied back by the pass count in
 * the absorption leaf. Evaluating the whole circuit once at a single midpoint,
 * as the shipped code does, is a different quantity with a different magnitude.
 *
 * Mirror height: `hr = min(1490 / M(3000)F2 - 176, 500)` km, P.533-14
 * equation (2). It is the height section 3.5.1.1 determines the hop count at
 * and the height section 5.2.1 takes F2 mode elevations from, and it is the
 * only hr this leaf claims. The full P.533-14 section 5.1 mirror height, which
 * additionally depends on the foF2/foE ratio, the operating frequency and the
 * hop length, is a different quantity and lives in `reflectionHeight.ts`
 * (#1108); `physics/modeSet.ts` uses it for the E-layer screening elevation of
 * section 4 and equation (2) for everything else, and its header carries the
 * evidence for why the two are not interchangeable. A true hmF2 is still not
 * modelled anywhere: `estimateHmF2`, the `250 + 100 (1 - cos z)` heuristic that
 * used to stand in for this, has no physical basis and is removed rather than
 * reused.
 */

import { EARTH_RADIUS_KM } from "./route";

/** D-region reference height for the absorption passes, km. */
export const D_REGION_HEIGHT_KM = 90;

/** Height the P.533-14 equation (20) incidence angle is taken at, km. */
export const ABSORPTION_INCIDENCE_HEIGHT_KM = 110;

/** Upper bound on the mirror height, km. P.533-14 section 5.1. */
export const MAX_MIRROR_HEIGHT_KM = 500;

/**
 * Largest hop count this module will name or solve.
 *
 * Not a physical claim: the longest circuit on Earth is the circumference, and
 * at the lowest mirror height anyone would call ionospheric that is under two
 * hundred hops. The bound exists so that no loop here can be driven by a
 * caller's number without end, including the case where the count is so large
 * that adding one to it is the same float.
 */
export const MAX_HOP_COUNT = 1000;

export interface HopGeometryInputs {
  /** Ground distance of the whole circuit along its resolved route, km. */
  readonly groundDistanceKm: number;
  /** Number of hops. A positive integer. */
  readonly hopCount: number;
  /** Mirror reflection height, km above the declared sphere. */
  readonly mirrorHeightKm: number;
  /**
   * Optional cache namespace, normally an `ionosphereStateDigest`.
   *
   * The geometry itself is a pure function of the three numbers above, so the
   * memo key is built from them; the digest only namespaces the entry so a
   * changed ionospheric state can never be served a stale hop. Passing nothing
   * simply shares the unnamespaced namespace, which is correct because the
   * numbers are the whole input.
   */
  readonly stateDigest?: string;
}

export type UnsupportedHopReason = "below_horizon";

export interface SupportedHopGeometry {
  readonly kind: "supported";
  readonly hopCount: number;
  /** Ground distance of one hop, km. */
  readonly hopGroundDistanceKm: number;
  /** Half-hop angle subtended at the Earth's centre, radians. */
  readonly halfHopAngleRad: number;
  /** Elevation (takeoff) angle, radians. Strictly positive. */
  readonly elevationAngleRad: number;
  /** Angle of incidence at 110 km, radians. P.533-14 equation (20). */
  readonly incidenceAngle110Rad: number;
  /** Angle of incidence at 90 km, radians. */
  readonly incidenceAngle90Rad: number;
  /** Virtual slant range of the whole circuit, km. P.533-14 equation (19). */
  readonly virtualSlantRangeKm: number;
  /** Ground distance covered below 90 km on one leg, km. */
  readonly dRegionOffsetKm: number;
  /**
   * Fractions along the whole route, in increasing order, at which the ray
   * crosses the D region. Length is exactly `2 * hopCount`.
   */
  readonly penetrationFractions: readonly number[];
  /** Mirror height this geometry was solved at, km. */
  readonly mirrorHeightKm: number;
}

export interface UnsupportedHopGeometry {
  readonly kind: "unsupported";
  readonly reason: UnsupportedHopReason;
  readonly detail: string;
  /** The elevation angle that failed, radians. Zero or negative. */
  readonly elevationAngleRad: number;
  /** Longest hop this mirror height can reach, km. */
  readonly maximumHopGroundDistanceKm: number;
}

export type HopGeometry = SupportedHopGeometry | UnsupportedHopGeometry;

/**
 * Mirror height from M(3000)F2, km.
 *
 * `hr = min(1490 / M(3000)F2 - 176, 500)`. See the module header for what this
 * is and, more importantly, for what it is not.
 */
export function mirrorHeightFromM3000F2(m3000F2: number): number {
  if (!Number.isFinite(m3000F2) || m3000F2 <= 0) {
    throw new RangeError(
      `M(3000)F2 must be a positive finite number, received ${String(m3000F2)}.`,
    );
  }
  return Math.min(1490 / m3000F2 - 176, MAX_MIRROR_HEIGHT_KM);
}

/** The one mirror-height check, so every entry point rejects the same set. */
function assertMirrorHeight(mirrorHeightKm: number): void {
  if (!Number.isFinite(mirrorHeightKm) || mirrorHeightKm <= 0) {
    throw new RangeError(
      `mirrorHeightKm must be positive and finite, received ${String(mirrorHeightKm)}.`,
    );
  }
}

/**
 * Longest single hop a mirror at `hr` can reach, km.
 *
 * The limit is the grazing ray, `delta = 0`, at which `cos(psi) = R0/(R0+hr)`.
 */
export function maximumHopGroundDistanceKm(mirrorHeightKm: number): number {
  assertMirrorHeight(mirrorHeightKm);
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + mirrorHeightKm);
  return 2 * EARTH_RADIUS_KM * Math.acos(ratio);
}

/**
 * Take-off elevation of a single hop of the given ground length, radians.
 *
 * The one place this angle is computed, so the hop-count chooser and the
 * geometry solver decide a mode exists on the same arithmetic rather than on
 * two expressions that agree everywhere except on the boundary.
 */
function elevationAngleRadFor(
  hopGroundDistanceKm: number,
  mirrorHeightKm: number,
): number {
  const halfHopAngleRad = hopGroundDistanceKm / (2 * EARTH_RADIUS_KM);
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + mirrorHeightKm);
  return Math.atan2(
    Math.cos(halfHopAngleRad) - ratio,
    Math.sin(halfHopAngleRad),
  );
}

/**
 * Fewest hops that keep the elevation angle above the horizon.
 *
 * Returned so a caller can choose a mode honestly instead of clamping one that
 * does not exist. The result is a count, not a claim that the mode propagates.
 *
 * The grazing limit is exclusive: a hop of exactly `maxHop` leaves at an
 * elevation of exactly zero, which `solve` rejects, so `ceil` returned a count
 * that does not exist whenever the distance was an exact multiple of the
 * limit. The count is therefore raised until the elevation angle is positive,
 * and it is the same expression `solve` evaluates, so the two can never
 * disagree about whether the mode they name exists. Comparing the quotient
 * against `maxHop` instead is not equivalent: a hop a hair inside the limit
 * can still round to a non-positive elevation.
 */
export function minimumHopCount(
  groundDistanceKm: number,
  mirrorHeightKm: number,
): number {
  // `traceRayPath` reaches this before it reaches `hopGeometry`, so this is
  // where a mirror height arriving from an option is first seen. An unchecked
  // zero or NaN here does not produce a wrong answer, it produces no answer:
  // the count starts at Infinity or NaN, the elevation test is never satisfied
  // and the loop below cannot end.
  assertMirrorHeight(mirrorHeightKm);
  if (!Number.isFinite(groundDistanceKm) || groundDistanceKm < 0) {
    throw new RangeError(
      `groundDistanceKm must be a non-negative finite number, received ${String(groundDistanceKm)}.`,
    );
  }

  const maxHop = maximumHopGroundDistanceKm(mirrorHeightKm);
  let hopCount = Math.max(1, Math.ceil(groundDistanceKm / maxHop));
  while (hopCount <= MAX_HOP_COUNT) {
    if (elevationAngleRadFor(groundDistanceKm / hopCount, mirrorHeightKm) > 0) {
      return hopCount;
    }
    hopCount += 1;
  }
  // The bound is the exit, not an afterthought inside the body: a count large
  // enough that adding one to it is the same float would otherwise loop for
  // ever, and a count this module would refuse to solve is not one it should
  // recommend either.
  throw new RangeError(
    `no hop count at or below ${String(MAX_HOP_COUNT)} gives a positive ` +
      `elevation angle over ${String(groundDistanceKm)} km with a mirror at ` +
      `${String(mirrorHeightKm)} km.`,
  );
}

/** Angle of incidence at height `h` for a ray of elevation `delta`. */
export function incidenceAngleRad(
  elevationAngleRad: number,
  heightKm: number,
): number {
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + heightKm);
  return Math.asin(ratio * Math.cos(elevationAngleRad));
}

const MEMO_LIMIT = 512;
const memo = new Map<string, HopGeometry>();

function solve(inputs: HopGeometryInputs): HopGeometry {
  const { groundDistanceKm, hopCount, mirrorHeightKm } = inputs;

  const hopGroundDistanceKm = groundDistanceKm / hopCount;
  const halfHopAngleRad = hopGroundDistanceKm / (2 * EARTH_RADIUS_KM);
  const elevationAngleRad = elevationAngleRadFor(
    hopGroundDistanceKm,
    mirrorHeightKm,
  );

  if (!(elevationAngleRad > 0)) {
    const maxHop = maximumHopGroundDistanceKm(mirrorHeightKm);
    return {
      kind: "unsupported",
      reason: "below_horizon",
      detail:
        `A ${hopCount}-hop mode over ${groundDistanceKm.toFixed(1)} km needs ` +
        `hops of ${hopGroundDistanceKm.toFixed(1)} km, but a mirror at ` +
        `${mirrorHeightKm.toFixed(1)} km reaches at most ${maxHop.toFixed(1)} ` +
        `km per hop. The takeoff angle is at or below the horizon, so this ` +
        `mode does not exist. Use at least ` +
        `${String(minimumHopCount(groundDistanceKm, mirrorHeightKm))} hops.`,
      elevationAngleRad,
      maximumHopGroundDistanceKm: maxHop,
    };
  }

  const incidenceAngle110Rad = incidenceAngleRad(
    elevationAngleRad,
    ABSORPTION_INCIDENCE_HEIGHT_KM,
  );
  const incidenceAngle90Rad = incidenceAngleRad(
    elevationAngleRad,
    D_REGION_HEIGHT_KM,
  );

  const virtualSlantRangeKm =
    Math.abs(
      (2 * EARTH_RADIUS_KM * Math.sin(halfHopAngleRad)) /
        Math.cos(elevationAngleRad + halfHopAngleRad),
    ) * hopCount;

  const dRegionOffsetKm =
    EARTH_RADIUS_KM * (Math.PI / 2 - elevationAngleRad - incidenceAngle90Rad);

  const penetrationFractions: number[] = [];
  for (let k = 0; k < hopCount; k += 1) {
    penetrationFractions.push(
      (k * hopGroundDistanceKm + dRegionOffsetKm) / groundDistanceKm,
      ((k + 1) * hopGroundDistanceKm - dRegionOffsetKm) / groundDistanceKm,
    );
  }

  return {
    kind: "supported",
    hopCount,
    hopGroundDistanceKm,
    halfHopAngleRad,
    elevationAngleRad,
    incidenceAngle110Rad,
    incidenceAngle90Rad,
    virtualSlantRangeKm,
    dRegionOffsetKm,
    penetrationFractions,
    mirrorHeightKm,
  };
}

/**
 * Solve the geometry of an `n`-hop mirror-reflection mode.
 *
 * Memoised: a circuit is re-solved by several callers per render (mode search,
 * absorption, the loss budget), and the solve is pure.
 */
export function hopGeometry(inputs: HopGeometryInputs): HopGeometry {
  const { groundDistanceKm, hopCount, mirrorHeightKm } = inputs;
  if (!Number.isFinite(groundDistanceKm) || groundDistanceKm <= 0) {
    throw new RangeError(
      `groundDistanceKm must be positive and finite, received ${String(groundDistanceKm)}.`,
    );
  }
  // The upper bound is load-bearing, not decorative: the penetration-point
  // loop below runs once per hop, so an absurd count is an unbounded loop
  // wearing the clothes of a valid integer.
  if (!Number.isInteger(hopCount) || hopCount < 1 || hopCount > MAX_HOP_COUNT) {
    throw new RangeError(
      `hopCount must be an integer between 1 and ${String(MAX_HOP_COUNT)}, received ${String(hopCount)}.`,
    );
  }
  assertMirrorHeight(mirrorHeightKm);

  const key = `${inputs.stateDigest ?? ""}|${groundDistanceKm}|${hopCount}|${mirrorHeightKm}`;
  const cached = memo.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const solved = solve(inputs);
  if (memo.size >= MEMO_LIMIT) {
    memo.clear();
  }
  memo.set(key, solved);
  return solved;
}

/** Drop every memoised hop. Exported for tests and for provider swaps. */
export function clearHopGeometryCache(): void {
  memo.clear();
}

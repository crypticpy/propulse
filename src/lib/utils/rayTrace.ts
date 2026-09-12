/**
 * Multi-hop ionospheric ray trace engine.
 *
 * This module is an adapter. The geometry lives in
 * `src/lib/propagation/geometry` and the absorption in
 * `src/lib/propagation/absorption`; what happens here is the assembly of a
 * circuit from those leaves, the per-hop quality score, and the loss budget.
 *
 * Conventions and units:
 *
 *  - Distances are kilometres, frequencies MHz, losses dB.
 *  - Nothing in this module rounds. `totalPathLossDb` is exactly the sum of
 *    the itemised `losses`, to the last bit, so a caller can subtract one term
 *    and get the rest. Rounding belongs in the component that renders a
 *    number, not in the engine that computes it.
 *  - Free-space spreading is taken over the **virtual slant range** of ITU-R
 *    P.533-14 equation (19), not the ground range. On the 100 km / 300 km
 *    audit fixture those differ by 15.688 dB, and the ground range is never
 *    the distance a skywave actually travels.
 *
 * Declared assumptions, surfaced on `RayTraceResult.assumptions` rather than
 * buried here:
 *
 *  1. The mirror reflection height. When the caller supplies
 *     `mirrorHeightKm` the assumption names that value and claims nothing
 *     else; when it does not, the declared 300 km stand-in is used and said
 *     to be a stand-in. The correct source is `mirrorHeightFromM3000F2` fed
 *     by the #953 climatology provider, which is asynchronous: a caller that
 *     has resolved it above this entry point passes `mirrorHeight`, and
 *     `RayTraceResult.mirrorHeight` then names that source rather than the
 *     stand-in. The previous stand-in, a `250 + 100 (1 - cos z)` heuristic,
 *     had no physical basis and is gone.
 *  2. The modified magnetic dip that selects the diurnal absorption exponent
 *     is computed here, by `modifiedDipAngle`, from the centred-dipole
 *     geomagnetic latitude rather than a field model at 100 km. This module
 *     chose that source, so this module is the layer that declares it; the
 *     absorption leaf only reports the values it was handed.
 *  3. The longitudinal gyrofrequency fL of equation (20) is computed here,
 *     per D-region crossing, as |fH sin(dip)| from the six-degree Magfit field
 *     expansion evaluated at the 100 km the recommendation specifies. This
 *     module chose that source, so this module declares it; the absorption
 *     leaf's 1.2 MHz scalar is no longer reached from this entry point.
 */

import { classifyTerrain, getPathTerrainLoss } from "./terrain";
import type { TerrainType } from "./terrain";
import {
  calculateF0E,
  calculateZenithAngle,
  estimateFoF2,
  modifiedDipAngle,
  obliqueIncidenceAngle,
  sfiToR12,
  solarNoonZenithAngle,
} from "./ionosphere";
import { getGeomagneticLatitude } from "./geomagnetic";
import {
  D2R,
  longitudinalGyrofrequencyMHz,
} from "@/lib/propagation/ionosphere/modip";
import {
  resolveRoute,
  routeSampleAtFraction,
  type GeodeticPoint,
  type AmbiguousRouteReason,
  type ResolvedRoute,
  type RouteResolution,
} from "@/lib/propagation/geometry/route";
import {
  hopGeometry,
  MAX_HOP_COUNT,
  minimumHopCount,
  type UnsupportedHopReason,
} from "@/lib/propagation/geometry/hop";
import type { F2ReflectionHeightBranch } from "@/lib/propagation/geometry/reflectionHeight";
import {
  dRegionAbsorption,
  type DRegionCrossing,
} from "@/lib/propagation/absorption/dRegion";

const DEG_TO_RAD = Math.PI / 180;
const TYPICAL_F2_HOP_KM = 3000;
const MAX_HOPS = 12;

/**
 * Declared mirror reflection height, km. See assumption 1 in the module
 * header. Exported so a caller that has a real M(3000)F2 can say so.
 */
export const DECLARED_MIRROR_HEIGHT_KM = 300;

/** Why a trace fell back to the declared 300 km stand-in. Never absent. */
export type MirrorHeightStandinReason =
  | "no_provider_supplied"
  | "provider_asset_unavailable"
  | "provider_query_rejected"
  | "circuit_unresolvable";

/**
 * One P.533-14 Table 1c control point a modelled height was evaluated at.
 * A circuit up to dmax has one (`M`); a longer one has three, and the height
 * is their mean.
 */
export interface MirrorHeightControlPoint {
  readonly label: "T + d0/2" | "M" | "R - d0/2";
  readonly latitude: number;
  readonly longitude: number;
  /** Section 5.1 height at this point for the circuit's mode, km. */
  readonly heightKm: number;
  readonly m3000F2: number;
  readonly foF2MHz: number;
  readonly foEMHz: number;
  readonly r12: number;
  readonly branch: F2ReflectionHeightBranch;
}

/**
 * Where the mirror reflection height came from. Never absent from a result.
 *
 * The three variants are the three honest answers: a climatology solved it
 * (`modelled`), the caller handed the engine a number and the engine claims
 * nothing about it (`caller_supplied`), or nobody supplied one and the module's
 * declared stand-in was used, with the reason (`declared_standin`).
 * `mirrorHeight.ts` is the leaf that produces the first and the last.
 */
export type MirrorHeightProvenance =
  | {
      readonly kind: "modelled";
      /**
       * The ITU-R P.533-14 section 5.1 F2 mirror height for this frequency
       * and circuit, km: the midpoint value for a circuit up to dmax, the
       * mean over the Table 1c control points beyond it. See
       * `propagation/geometry/reflectionHeight.ts` and `controlPoints`.
       */
      readonly heightKm: number;
      /** M(3000)F2 at the midpoint control point. */
      readonly m3000F2: number;
      /** foF2 at the control point, MHz. */
      readonly foF2MHz: number;
      /** foE at the control point, MHz. */
      readonly foEMHz: number;
      /** The R12 the ionospheric state was actually evaluated at. */
      readonly r12: number;
      /** The operating frequency the height was solved for, MHz. */
      readonly frequencyMHz: number;
      /** The circuit ground distance the height was solved for, km. */
      readonly groundDistanceKm: number;
      /** dmax at the control point, restricted to 4000 km. Equations (5), (6). */
      readonly dmaxKm: number;
      /** The hop count the height was solved for. */
      readonly hopCount: number;
      /** d0 = groundDistanceKm / hopCount, km. */
      readonly hopGroundDistanceKm: number;
      /** Which of section 5.1's cases produced the midpoint height. */
      readonly branch: F2ReflectionHeightBranch;
      /** The route the circuit distance was resolved on. */
      readonly routeDirection: "short" | "long";
      /**
       * Every Table 1c control point the height was evaluated at, in path
       * order. One entry for a circuit up to dmax, three beyond it.
       */
      readonly controlPoints: readonly MirrorHeightControlPoint[];
      readonly providerId: string;
      readonly providerVersion: string;
      /** `sha256:` of the coefficient asset the state was built from. */
      readonly artifactHash: string;
      /** The instant the climatology was read at. */
      readonly validAt: string;
      /** The place it was read at. */
      readonly coordinates: {
        readonly latitude: number;
        readonly longitude: number;
      };
      /**
       * `ionosphereStateDigest` of the state this height came from, or the
       * literal `"unknown"` when no digest could be formed, matching
       * `ContextSnapshot.sourceVersion`. Never an empty string.
       */
      readonly stateDigest: string;
      /** The state's own assumption list, carried, not summarised. */
      readonly assumptions: readonly string[];
    }
  | {
      readonly kind: "caller_supplied";
      readonly heightKm: number;
      readonly detail: string;
    }
  | {
      readonly kind: "declared_standin";
      readonly heightKm: typeof DECLARED_MIRROR_HEIGHT_KM;
      readonly reason: MirrorHeightStandinReason;
      /** Why the modelled value was not used. Never an empty string. */
      readonly detail: string;
    };

/**
 * The one sentence every stand-in is described by, so the prose assumption and
 * the structured provenance can never drift into two different explanations.
 */
const STANDIN_CAUSE: Readonly<Record<MirrorHeightStandinReason, string>> = {
  no_provider_supplied:
    "the caller supplied none: the #953 climatology provider that supplies " +
    "M(3000)F2 is asynchronous and is not wired into this synchronous entry " +
    "point yet",
  provider_asset_unavailable:
    "the #953 climatology provider's coefficient asset could not be loaded",
  provider_query_rejected:
    "the #953 climatology provider rejected the query for this place and " +
    "instant",
  circuit_unresolvable:
    "the circuit's endpoints are coincident or antipodal, so no great-circle " +
    "route fixes its control points",
};

/** The declared stand-in, labelled with why it was reached. */
export function declaredMirrorHeightStandin(
  reason: MirrorHeightStandinReason,
): Extract<MirrorHeightProvenance, { kind: "declared_standin" }> {
  return {
    kind: "declared_standin",
    heightKm: DECLARED_MIRROR_HEIGHT_KM,
    reason,
    detail:
      `Mirror reflection height is the declared ${String(DECLARED_MIRROR_HEIGHT_KM)} km ` +
      `stand-in, taken because ${STANDIN_CAUSE[reason]}.`,
  };
}

/** A bare number from the caller: used, and not dressed up as a model output. */
function callerSuppliedMirrorHeight(
  mirrorHeightKm: number,
): Extract<MirrorHeightProvenance, { kind: "caller_supplied" }> {
  return {
    kind: "caller_supplied",
    heightKm: mirrorHeightKm,
    detail:
      `Mirror reflection height is the caller-supplied ${String(mirrorHeightKm)} km. ` +
      "This engine makes no claim about where that value came from.",
  };
}

/** What the trace actually used for the mirror height, as one sentence. */
function mirrorHeightAssumption(provenance: MirrorHeightProvenance): string {
  if (provenance.kind === "modelled") {
    const points = provenance.controlPoints.length;
    const where =
      points > 1
        ? `the mean over the ${String(points)} Table 1c control points ` +
          `(${provenance.controlPoints.map((p) => `${p.label}: ${p.heightKm.toFixed(1)} km`).join(", ")})`
        : `at the midpoint control point (case ${provenance.branch})`;
    return (
      `Mirror reflection height is the modelled ${provenance.heightKm.toFixed(1)} km, ` +
      `the ITU-R P.533-14 section 5.1 F2 mirror height ${where} for ` +
      `${provenance.frequencyMHz.toFixed(1)} MHz over the ${provenance.routeDirection} ` +
      `route of ${provenance.groundDistanceKm.toFixed(0)} km as ${String(provenance.hopCount)} ` +
      `${provenance.hopCount === 1 ? "hop" : "hops"} of ` +
      `${provenance.hopGroundDistanceKm.toFixed(0)} km, solved at the midpoint from ` +
      `foF2 = ${provenance.foF2MHz.toFixed(2)} MHz, foE = ${provenance.foEMHz.toFixed(2)} MHz, ` +
      `M(3000)F2 = ${provenance.m3000F2.toFixed(3)}, R12 = ${provenance.r12.toFixed(1)} ` +
      `and dmax = ${provenance.dmaxKm.toFixed(0)} km read from ` +
      `${provenance.providerId} ${provenance.providerVersion} at ${provenance.validAt}.`
    );
  }
  return provenance.detail;
}

/** Tolerances inside which a modelled provenance describes this circuit. */
const PROVENANCE_DISTANCE_TOLERANCE_KM = 1;
const PROVENANCE_FREQUENCY_TOLERANCE_MHZ = 0.01;
const PROVENANCE_INSTANT_TOLERANCE_MS = 60 * 1000;

/**
 * Why a modelled provenance does not describe the circuit being traced, or
 * null when it does. A modelled height is solved for one frequency, one
 * route and one hop count, and its hop count is only meaningful on that
 * circuit. `useMirrorHeight` rounds the frequency to 0.01 MHz, the distance
 * to 1 km and the instant to the minute, so the tolerances are those.
 */
function modelledProvenanceMismatch(
  provenance: Extract<MirrorHeightProvenance, { kind: "modelled" }>,
  circuit: {
    groundDistanceKm: number;
    frequencyMHz: number;
    pathMode: "short" | "long";
    date: Date;
  },
): string | null {
  const reasons: string[] = [];
  if (provenance.routeDirection !== circuit.pathMode) {
    reasons.push(
      `it was solved on the ${provenance.routeDirection} route and this trace ` +
        `walks the ${circuit.pathMode} one`,
    );
  }
  if (
    Math.abs(provenance.groundDistanceKm - circuit.groundDistanceKm) >
    PROVENANCE_DISTANCE_TOLERANCE_KM
  ) {
    reasons.push(
      `it was solved for ${provenance.groundDistanceKm.toFixed(0)} km and this ` +
        `circuit is ${circuit.groundDistanceKm.toFixed(0)} km`,
    );
  }
  if (
    Math.abs(provenance.frequencyMHz - circuit.frequencyMHz) >
    PROVENANCE_FREQUENCY_TOLERANCE_MHZ
  ) {
    reasons.push(
      `it was solved for ${provenance.frequencyMHz.toFixed(2)} MHz and this ` +
        `trace runs at ${circuit.frequencyMHz.toFixed(2)} MHz`,
    );
  }
  const validAtMs = Date.parse(provenance.validAt);
  if (
    !Number.isFinite(validAtMs) ||
    Math.abs(validAtMs - circuit.date.getTime()) >
      PROVENANCE_INSTANT_TOLERANCE_MS
  ) {
    reasons.push(
      `it was read at ${provenance.validAt} and this trace is for ` +
        `${circuit.date.toISOString()}`,
    );
  }
  return reasons.length === 0 ? null : reasons.join("; ");
}

/**
 * Which of the three the caller asked for. A provenance wins over a bare
 * number: it carries the height as well as its source.
 */
function mirrorHeightOf(params: RayTraceInput): MirrorHeightProvenance {
  if (params.mirrorHeight !== undefined) return params.mirrorHeight;
  if (params.mirrorHeightKm !== undefined) {
    return callerSuppliedMirrorHeight(params.mirrorHeightKm);
  }
  return declaredMirrorHeightStandin("no_provider_supplied");
}

const DIP_ASSUMPTION =
  "Modified magnetic dip at every D-region crossing is computed here by " +
  "modifiedDipAngle() from the centred-dipole geomagnetic latitude, not by a " +
  "field model evaluated at the 100 km ITU-R P.533-14 specifies.";

const GYROFREQUENCY_ASSUMPTION =
  "Longitudinal gyrofrequency is |fH sin(dip)| from the six-degree Magfit " +
  "field expansion evaluated at 100 km at each D-region crossing, computed " +
  "here and supplied to the absorption leaf, so that leaf's declared 1.2 MHz " +
  "scalar is not used on this path.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RayTraceInput {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  frequencyMHz: number;
  date: Date;
  sfi: number;
  kp: number;
  txPowerWatts?: number;
  /** Great-circle direction to trace. Defaults to the short path. */
  pathMode?: "short" | "long";
  /**
   * Mirror reflection height, km. Defaults to the declared 300 km constant.
   * Supply `mirrorHeightFromM3000F2(m3000F2)` when a real M(3000)F2 is known,
   * or `mirrorHeight` when its source can be named too.
   */
  mirrorHeightKm?: number;
  /**
   * Mirror reflection height with its source, from `resolveMirrorHeight`. When
   * present it both sets the height and is carried onto the result verbatim,
   * and it takes precedence over `mirrorHeightKm`.
   */
  mirrorHeight?: MirrorHeightProvenance;
}

/** The itemised loss budget. The parts sum exactly to `totalPathLossDb`. */
export interface RayPathLosses {
  /** Free-space spreading over the virtual slant range, dB. */
  freeSpaceDb: number;
  /** D-region absorption for every pass of the mode, dB. */
  absorptionDb: number;
  /** Ground reflection loss at the intermediate bounce points, dB. */
  terrainDb: number;
  /** Polarisation coupling loss, dB. */
  polarisationDb: number;
}

/**
 * Why a circuit has no ray path, when it has none.
 *
 * Every consumer that reads `hops` must narrow on this first. A circuit whose
 * endpoints determine no great circle, which is what selecting your own QTH as
 * the target produces, returns zero hops; treating `hops[0]` or an
 * initial-value-free `reduce` as safe is how that becomes a crash rather than
 * a "no path" row. `reason` carries the route leaf's own classification so a
 * caller can say "same place", and the geometry leaf's own classification is
 * carried the same way so a caller can say "too far for one bounce", rather
 * than either falling back to the generic wording.
 */
export type RayPathSupport =
  | { kind: "supported" }
  | {
      kind: "ambiguous_geometry";
      reason: AmbiguousRouteReason;
      detail: string;
    }
  | {
      kind: "geometrically_unsupported";
      reason: UnsupportedHopReason;
      detail: string;
    };

export interface ReflectionPoint {
  lat: number;
  lon: number;
  distanceFromStartKm: number;
  fractionAlongPath: number;
  isDaytime: boolean;
  solarZenithAngle: number;
}

export interface HopQuality {
  reflectionPoint: ReflectionPoint;
  f0F2: number;
  hmF2: number;
  muf: number;
  absorptionDb: number;
  isFrequencySupported: boolean;
  qualityScore: number;
}

export interface RayTraceResult {
  hops: HopQuality[];
  totalAbsorptionDb: number;
  totalPathLossDb: number;
  isPathViable: boolean;
  limitingHop: number;
  overallScore: number;
  summary: string;
  terrainTypes?: TerrainType[];
  terrainLoss?: number;
  pathMode: "short" | "long";
  totalDistanceKm: number;
  /** Virtual slant range of the whole mode, km. P.533-14 equation (19). */
  virtualSlantRangeKm: number;
  /** Itemised loss budget. Sums exactly to `totalPathLossDb`. */
  losses: RayPathLosses;
  /** Whether a ray path exists at all, and why not when it does not. */
  support: RayPathSupport;
  /** Take-off elevation angle of the mode, degrees. */
  elevationAngleDeg: number;
  /** Number of D-region passes, `2 * hops`. */
  absorptionPassCount: number;
  /** Everything this result stands in for rather than models. */
  assumptions: readonly string[];
  /** Where the mirror reflection height came from. Never absent. */
  mirrorHeight: MirrorHeightProvenance;
}

export type PathViability =
  "excellent" | "good" | "marginal" | "unlikely" | "impossible";

// ---------------------------------------------------------------------------
// Great-circle geometry
// ---------------------------------------------------------------------------

/**
 * Resolve the great circle this trace runs on.
 *
 * Both directions come from one resolution, so the long path is the same
 * circle traversed the other way rather than a separately sampled polyline.
 */
function routeFor(
  input: Pick<
    RayTraceInput,
    "startLat" | "startLon" | "endLat" | "endLon" | "pathMode"
  >,
): RouteResolution {
  return resolveRoute(
    { latitudeDeg: input.startLat, longitudeDeg: input.startLon },
    { latitudeDeg: input.endLat, longitudeDeg: input.endLon },
    { direction: input.pathMode ?? "short" },
  );
}

function isResolved(route: RouteResolution): route is ResolvedRoute {
  return route.kind === "resolved";
}

// ---------------------------------------------------------------------------
// Solar geometry
// ---------------------------------------------------------------------------

// Solar zenith angle is delegated to the shared calculateZenithAngle in
// ionosphere.ts, which derives it from the SunCalc-based subsolar point
// (equation-of-time corrected) instead of the previous mean-sun approximation
// that could be off by up to ~4 deg of hour angle (~16 min).

// ---------------------------------------------------------------------------
// Ionospheric parameter estimation
// ---------------------------------------------------------------------------

// foF2 estimation is delegated to the shared, CCIR/URSI-calibrated
// estimateFoF2 in ionosphere.ts so the ray-trace engine and the ionosphere
// model no longer disagree (the previous local (1.2 + 0.016*SFI)*sqrt(cos chi)
// heuristic produced ~3.6 MHz at SFI 150 noon, far below observed magnitudes).

/**
 * Oblique MUF via the secant law with proper spherical incidence geometry:
 * MUF = foF2 * sec(i), where i is the angle of incidence at the reflection
 * height (obliqueIncidenceAngle). For a 3000 km / ~300 km hop this gives a
 * secant factor of ~3.0-3.6, consistent with M(3000)F2.
 */
export function calculateMUF(
  f0F2: number,
  elevationDeg: number,
  reflectionHeightKm: number,
): number {
  const incidenceDeg = obliqueIncidenceAngle(elevationDeg, reflectionHeightKm);
  const secantFactor = 1 / Math.max(0.05, Math.cos(incidenceDeg * DEG_TO_RAD));
  return f0F2 * secantFactor;
}

function freeSpacePathLoss(frequencyMHz: number, distanceKm: number): number {
  if (frequencyMHz <= 0 || distanceKm <= 0) return 0;
  return 32.45 + 20 * Math.log10(frequencyMHz) + 20 * Math.log10(distanceKm);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreHop(
  frequencyMHz: number,
  muf: number,
  absorptionDb: number,
  kp: number,
  reflectionLat: number,
  reflectionLon: number,
): number {
  const mufRatio = muf > 0 ? frequencyMHz / muf : 999;

  let mufScore: number;
  if (mufRatio > 1.0) mufScore = 0;
  else if (mufRatio > 0.95) mufScore = 15 * ((1.0 - mufRatio) / 0.05);
  else if (mufRatio > 0.85) mufScore = 15 + 45 * ((0.95 - mufRatio) / 0.1);
  else if (mufRatio > 0.5) mufScore = 60 + 40 * ((0.85 - mufRatio) / 0.35);
  else mufScore = 100;

  const absorptionPenalty = Math.min(40, absorptionDb * 1.3);

  // Auroral-zone degradation keys off geomagnetic latitude (IGRF-13 dipole),
  // not geographic latitude: the auroral oval follows the geomagnetic pole,
  // so a ~60 deg geomagnetic threshold is the physically correct trigger.
  let kpPenalty = 0;
  const geomagLat = Math.abs(
    getGeomagneticLatitude(reflectionLat, reflectionLon),
  );
  if (geomagLat > 60) {
    const latFactor = Math.min(1, (geomagLat - 60) / 20);
    kpPenalty = latFactor * kp * 3;
  }

  return Math.max(
    0,
    Math.min(100, Math.round(mufScore - absorptionPenalty - kpPenalty)),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Equally spaced ionospheric reflection points along a great-circle path.
 *
 * The samples are exact points of the resolved circle at `(2i+1)/2n` of its
 * length. There is no intermediate polyline and no index rounding, so the
 * long path is sampled as precisely as the short path and a point near a pole
 * or the date line is not snapped to a neighbouring vertex.
 *
 * Degenerate endpoints yield an empty array: no great circle is determined, so
 * there is nothing to reflect from.
 */
export function calculateReflectionPoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numHops: number,
  date: Date,
  pathMode: "short" | "long" = "short",
): ReflectionPoint[] {
  // The loop below runs once per hop, so the count is an iteration bound the
  // caller supplies. It is checked against the same limit the geometry solver
  // applies, rather than trusted because it happens to be an integer.
  if (!Number.isInteger(numHops) || numHops < 1 || numHops > MAX_HOP_COUNT) {
    throw new RangeError(
      `numHops must be an integer between 1 and ${String(MAX_HOP_COUNT)}, received ${String(numHops)}.`,
    );
  }
  const route = routeFor({ startLat, startLon, endLat, endLon, pathMode });
  if (!isResolved(route)) return [];

  const points: ReflectionPoint[] = [];
  for (let i = 0; i < numHops; i++) {
    const fraction = (2 * i + 1) / (2 * numHops);
    const { latitudeDeg: lat, longitudeDeg: lon } = routeSampleAtFraction(
      route,
      fraction,
    );
    const zenith = calculateZenithAngle(lat, lon, date);

    points.push({
      lat,
      lon,
      distanceFromStartKm: route.groundDistanceKm * fraction,
      fractionAlongPath: fraction,
      isDaytime: zenith < 90,
      solarZenithAngle: zenith,
    });
  }
  return points;
}

/**
 * Build the D-region crossing description for one point on the path.
 *
 * Exported so a test can reconstruct the very crossings the engine evaluates,
 * rather than re-deriving them from a copy of this construction that is free
 * to drift away from it.
 */
export function crossingAt(
  point: GeodeticPoint,
  date: Date,
  sfi: number,
): DRegionCrossing {
  const zenithAngleDeg = calculateZenithAngle(
    point.latitudeDeg,
    point.longitudeDeg,
    date,
  );
  return {
    latitudeDeg: point.latitudeDeg,
    monthIndex: date.getUTCMonth(),
    modifiedDipDeg: modifiedDipAngle(point.latitudeDeg, point.longitudeDeg),
    // fL is a property of where this crossing is, not of the mode: the
    // crossings of a trans-equatorial circuit straddle the magnetic dip
    // equator, where |fH sin(dip)| collapses to zero.
    gyrofrequencyMHz: longitudinalGyrofrequencyMHz(
      point.latitudeDeg * D2R,
      point.longitudeDeg * D2R,
    ),
    // A zero foE is the night-time limit, where no E layer shields the D
    // region. The penetration factor handles it; a division by zero does not.
    foEMHz: Math.max(calculateF0E(zenithAngleDeg, sfi), 1e-6),
    zenithAngleDeg,
    zenithNoonAngleDeg: solarNoonZenithAngle(point.latitudeDeg, date),
  };
}

/**
 * Evaluate ionospheric quality at a single reflection point.
 *
 * Absorption here is the one sample this function can take: it is given a
 * reflection point and no route, so it evaluates the crossing there twice.
 * `traceRayPath`, which does know the route, replaces it with the hop's own
 * entry and exit penetration points. A caller holding only a point, such as
 * the path MUF sampler, gets the midpoint reading and that is the honest best
 * available from a point.
 *
 * Nothing here is rounded. The values are the values; a component that wants
 * two decimal places is welcome to ask for them at the point of display.
 */
export function evaluateHopQuality(
  reflectionLat: number,
  reflectionLon: number,
  frequencyMHz: number,
  date: Date,
  sfi: number,
  kp: number,
  hopDistanceKm: number,
  mirrorHeightKm: number = DECLARED_MIRROR_HEIGHT_KM,
): HopQuality {
  const zenith = calculateZenithAngle(reflectionLat, reflectionLon, date);
  const f0F2 = estimateFoF2(zenith, sfi);
  const geometry = hopGeometry({
    groundDistanceKm: hopDistanceKm,
    hopCount: 1,
    mirrorHeightKm,
  });

  if (geometry.kind !== "supported") {
    // The mode does not exist at this hop length. Report that, do not clamp
    // the elevation angle and score it as usable.
    return {
      reflectionPoint: {
        lat: reflectionLat,
        lon: reflectionLon,
        distanceFromStartKm: 0,
        fractionAlongPath: 0,
        isDaytime: zenith < 90,
        solarZenithAngle: zenith,
      },
      f0F2,
      hmF2: mirrorHeightKm,
      muf: 0,
      absorptionDb: 0,
      isFrequencySupported: false,
      qualityScore: 0,
    };
  }

  const elevDeg = (geometry.elevationAngleRad * 180) / Math.PI;
  const muf = calculateMUF(f0F2, elevDeg, mirrorHeightKm);
  const crossing = crossingAt(
    { latitudeDeg: reflectionLat, longitudeDeg: reflectionLon },
    date,
    sfi,
  );
  const absorptionDb = dRegionAbsorption({
    crossings: [crossing, crossing],
    hopCount: 1,
    frequencyMHz,
    incidenceAngle110Rad: geometry.incidenceAngle110Rad,
    ssn: sfiToR12(sfi),
  }).absorptionDb;

  const isFrequencySupported = frequencyMHz <= muf;
  const qualityScore = scoreHop(
    frequencyMHz,
    muf,
    absorptionDb,
    kp,
    reflectionLat,
    reflectionLon,
  );

  return {
    reflectionPoint: {
      lat: reflectionLat,
      lon: reflectionLon,
      distanceFromStartKm: 0,
      fractionAlongPath: 0,
      isDaytime: zenith < 90,
      solarZenithAngle: zenith,
    },
    f0F2,
    hmF2: mirrorHeightKm,
    muf,
    absorptionDb,
    isFrequencySupported,
    qualityScore,
  };
}

/**
 * Perform a complete multi-hop ray-trace along a great-circle path.
 */
export function traceRayPath(params: RayTraceInput): RayTraceResult {
  const {
    startLat,
    startLon,
    endLat,
    endLon,
    frequencyMHz,
    date,
    sfi,
    kp,
    pathMode = "short",
  } = params;

  const mirrorHeight = mirrorHeightOf(params);
  const mirrorHeightKm = mirrorHeight.heightKm;
  const assumptions = [
    mirrorHeightAssumption(mirrorHeight),
    DIP_ASSUMPTION,
    GYROFREQUENCY_ASSUMPTION,
  ];
  const route = routeFor({ startLat, startLon, endLat, endLon, pathMode });
  if (!isResolved(route)) {
    return emptyResult(
      {
        kind: "ambiguous_geometry",
        reason: route.reason,
        detail: route.detail,
      },
      pathMode,
      frequencyMHz,
      assumptions,
      mirrorHeight,
    );
  }

  const totalDistanceKm = route.groundDistanceKm;

  // A modelled height was solved for one mode: P.533-14 section 5.1 makes hr
  // a function of the hop length, so the trace must draw the hop count the
  // height was computed for, or it applies a height solved for one hop of D
  // to n hops of D/n. If that mode does not close at this height (a grazing
  // hop), `hopGeometry` says so below and the trace reports it as
  // geometrically unsupported rather than quietly choosing another count.
  // A provenance solved for a different circuit is used for its height only,
  // and the trace says so.
  let modelledHopCount: number | null = null;
  if (mirrorHeight.kind === "modelled") {
    const mismatch = modelledProvenanceMismatch(mirrorHeight, {
      groundDistanceKm: totalDistanceKm,
      frequencyMHz,
      pathMode,
      date,
    });
    if (mismatch === null) {
      modelledHopCount = mirrorHeight.hopCount;
    } else {
      assumptions.push(
        "The modelled mirror height provenance describes a different circuit " +
          `(${mismatch}); its ${mirrorHeight.heightKm.toFixed(1)} km is used ` +
          "as a height only and the hop count is chosen here.",
      );
    }
  }

  // Never fewer hops than the mirror height can physically reach: choosing a
  // hop count that needs a below-horizon ray is how the old engine ended up
  // clamping the elevation angle.
  const numHops =
    modelledHopCount ??
    Math.max(
      minimumHopCount(totalDistanceKm, mirrorHeightKm),
      Math.max(
        1,
        Math.min(MAX_HOPS, Math.ceil(totalDistanceKm / TYPICAL_F2_HOP_KM)),
      ),
    );
  const hopDistanceKm = totalDistanceKm / numHops;

  const geometry = hopGeometry({
    groundDistanceKm: totalDistanceKm,
    hopCount: numHops,
    mirrorHeightKm,
  });
  if (geometry.kind !== "supported") {
    return emptyResult(
      {
        kind: "geometrically_unsupported",
        reason: geometry.reason,
        detail: geometry.detail,
      },
      pathMode,
      frequencyMHz,
      assumptions,
      mirrorHeight,
      totalDistanceKm,
    );
  }

  const reflectionPoints = calculateReflectionPoints(
    startLat,
    startLon,
    endLat,
    endLon,
    numHops,
    date,
    pathMode,
  );

  // Absorption is evaluated at the 2n penetration points of the mode, not once
  // at the path midpoint, and the n factor of equation (20) is the pass count.
  // Hop k enters the layer at fraction 2k and leaves it at 2k + 1.
  const crossings = geometry.penetrationFractions.map((fraction) =>
    crossingAt(routeSampleAtFraction(route, fraction), date, sfi),
  );
  const ssn = sfiToR12(sfi);

  const hopAbsorptions = Array.from({ length: numHops }, (_unused, index) =>
    dRegionAbsorption({
      crossings: [crossings[2 * index], crossings[2 * index + 1]],
      hopCount: 1,
      frequencyMHz,
      incidenceAngle110Rad: geometry.incidenceAngle110Rad,
      ssn,
    }),
  );

  const hops: HopQuality[] = reflectionPoints.map((rp, index) => {
    const hop = evaluateHopQuality(
      rp.lat,
      rp.lon,
      frequencyMHz,
      date,
      sfi,
      kp,
      hopDistanceKm,
      mirrorHeightKm,
    );
    // `evaluateHopQuality` has only a reflection point to work from, so it
    // samples absorption there. This hop has its own two penetration points,
    // and a hop that straddles the terminator absorbs like neither end alone.
    // Taking the same two crossings the mode total is built from is what makes
    // the displayed per-hop figure, the limiting-hop choice and the total agree
    // by construction instead of by coincidence.
    const absorptionDb = hopAbsorptions[index].absorptionDb;
    return {
      ...hop,
      reflectionPoint: rp,
      absorptionDb,
      qualityScore: scoreHop(
        frequencyMHz,
        hop.muf,
        absorptionDb,
        kp,
        rp.lat,
        rp.lon,
      ),
    };
  });

  const isPathViable = hops.every((h) => h.isFrequencySupported);

  let limitingHop = 0;
  let lowestScore = Infinity;
  for (let i = 0; i < hops.length; i++) {
    if (hops[i].qualityScore < lowestScore) {
      lowestScore = hops[i].qualityScore;
      limitingHop = i;
    }
  }

  // The mode total is the sum of the hops, not a second evaluation of the same
  // crossings. Equation (20) is linear in the crossing terms, so summing the
  // n single-hop losses is the n-hop loss exactly, and the two can no longer
  // disagree about the circuit they describe.
  const totalAbsorptionDb = hops.reduce(
    (total, h) => total + h.absorptionDb,
    0,
  );
  const absorptionPassCount = hopAbsorptions.reduce(
    (total, a) => total + a.passCount,
    0,
  );

  const terrainTypes = bouncePointTerrain(route, numHops);
  const terrainLoss =
    terrainTypes.length > 0
      ? getPathTerrainLoss(terrainTypes, frequencyMHz)
      : 0;

  const losses: RayPathLosses = {
    freeSpaceDb: freeSpacePathLoss(frequencyMHz, geometry.virtualSlantRangeKm),
    absorptionDb: totalAbsorptionDb,
    terrainDb: terrainLoss,
    polarisationDb: POLARISATION_LOSS_DB,
  };
  const totalPathLossDb = sumLosses(losses);

  let overallScore: number;
  if (!isPathViable) {
    overallScore = Math.min(lowestScore, 10);
  } else if (hops.length === 1) {
    overallScore = hops[0].qualityScore;
  } else {
    const sumScores = hops.reduce((s, h) => s + h.qualityScore, 0);
    const weightedSum = sumScores + hops[limitingHop].qualityScore;
    overallScore = Math.round(weightedSum / (hops.length + 1));
  }

  if (kp >= 5) {
    overallScore = Math.round(overallScore * (1 - (kp - 4) * 0.08));
  }
  overallScore = Math.max(0, Math.min(100, overallScore));

  const viability = getPathViability({
    overallScore,
    isPathViable,
  } as RayTraceResult);
  const freqStr = frequencyMHz.toFixed(1);
  const absStr = totalAbsorptionDb.toFixed(1);
  const hopWord = numHops === 1 ? "hop" : "hops";
  const viableStr = isPathViable
    ? `all ${hopWord} viable`
    : `hop ${limitingHop + 1} exceeds MUF`;

  const pathLabel = pathMode === "long" ? "long-path" : "short-path";
  const summary =
    `${numHops}-hop ${pathLabel}, ${freqStr} MHz, score ${overallScore}/100 (${viability}) -- ` +
    `${viableStr}, ${absStr} dB total absorption`;

  return {
    hops,
    totalAbsorptionDb,
    totalPathLossDb,
    isPathViable,
    limitingHop,
    overallScore,
    summary,
    terrainTypes,
    terrainLoss,
    pathMode,
    totalDistanceKm,
    virtualSlantRangeKm: geometry.virtualSlantRangeKm,
    losses,
    support: { kind: "supported" },
    elevationAngleDeg: (geometry.elevationAngleRad * 180) / Math.PI,
    absorptionPassCount,
    assumptions: [...assumptions, ...hopAbsorptions[0].assumptions],
    mirrorHeight,
  };
}

const POLARISATION_LOSS_DB = 1.5;

/**
 * Total of the itemised budget.
 *
 * Written once and used once so the total can never be assembled from a
 * different set of terms than the one reported, and never rounded on the way.
 */
function sumLosses(losses: RayPathLosses): number {
  return (
    losses.freeSpaceDb +
    losses.absorptionDb +
    losses.terrainDb +
    losses.polarisationDb
  );
}

/** Terrain at the intermediate ground bounces of an n-hop mode. */
function bouncePointTerrain(
  route: ResolvedRoute,
  numHops: number,
): TerrainType[] {
  const types: TerrainType[] = [];
  for (let i = 1; i < numHops; i++) {
    const point = routeSampleAtFraction(route, i / numHops);
    types.push(classifyTerrain(point.latitudeDeg, point.longitudeDeg));
  }
  return types;
}

/** A circuit with no ray path. Reported, not papered over with zeroes. */
function emptyResult(
  support: RayPathSupport,
  pathMode: "short" | "long",
  frequencyMHz: number,
  assumptions: readonly string[],
  mirrorHeight: MirrorHeightProvenance,
  totalDistanceKm = 0,
): RayTraceResult {
  const losses: RayPathLosses = {
    freeSpaceDb: 0,
    absorptionDb: 0,
    terrainDb: 0,
    polarisationDb: 0,
  };
  const reason = support.kind === "supported" ? "supported" : support.detail;
  return {
    hops: [],
    totalAbsorptionDb: 0,
    totalPathLossDb: sumLosses(losses),
    isPathViable: false,
    limitingHop: 0,
    overallScore: 0,
    summary: `no ray path at ${frequencyMHz.toFixed(1)} MHz: ${reason}`,
    terrainTypes: [],
    terrainLoss: 0,
    pathMode,
    totalDistanceKm,
    virtualSlantRangeKm: 0,
    losses,
    support,
    elevationAngleDeg: 0,
    absorptionPassCount: 0,
    assumptions,
    mirrorHeight,
  };
}

/**
 * Classify the overall path viability from a ray-trace result.
 */
export function getPathViability(result: RayTraceResult): PathViability {
  if (!result.isPathViable || result.overallScore < 10) return "impossible";
  if (result.overallScore >= 80) return "excellent";
  if (result.overallScore >= 60) return "good";
  if (result.overallScore >= 35) return "marginal";
  return "unlikely";
}

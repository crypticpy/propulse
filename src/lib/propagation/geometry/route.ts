/**
 * Spherical route resolution for HF circuits (PROP-03, #949), implementing the
 * mathematical contract's M06.
 *
 * Conventions and units, stated once so no caller has to guess:
 *
 *  - The declared figure of the Earth is a sphere of radius
 *    `EARTH_RADIUS_KM = 6371`. This is the contract's declared adapter, not a
 *    geodetic model: no flattening, no geoid, no ellipsoidal azimuth.
 *  - Coordinates cross the boundary in **degrees** and are converted to
 *    radians immediately. Distances are **kilometres**. Angles held in a
 *    result are **radians** and named `...Rad`.
 *  - A route is resolved once and then sampled. For transmitter and receiver
 *    unit vectors `u` and `v`, `theta = atan2(|u x v|, u . v)`, the short arc
 *    is `R theta` and the long arc is `R (2 pi - theta)`. The short tangent is
 *    `q = (v - (u.v) u) / sin theta` and the long tangent is `-q`. A sample at
 *    arc length `s` along the route is `r(s) = u cos(s/R) + q sin(s/R)`.
 *  - One formula serves the short and the long path. There is no polyline, no
 *    index rounding and no separate long-path code path, so a control point on
 *    the long route is exactly as accurate as one on the short route.
 *  - The date line and the poles need no special case: latitude comes from
 *    `asin(z)` and longitude from `atan2(y, x)`, both of which are continuous
 *    across 180 degrees and defined at `z = +/-1`.
 *
 * Degenerate endpoints are reported, never repaired. Coincident and antipodal
 * endpoints leave the great circle undetermined: through two coincident points
 * (or two antipodal points) run infinitely many great circles, so there is no
 * unique short or long path to return. M06 requires an explicit route azimuth
 * or an `ambiguous_geometry` result, and forbids inventing one. A zero-distance
 * request is additionally not a valid HF circuit request at all.
 */

export const EARTH_RADIUS_KM = 6371;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/**
 * Angular tolerance for calling two endpoints coincident or antipodal.
 *
 * 1e-9 rad is about 6.4 metres on this sphere, four orders of magnitude below
 * the coordinate precision any station record carries, and far enough from
 * the double-precision noise floor of `atan2(|u x v|, u . v)` that the
 * classification is stable.
 */
export const DEGENERATE_ANGLE_RAD = 1e-9;

export type RouteDirection = "short" | "long";

export interface GeodeticPoint {
  readonly latitudeDeg: number;
  readonly longitudeDeg: number;
}

/** A unit vector on the declared sphere. Earth-centred, x through (0, 0). */
export interface UnitVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Why a pair of endpoints has no unique great circle.
 *
 * `coincident_endpoints` also covers the zero-distance case that M06 rejects
 * outright: a circuit whose two ends are the same place is not an HF circuit.
 */
export type AmbiguousRouteReason =
  "coincident_endpoints" | "antipodal_endpoints";

export interface ResolvedRoute {
  readonly kind: "resolved";
  readonly direction: RouteDirection;
  /** Angle subtended at the Earth's centre by the resolved arc, radians. */
  readonly arcAngleRad: number;
  /** Ground distance along the resolved arc, km. */
  readonly groundDistanceKm: number;
  /** Initial azimuth of the resolved arc at the transmitter, degrees 0..360. */
  readonly initialAzimuthDeg: number;
  /** Start of the arc. */
  readonly origin: UnitVector;
  /** Unit tangent at the origin, in the direction of travel. */
  readonly tangent: UnitVector;
  /**
   * True when the tangent was supplied by the caller as an azimuth because the
   * endpoints alone did not determine one. The route is then a choice, not a
   * derivation, and every number downstream inherits that.
   */
  readonly tangentFromAzimuth: boolean;
}

export interface AmbiguousRoute {
  readonly kind: "ambiguous_geometry";
  readonly reason: AmbiguousRouteReason;
  /** Human-readable detail, safe to surface. */
  readonly detail: string;
  /** Angle subtended by the endpoints, radians. 0 or pi, up to tolerance. */
  readonly arcAngleRad: number;
}

export type RouteResolution = ResolvedRoute | AmbiguousRoute;

export interface RouteOptions {
  readonly direction?: RouteDirection;
  /**
   * Initial azimuth at the transmitter, degrees clockwise from true north.
   *
   * Only consulted when the endpoints are degenerate. Supplying it converts an
   * `ambiguous_geometry` result into a resolved route whose `tangentFromAzimuth`
   * flag records that the direction was chosen rather than derived.
   */
  readonly azimuthDeg?: number;
}

function toUnitVector(point: GeodeticPoint): UnitVector {
  const phi = point.latitudeDeg * D2R;
  const lambda = point.longitudeDeg * D2R;
  const cosPhi = Math.cos(phi);
  return {
    x: cosPhi * Math.cos(lambda),
    y: cosPhi * Math.sin(lambda),
    z: Math.sin(phi),
  };
}

function dot(a: UnitVector, b: UnitVector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: UnitVector, b: UnitVector): UnitVector {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function norm(a: UnitVector): number {
  return Math.hypot(a.x, a.y, a.z);
}

function scale(a: UnitVector, k: number): UnitVector {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

function subtract(a: UnitVector, b: UnitVector): UnitVector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: UnitVector, b: UnitVector): UnitVector {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * Local east and north unit vectors at a point.
 *
 * At a geographic pole east and north are not defined by longitude, so the
 * longitude actually stored on the point is used as the reference meridian.
 * That is the same convention `atan2(y, x)` produces for a pole sample, which
 * keeps an azimuth-resolved route at a pole self-consistent.
 */
function localFrame(point: GeodeticPoint): {
  east: UnitVector;
  north: UnitVector;
} {
  const phi = point.latitudeDeg * D2R;
  const lambda = point.longitudeDeg * D2R;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);
  return {
    east: { x: -sinLambda, y: cosLambda, z: 0 },
    north: {
      x: -sinPhi * cosLambda,
      y: -sinPhi * sinLambda,
      z: cosPhi,
    },
  };
}

/**
 * Normalise a vector that is known to be non-zero.
 *
 * Used for the tangent, where dividing by `sin theta` directly loses precision
 * long before `theta` reaches the degeneracy tolerance. Gram-Schmidt against
 * `u` followed by a plain normalisation is the numerically stable construction
 * M06 asks for and agrees with `(v - (u.v) u)/sin theta` exactly in exact
 * arithmetic.
 */
function normalise(a: UnitVector): UnitVector {
  const length = norm(a);
  return scale(a, 1 / length);
}

function azimuthDegOf(origin: GeodeticPoint, tangent: UnitVector): number {
  const { east, north } = localFrame(origin);
  const azimuth = Math.atan2(dot(tangent, east), dot(tangent, north)) * R2D;
  return (azimuth + 360) % 360;
}

/**
 * Resolve one great-circle route between two stations.
 *
 * Returns a discriminated union. A caller that reads `groundDistanceKm` or
 * samples the route must narrow on `kind === "resolved"` first; there is no
 * numeric fallback to read off an ambiguous result, deliberately.
 */
export function resolveRoute(
  tx: GeodeticPoint,
  rx: GeodeticPoint,
  options: RouteOptions = {},
): RouteResolution {
  const direction = options.direction ?? "short";
  const u = toUnitVector(tx);
  const v = toUnitVector(rx);

  const theta = Math.atan2(norm(cross(u, v)), dot(u, v));

  const coincident = theta < DEGENERATE_ANGLE_RAD;
  const antipodal = Math.PI - theta < DEGENERATE_ANGLE_RAD;

  if ((coincident || antipodal) && options.azimuthDeg === undefined) {
    return {
      kind: "ambiguous_geometry",
      reason: coincident ? "coincident_endpoints" : "antipodal_endpoints",
      detail: coincident
        ? "The two endpoints are the same place to within 1e-9 rad. Infinitely " +
          "many great circles pass through a single point and a zero-distance " +
          "circuit is not a valid HF request. Supply an explicit route azimuth " +
          "to choose one."
        : "The two endpoints are antipodal to within 1e-9 rad. Infinitely many " +
          "great circles join a pair of antipodes, so neither the short nor the " +
          "long route is determined. Supply an explicit route azimuth to choose " +
          "one.",
      arcAngleRad: theta,
    };
  }

  let tangent: UnitVector;
  let tangentFromAzimuth = false;

  if (options.azimuthDeg !== undefined && (coincident || antipodal)) {
    const { east, north } = localFrame(tx);
    const azimuthRad = options.azimuthDeg * D2R;
    tangent = normalise(
      add(
        scale(north, Math.cos(azimuthRad)),
        scale(east, Math.sin(azimuthRad)),
      ),
    );
    tangentFromAzimuth = true;
  } else {
    // Gram-Schmidt, not a division by sin(theta): identical in exact
    // arithmetic and stable where sin(theta) is small.
    tangent = normalise(subtract(v, scale(u, dot(u, v))));
  }

  // Only a tangent derived from the endpoints has a reciprocal to take. When
  // the caller supplied the azimuth, the azimuth *is* the route's starting
  // direction, chosen precisely because a degenerate pair determines none;
  // negating it would send the circuit out on the reciprocal of the bearing
  // that was asked for. What separates the long route from the short one for
  // such a pair is the arc it covers, which `arcAngleRad` below expresses.
  const routeTangent =
    direction === "long" && !tangentFromAzimuth ? scale(tangent, -1) : tangent;

  // A coincident pair has theta = 0, so its "short" arc is zero length and its
  // "long" arc is the full circumference. An antipodal pair splits pi / pi.
  const arcAngleRad = direction === "long" ? 2 * Math.PI - theta : theta;

  return {
    kind: "resolved",
    direction,
    arcAngleRad,
    groundDistanceKm: EARTH_RADIUS_KM * arcAngleRad,
    initialAzimuthDeg: azimuthDegOf(tx, routeTangent),
    origin: u,
    tangent: routeTangent,
    tangentFromAzimuth,
  };
}

/**
 * Sample a resolved route at arc length `sKm` from the transmitter.
 *
 * `r(s) = u cos(s/R) + q sin(s/R)`, exactly M06's path sample. `sKm` is not
 * clamped to the route: a caller that asks for a point beyond the receiver gets
 * the continuation of the same great circle, which is what a penetration point
 * near a hop end legitimately needs.
 */
export function routeSample(route: ResolvedRoute, sKm: number): GeodeticPoint {
  const s = sKm / EARTH_RADIUS_KM;
  const cosS = Math.cos(s);
  const sinS = Math.sin(s);
  const x = route.origin.x * cosS + route.tangent.x * sinS;
  const y = route.origin.y * cosS + route.tangent.y * sinS;
  const z = route.origin.z * cosS + route.tangent.z * sinS;
  return {
    latitudeDeg: Math.asin(Math.max(-1, Math.min(1, z))) * R2D,
    longitudeDeg: Math.atan2(y, x) * R2D,
  };
}

/** Sample a resolved route at a fraction of its own length, 0 at tx, 1 at rx. */
export function routeSampleAtFraction(
  route: ResolvedRoute,
  fraction: number,
): GeodeticPoint {
  return routeSample(route, route.groundDistanceKm * fraction);
}

/**
 * The spherical midpoint of a resolved route.
 *
 * Named separately because it is the single most-misused quantity in this
 * codebase: the arithmetic mean of two coordinate pairs is not a midpoint and
 * is wrong by thousands of kilometres across the date line.
 */
export function routeMidpoint(route: ResolvedRoute): GeodeticPoint {
  return routeSample(route, route.groundDistanceKm / 2);
}

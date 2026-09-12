/**
 * spotArcsLayer -- shared Canvas 2D draw code for live spot arcs (the short
 * great-circle path between a reporting station and the DX station it
 * heard), against a shared `Projection` so both the flat map and the
 * azimuthal disc call the same draw code instead of duplicating geometry,
 * watch dimming, grouped-endpoint suppression and the selected-arc glow
 * (#1247, following `bordersLayer.ts`/`terminatorLayer.ts`'s #1091 pattern).
 *
 * Geometry absorbs the flat map's former `flatSpotPath.ts`: a slerp-sampled
 * short great circle (length-scaled step count, min 8 samples), which the
 * equirectangular branch caches up to 512 entries the same way `flatSpotPath`
 * did. The path-break rule is chosen by `projection.kind`:
 *
 * - `equirectangular`: the flat map's exact antimeridian/pole split,
 *   verbatim, now driven by `projection.wrapWidth`/`wrapHeight` instead of
 *   its own `width`/`height` parameters.
 * - `azimuthal`: a rim-visibility break -- a sample whose
 *   `projection.project(...)` comes back `visible: false` ends the current
 *   sub-path, verbatim from the disc's old `buildGreatCirclePath`. The
 *   azimuthal branch is not cached: `AzimuthalProjection` does not expose
 *   the disc's rotation (`centerLat`/`centerLon`), so a lat/lon-only cache
 *   key could replay stale geometry across a pan. The disc's pre-layer code
 *   never cached this path either, so this is not a regression.
 *
 * Watch dimming (0.3 for an arc not in the matched set, only while a watch
 * is active) and age fade (`style.ageFade`, the caller-supplied
 * `getSpotAgeOpacity` value) are both the flat map's pre-existing rules,
 * now available on the disc too -- the disc did neither before this layer.
 * The selected-arc highlight (`#ff6b35`, glow width 6 + main width 3) is the
 * flat map's `drawSelectedSpotArc` verbatim, minus the callsign label pill
 * (still drawn by each caller directly -- out of scope for #1247).
 */
import type { Projection } from "@/lib/map/projection";

const RAD = Math.PI / 180;

interface Point2D {
  readonly x: number;
  readonly y: number;
}

type Segment = readonly Point2D[];

const MAX_CACHED_PATHS = 512;
const equirectPathCache = new Map<string, readonly Segment[]>();

function vector3(lat: number, lon: number): [number, number, number] {
  return [
    Math.cos(lat * RAD) * Math.cos(lon * RAD),
    Math.cos(lat * RAD) * Math.sin(lon * RAD),
    Math.sin(lat * RAD),
  ];
}

/**
 * Sample the short great circle between two points, in lat/lon degrees,
 * including both endpoints. Step count is length-scaled with an 8-sample
 * floor (`flatSpotPath.ts`, verbatim). Exact antipodes have no unique short
 * path -- pick a deterministic perpendicular direction, same as before.
 */
function sampleGreatCircle(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): { lat: number; lon: number }[] {
  const a = vector3(lat1, lon1);
  const b = vector3(lat2, lon2);
  const dot = Math.max(
    -1,
    Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]),
  );
  const tangent: [number, number, number] = [
    b[0] - dot * a[0],
    b[1] - dot * a[1],
    b[2] - dot * a[2],
  ];
  let length = Math.hypot(...tangent);
  const angle = Math.atan2(length, dot);
  if (length < 1e-12) {
    const absA = a.map(Math.abs);
    const axis = absA.indexOf(Math.min(...absA));
    for (let i = 0; i < 3; i++)
      tangent[i] = (i === axis ? 1 : 0) - a[axis] * a[i];
    length = Math.hypot(...tangent);
  }
  for (let i = 0; i < 3; i++) tangent[i] /= length;

  const steps =
    angle < 1e-12 ? 1 : Math.max(8, Math.ceil(angle / (Math.PI / 96)));
  const points: { lat: number; lon: number }[] = [{ lat: lat1, lon: lon1 }];
  for (let i = 1; i < steps; i++) {
    const t = (angle * i) / steps;
    const v: [number, number, number] = [
      Math.cos(t) * a[0] + Math.sin(t) * tangent[0],
      Math.cos(t) * a[1] + Math.sin(t) * tangent[1],
      Math.cos(t) * a[2] + Math.sin(t) * tangent[2],
    ];
    points.push({
      lat: Math.atan2(v[2], Math.hypot(v[0], v[1])) / RAD,
      lon: Math.atan2(v[1], v[0]) / RAD,
    });
  }
  points.push(angle < 1e-12 ? points[0] : { lat: lat2, lon: lon2 });
  return points;
}

/**
 * Equirectangular branch -- verbatim from `flatSpotPath.ts`: the pole and
 * opposite-meridian special cases operate on projected x/y because they are
 * artifacts of the equirectangular projection itself (a pole collapses to a
 * single canvas row spanning the full width), not a general sphere-geometry
 * concern, so they stay here rather than in the shared sampler.
 */
function equirectangularSpotSegments(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  projection: Extract<Projection, { kind: "equirectangular" }>,
): readonly Segment[] {
  const width = projection.wrapWidth;
  const project = (lat: number, lon: number): Point2D =>
    projection.project(lat, lon);

  // Opposite meridians meet at a pole. Their projected longitude jumps by
  // exactly half the canvas, so ordinary date-line detection cannot split
  // it. End each meridian at the pole boundary without drawing a horizontal
  // chord.
  const oppositeMeridians = Math.abs(Math.abs(lon2 - lon1) - 180) < 1e-10;
  const poleLatitude = Math.sign(lat1 + lat2) * 90;
  const startsAtPole = Math.abs(lat1) === 90;
  const endsAtPole = Math.abs(lat2) === 90;
  const meridian = startsAtPole ? lon2 : lon1;
  const polarSegments =
    startsAtPole || endsAtPole
      ? [
          [project(lat1, lon1)],
          [project(lat1, meridian), project(lat2, meridian)],
          [project(lat2, lon2)],
        ]
      : oppositeMeridians && Math.abs(lat1 + lat2) > 1e-10
        ? [
            [project(lat1, lon1), project(poleLatitude, lon1)],
            [project(poleLatitude, lon2), project(lat2, lon2)],
          ]
        : null;
  if (polarSegments) {
    return polarSegments.map((segment) => Object.freeze(segment.slice()));
  }

  const samples = sampleGreatCircle(lat1, lon1, lat2, lon2);
  const points = samples.map((p) => project(p.lat, p.lon));
  const segments: Point2D[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const point = points[i];
    const dx = point.x - previous.x;
    if (Math.abs(dx) > width / 2) {
      // Finish on one date-line edge and resume on the other, without a
      // canvas-wide chord or an unpainted gap between samples and the edge.
      const unwrappedX = point.x + (dx > 0 ? -width : width);
      const edge = dx > 0 ? 0 : width;
      const denominator = unwrappedX - previous.x;
      const fraction =
        Math.abs(denominator) < 1e-12 ? 0 : (edge - previous.x) / denominator;
      const y = previous.y + fraction * (point.y - previous.y);
      segments[segments.length - 1].push({ x: edge, y });
      segments.push([{ x: width - edge, y }, point]);
    } else {
      segments[segments.length - 1].push(point);
    }
  }
  return segments.map((segment) => Object.freeze(segment.slice()));
}

/**
 * Azimuthal branch -- rim-visibility break, verbatim from the disc's old
 * `buildGreatCirclePath`: a sample outside the visible disc ends the
 * current sub-path; re-entry starts a new one.
 */
function azimuthalSpotSegments(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  projection: Extract<Projection, { kind: "azimuthal" }>,
): readonly Segment[] {
  const samples = sampleGreatCircle(lat1, lon1, lat2, lon2);
  const segments: Point2D[][] = [];
  let current: Point2D[] | null = null;
  for (const sample of samples) {
    const projected = projection.project(sample.lat, sample.lon);
    if (!projected.visible) {
      current = null;
      continue;
    }
    if (!current) {
      current = [{ x: projected.x, y: projected.y }];
      segments.push(current);
    } else {
      current.push({ x: projected.x, y: projected.y });
    }
  }
  return segments;
}

/**
 * Compute (and, on the equirectangular projection, cache) the short
 * great-circle path between two points as canvas-space sub-paths. Exported
 * for direct geometry testing; `drawSpotArcsLayer` is the normal caller.
 */
export function spotArcSegments(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  projection: Projection,
): readonly Segment[] {
  if (
    ![lat1, lon1, lat2, lon2].every(Number.isFinite) ||
    Math.abs(lat1) > 90 ||
    Math.abs(lat2) > 90 ||
    Math.abs(lon1) > 180 ||
    Math.abs(lon2) > 180
  ) {
    return [];
  }

  if (projection.kind === "azimuthal") {
    return azimuthalSpotSegments(lat1, lon1, lat2, lon2, projection);
  }

  const { wrapWidth: width, wrapHeight: height } = projection;
  if (width <= 0 || height <= 0) return [];
  const key = `${lat1}:${lon1}:${lat2}:${lon2}:${width}:${height}`;
  const hit = equirectPathCache.get(key);
  if (hit) {
    equirectPathCache.delete(key);
    equirectPathCache.set(key, hit);
    return hit;
  }
  const result = equirectangularSpotSegments(
    lat1,
    lon1,
    lat2,
    lon2,
    projection,
  );
  if (equirectPathCache.size >= MAX_CACHED_PATHS) {
    equirectPathCache.delete(equirectPathCache.keys().next().value!);
  }
  equirectPathCache.set(key, result);
  return result;
}

export function traceSpotArcPath(
  ctx: Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "lineTo">,
  segments: readonly Segment[],
): void {
  ctx.beginPath();
  for (const segment of segments) {
    if (segment.length === 0) continue;
    ctx.moveTo(segment[0].x, segment[0].y);
    for (let i = 1; i < segment.length; i++)
      ctx.lineTo(segment[i].x, segment[i].y);
  }
}

/** DX station = transmitter (filled circle); reporting/spotter station = receiver (hollow square). */
export function traceSpotArcEndpoint(
  ctx: Pick<CanvasRenderingContext2D, "beginPath" | "arc" | "rect">,
  x: number,
  y: number,
  radius: number,
  endpoint: "tx" | "rx",
): void {
  ctx.beginPath();
  if (endpoint === "tx") {
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  } else {
    ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
  }
}

export const SPOT_ARC_SELECTED_COLOR = "rgba(255, 107, 53, 1)";
export const SPOT_ARC_SELECTED_GLOW_COLOR = "rgba(255, 107, 53, 0.3)";

export interface SpotArcEndpointCoords {
  readonly lat: number;
  readonly lon: number;
}

export interface SpotArcInput {
  readonly id: string;
  /** Reporting/spotter station -- drawn as the hollow-square RX glyph. */
  readonly from: SpotArcEndpointCoords;
  /** DX station -- drawn as the filled-circle TX glyph. */
  readonly to: SpotArcEndpointCoords;
  readonly colour: string;
  /** In the currently-matched watch set; ignored unless `style.watchDimming`. */
  readonly isWatched: boolean;
  /** `getSpotAgeOpacity(spot.time)`; ignored unless `style.ageFade`. */
  readonly ageOpacity: number;
  /** A grouped member's DX endpoint is drawn by the cluster glyph instead (#746). */
  readonly skipDxEndpoint?: boolean;
  /** Mirrors `skipDxEndpoint` for the spotter/RX side, for symmetry with a
   * future grouped-spotter case; neither map groups by spotter today. */
  readonly skipSpotterEndpoint?: boolean;
  /** Draws the persistent `#ff6b35` highlight instead of `colour`, ignoring
   * watch dimming and age fade (matches the flat map's `drawSelectedSpotArc`,
   * which never dims or fades). */
  readonly selected?: boolean;
}

export interface SpotArcsLayerStyle {
  readonly highViz: boolean;
  readonly spotDotScale: number;
  /** Dim an unmatched arc to 0.3 alpha; only meaningful while a watch is active. */
  readonly watchDimming: boolean;
  /** Apply `arc.ageOpacity`; off by default (#1247 -- unfaded paths are the
   * most visible default when the two maps disagreed on this). */
  readonly ageFade: boolean;
}

function drawNormalSpotArc(
  ctx: CanvasRenderingContext2D,
  projection: Projection,
  arc: SpotArcInput,
  style: SpotArcsLayerStyle,
): void {
  const segments = spotArcSegments(
    arc.from.lat,
    arc.from.lon,
    arc.to.lat,
    arc.to.lon,
    projection,
  );
  if (segments.length === 0) return;

  const dimOpacity = style.watchDimming ? (arc.isWatched ? 1 : 0.3) : 1;
  const opacity = dimOpacity * (style.ageFade ? arc.ageOpacity : 1);
  const scale = style.spotDotScale;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = arc.colour;
  ctx.lineWidth = projection.screenPx((style.highViz ? 3 : 1.5) * scale);
  ctx.lineCap = "round";
  traceSpotArcPath(ctx, segments);
  ctx.stroke();

  const from = projection.project(arc.from.lat, arc.from.lon);
  const to = projection.project(arc.to.lat, arc.to.lon);

  if (!arc.skipSpotterEndpoint) {
    traceSpotArcEndpoint(
      ctx,
      from.x,
      from.y,
      projection.screenPx((style.highViz ? 5 : 3.5) * scale),
      "rx",
    );
    ctx.strokeStyle = arc.colour;
    ctx.lineWidth = projection.screenPx((style.highViz ? 2 : 1.5) * scale);
    ctx.stroke();
  }

  if (!arc.skipDxEndpoint) {
    traceSpotArcEndpoint(
      ctx,
      to.x,
      to.y,
      projection.screenPx((style.highViz ? 5 : 4) * scale),
      "tx",
    );
    ctx.fillStyle = arc.colour;
    ctx.fill();
    traceSpotArcEndpoint(
      ctx,
      to.x,
      to.y,
      projection.screenPx((style.highViz ? 7 : 5.5) * scale),
      "tx",
    );
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = projection.screenPx((style.highViz ? 1.5 : 1) * scale);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * The persistent selected-spot highlight -- `#ff6b35` glow (width 6) then
 * main stroke (width 3), verbatim from the flat map's `drawSelectedSpotArc`
 * minus the callsign label pill (still drawn by the caller). Never dims or
 * fades, and always draws both endpoints.
 */
function drawSelectedSpotArc(
  ctx: CanvasRenderingContext2D,
  projection: Projection,
  arc: SpotArcInput,
  style: SpotArcsLayerStyle,
): void {
  const segments = spotArcSegments(
    arc.from.lat,
    arc.from.lon,
    arc.to.lat,
    arc.to.lon,
    projection,
  );
  if (segments.length === 0) return;
  const scale = style.spotDotScale;

  ctx.save();
  const strokeArcPath = () => {
    traceSpotArcPath(ctx, segments);
    ctx.stroke();
  };

  ctx.strokeStyle = SPOT_ARC_SELECTED_GLOW_COLOR;
  ctx.lineWidth = projection.screenPx(6 * scale);
  ctx.shadowColor = "rgba(255, 107, 53, 0.5)";
  ctx.shadowBlur = projection.screenPx(12);
  ctx.lineCap = "round";
  strokeArcPath();

  ctx.strokeStyle = SPOT_ARC_SELECTED_COLOR;
  ctx.lineWidth = projection.screenPx(3 * scale);
  ctx.shadowColor = "rgba(255, 107, 53, 0.4)";
  ctx.shadowBlur = projection.screenPx(8);
  strokeArcPath();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  const from = projection.project(arc.from.lat, arc.from.lon);
  const to = projection.project(arc.to.lat, arc.to.lon);

  traceSpotArcEndpoint(
    ctx,
    from.x,
    from.y,
    projection.screenPx(5 * scale),
    "rx",
  );
  ctx.strokeStyle = SPOT_ARC_SELECTED_COLOR;
  ctx.lineWidth = projection.screenPx(2 * scale);
  ctx.shadowColor = "rgba(255, 107, 53, 0.4)";
  ctx.shadowBlur = projection.screenPx(6);
  ctx.stroke();

  traceSpotArcEndpoint(ctx, to.x, to.y, projection.screenPx(6 * scale), "tx");
  ctx.fillStyle = SPOT_ARC_SELECTED_COLOR;
  ctx.shadowColor = "rgba(255, 107, 53, 0.5)";
  ctx.shadowBlur = projection.screenPx(8);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  traceSpotArcEndpoint(
    ctx,
    to.x,
    to.y,
    projection.screenPx(6 * scale + 2),
    "tx",
  );
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.lineWidth = projection.screenPx(1.5 * scale);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw one or more live spot arcs against a shared `Projection`. Each arc is
 * either a normal path (dimmed/faded per `style`) or, when `arc.selected` is
 * true, the persistent orange highlight. Callers pass a single-element array
 * for the hover highlight and the selected arc, matching the flat map's
 * pre-#1247 `drawSpotArc`/`drawSelectedSpotArc` call shape.
 */
export function drawSpotArcsLayer(
  ctx: CanvasRenderingContext2D,
  projection: Projection,
  arcs: readonly SpotArcInput[],
  style: SpotArcsLayerStyle,
): void {
  for (const arc of arcs) {
    if (arc.selected) {
      drawSelectedSpotArc(ctx, projection, arc, style);
    } else {
      drawNormalSpotArc(ctx, projection, arc, style);
    }
  }
}

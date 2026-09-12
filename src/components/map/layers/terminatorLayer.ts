/**
 * terminatorLayer -- shared Canvas 2D draw code for the day/night terminator
 * line, against a shared `Projection` so both the flat map and the
 * azimuthal disc call the same draw code instead of duplicating the
 * geometry sampling and the outline/colour two-pass style (#1091 PR 8,
 * following `bordersLayer.ts`'s PR 7 pattern).
 *
 * Geometry comes from `terminatorCoordinates` (flatMapIllumination.ts) --
 * the flat map's great-circle parametrisation. The disc's old bearing-sweep
 * `drawTerminator` traced the same curve (a great circle 90 degrees from
 * the subsolar point), so switching it onto this sampler is not a math
 * change, only a resolution increase (180 fixed bearing steps -> the same
 * density-scaled sample count the flat map already used). The path-break
 * rule (when to `moveTo` instead of `lineTo`) still differs per projection
 * kind: an antimeridian lon-jump on the flat map, a squared-canvas-distance
 * jump on the disc -- both verbatim from each view's pre-#1091 code.
 */
import { terminatorCoordinates } from "@/components/map/lib/flatMapIllumination";
import { getSubsolarPoint } from "@/lib/utils/sun";
import type { Projection } from "@/lib/map/projection";

/** Orange terminator line colour (#1091 PR 8: was `#ff8b46` on the flat
 * map and `#ff6b35` on the disc -- unified on the disc's colour). */
export const TERMINATOR_COLOR = "#ff6b35";
/** Dark, soft outline that keeps the orange edge legible over snow and
 * deserts -- the flat map's pre-#1091 outline pass, now also drawn on the
 * disc. */
export const TERMINATOR_OUTLINE_COLOR = "rgba(8, 14, 25, 0.7)";

export interface TerminatorLayerStyle {
  readonly highViz: boolean;
  readonly dashed: boolean;
}

/**
 * Draw the day/night terminator as two strokes of the same path: a dark
 * outline pass, then the orange colour pass. Style values are the flat
 * map's pre-#1091 `drawFlatTerminator` verbatim (colour aside), run through
 * `projection.screenPx` for the damping each view already carries.
 */
export function drawTerminatorLayer(
  ctx: CanvasRenderingContext2D,
  date: Date,
  projection: Projection,
  style: TerminatorLayerStyle,
): void {
  const { highViz, dashed } = style;
  const sun = getSubsolarPoint(date);

  // Reference px for the sample-density rule: the flat map's own width on
  // the equirectangular branch, the disc's diameter on the azimuthal
  // branch (this is the flat map's `Math.ceil(width * scale)` rule,
  // verbatim, applied to the disc too -- #1091 PR 8).
  const referencePx =
    projection.kind === "equirectangular"
      ? projection.wrapWidth
      : 2 * projection.discRadiusPx;
  const samples = Math.min(
    16384,
    Math.max(2048, Math.ceil(referencePx * projection.zoomScale)),
  );
  const points = terminatorCoordinates(sun.lat, sun.lon, samples);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (dashed) {
    ctx.setLineDash([projection.screenPx(8), projection.screenPx(4)]);
  } else {
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  if (projection.kind === "equirectangular") {
    // Verbatim from `drawFlatTerminator`: break the path on an
    // antimeridian wrap (a >180 degree jump in longitude between
    // consecutive samples).
    let lastLon: number | undefined;
    for (const point of points) {
      const { x, y } = projection.project(point.lat, point.lon);
      if (lastLon === undefined || Math.abs(point.lon - lastLon) > 180) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      lastLon = point.lon;
    }
  } else {
    // Verbatim from the disc's old `drawTerminator`: break the path when
    // the squared canvas-space jump between consecutive samples exceeds
    // the disc's squared radius (a projection discontinuity, not a real
    // edge on the curve).
    const discRadiusPx = projection.discRadiusPx;
    const jumpThresholdSq = discRadiusPx * discRadiusPx;
    let last: { x: number; y: number } | undefined;
    for (const point of points) {
      const { x, y } = projection.project(point.lat, point.lon);
      if (last === undefined) {
        ctx.moveTo(x, y);
      } else {
        const dx = x - last.x;
        const dy = y - last.y;
        if (dx * dx + dy * dy > jumpThresholdSq) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      last = { x, y };
    }
  }

  ctx.strokeStyle = TERMINATOR_OUTLINE_COLOR;
  ctx.lineWidth = projection.screenPx(highViz ? 5 : 4);
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = TERMINATOR_COLOR;
  ctx.lineWidth = projection.screenPx(highViz ? 3 : 2.25);
  ctx.stroke();
  ctx.restore();
}

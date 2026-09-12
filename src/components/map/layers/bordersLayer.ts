/**
 * bordersLayer -- shared Canvas 2D draw code for country and US state
 * border polylines, against a shared `Projection` so both the flat map and
 * the azimuthal disc call the same draw code instead of duplicating the
 * seam logic (unwrap-and-repeat on the flat map, rim-drop + jump-break on
 * the disc) and the colour/width tables (#1091).
 *
 * The night-side CLIP geometry (the terminator-shaped clip path built
 * before redrawing borders at boosted opacity) also lives here
 * (`drawNightBoostedBordersLayer`, #1091 PR 7): the terminator sampling
 * step (`profile.nightClip.stepDeg`) and the clip's closure geometry
 * (rectangle corners on the flat map, an arc sweep on the disc) still
 * differ per view, but are now selected by `projection.kind` in one
 * function instead of duplicated in each view.
 */

import { WORLD_COUNTRIES } from "@/lib/data/worldCountries.generated";
import { US_STATES } from "@/lib/data/usStates.generated";
import { addWrappedRingPath } from "@/lib/utils/standardMap";
import { getSubsolarPoint } from "@/lib/utils/sun";
import type { Projection } from "@/lib/map/projection";
import type { MapLayerProfile } from "@/lib/map/mapLayerProfile";

export interface BorderLayerStyle {
  readonly standardMode: boolean;
  readonly lightTheme: boolean;
}

/**
 * Trace one lat/lon ring onto the current path, selecting the seam
 * primitive by `projection.kind`:
 *
 * - `equirectangular`: delegates to `addWrappedRingPath`, which unwraps the
 *   anti-meridian and draws up to three wrapped copies. Behaviour
 *   byte-identical to the pre-#1091 flat map call sites.
 * - `azimuthal`: the per-vertex loop `drawAzimuthalBorders` /
 *   `drawAzimuthalStateBorders` used inline before #1091 -- drop a vertex
 *   once it is past the disc rim (`profile.borders.rimDrop`), `moveTo` on
 *   re-entry, jump-break `moveTo` when the squared canvas jump between
 *   consecutive vertices exceeds `profile.borders.jumpBreakFraction` of the
 *   disc radius squared, `lineTo` otherwise. No `closePath` -- borders are
 *   stroked as open polylines, same as before #1091.
 */
export function traceRing(
  ctx: CanvasRenderingContext2D,
  ring: [number, number][],
  projection: Projection,
  profile: MapLayerProfile,
): void {
  if (projection.kind === "equirectangular") {
    addWrappedRingPath(
      ctx,
      ring,
      projection.wrapWidth ?? 0,
      projection.wrapHeight ?? 0,
    );
    return;
  }

  // Azimuthal seam: profile.borders and projection.discRadiusPx are only
  // ever undefined here if a caller pairs an azimuthal projection with a
  // profile that has no borders group (a wiring bug, not a runtime state
  // this function needs to tolerate) -- AZIMUTHAL_LAYER_PROFILE always
  // carries both.
  const { rimDrop, jumpBreakFraction } = profile.borders!;
  const discRadiusPx = projection.discRadiusPx!;
  const jumpThresholdSq = discRadiusPx * discRadiusPx * jumpBreakFraction;

  let inPath = false;
  for (let i = 0; i < ring.length; i++) {
    const [lat, lon] = ring[i];
    const point = projection.project(lat, lon);
    const rim = point.rim ?? 0;

    if (rim > rimDrop) {
      // Outside visible circle -- break the path.
      inPath = false;
      continue;
    }

    if (!inPath) {
      ctx.moveTo(point.x, point.y);
      inPath = true;
      continue;
    }

    // Check for large jumps (anti-meridian or edge wrapping). Main
    // re-projects the previous vertex each step rather than caching it --
    // kept as-is here.
    const prev = ring[i - 1];
    if (prev) {
      const prevPoint = projection.project(prev[0], prev[1]);
      const dx = point.x - prevPoint.x;
      const dy = point.y - prevPoint.y;
      if (dx * dx + dy * dy > jumpThresholdSq) {
        // Big jump -- start new sub-path.
        ctx.moveTo(point.x, point.y);
        continue;
      }
    }
    ctx.lineTo(point.x, point.y);
  }
}

function countryBorderStyle(style: BorderLayerStyle): {
  strokeStyle: string;
  lineWidth: number;
} {
  const { standardMode, lightTheme } = style;
  return {
    strokeStyle: standardMode
      ? lightTheme
        ? "rgba(15, 23, 42, 0.6)"
        : "rgba(255, 255, 255, 0.65)"
      : "rgba(255, 255, 255, 0.3)",
    lineWidth: standardMode ? 1.0 : 0.8,
  };
}

function stateBorderStyle(style: BorderLayerStyle): {
  strokeStyle: string;
  lineWidth: number;
} {
  const { standardMode, lightTheme } = style;
  return {
    strokeStyle: standardMode
      ? lightTheme
        ? "rgba(15, 23, 42, 0.5)"
        : "rgba(255, 255, 255, 0.45)"
      : "rgba(255, 255, 255, 0.2)",
    lineWidth: standardMode ? 0.7 : 0.5,
  };
}

/** Draw country border polygons: one `beginPath`, every ring of every
 * country traced through `traceRing`, one `stroke`. */
export function drawCountryBordersLayer(
  ctx: CanvasRenderingContext2D,
  projection: Projection,
  profile: MapLayerProfile,
  style: BorderLayerStyle,
): void {
  const { strokeStyle, lineWidth } = countryBorderStyle(style);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (const country of WORLD_COUNTRIES) {
    for (const ring of country.borders) {
      traceRing(ctx, ring, projection, profile);
    }
  }
  ctx.stroke();
}

/** Draw US state border polygons: one `beginPath`, every ring of every
 * state traced through `traceRing`, one `stroke`. */
export function drawStateBordersLayer(
  ctx: CanvasRenderingContext2D,
  projection: Projection,
  profile: MapLayerProfile,
  style: BorderLayerStyle,
): void {
  const { strokeStyle, lineWidth } = stateBorderStyle(style);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (const state of US_STATES) {
    for (const ring of state.borders) {
      traceRing(ctx, ring, projection, profile);
    }
  }
  ctx.stroke();
}

/** Country borders redrawn at boosted opacity inside a caller-owned
 * night-side clip. Style is fixed (not theme/mode dependent), matching both
 * views' night-boosted pass before #1091. */
export function drawBoostedCountryBordersLayer(
  ctx: CanvasRenderingContext2D,
  projection: Projection,
  profile: MapLayerProfile,
): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  for (const country of WORLD_COUNTRIES) {
    for (const ring of country.borders) {
      traceRing(ctx, ring, projection, profile);
    }
  }
  ctx.stroke();
}

/** State borders redrawn at boosted opacity inside a caller-owned
 * night-side clip. Style is fixed (not theme/mode dependent), matching both
 * views' night-boosted pass before #1091. */
export function drawBoostedStateBordersLayer(
  ctx: CanvasRenderingContext2D,
  projection: Projection,
  profile: MapLayerProfile,
): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (const state of US_STATES) {
    for (const ring of state.borders) {
      traceRing(ctx, ring, projection, profile);
    }
  }
  ctx.stroke();
}

/**
 * Draw country and/or state borders at boosted opacity within a night-side
 * clip built from the terminator (#1091 PR 7, replacing each view's own
 * `drawNightBoostedBorders`/`drawAzimuthalNightBoostedBorders`).
 *
 * `save`s, samples the terminator at `profile.nightClip.stepDeg` from -180
 * to 180 inclusive through `projection.project(lat, lon)`, closes the path
 * around the night side, `clip`s, redraws the requested boosted passes,
 * then `restore`s. The closure geometry is selected by `projection.kind`:
 *
 * - `equirectangular`: extends the terminator polyline to the canvas edge
 *   that contains the anti-subsolar point ("top" when its projected y is
 *   `< wrapHeight / 2`, else "bottom"), then across and down/up the two
 *   corners on that side. Byte-identical to the old
 *   `FlatMapView.drawNightBoostedBorders`.
 * - `azimuthal`: sweeps a 36-step arc of radius `discRadiusPx * 1.5`
 *   (centred on `discCenterPx`) from the terminator's last point to its
 *   first, choosing the sweep direction that passes through the
 *   anti-subsolar point's angle. Byte-identical to the old
 *   `AzimuthalView.drawAzimuthalNightBoostedBorders`.
 */
export function drawNightBoostedBordersLayer(
  ctx: CanvasRenderingContext2D,
  date: Date,
  projection: Projection,
  profile: MapLayerProfile,
  draw: { country: boolean; states: boolean },
): void {
  const subsolar = getSubsolarPoint(date);
  const subsolarLatRad = subsolar.lat * (Math.PI / 180);
  const subsolarLonRad = subsolar.lon * (Math.PI / 180);
  const tanSubsolarLat = Math.tan(subsolarLatRad);
  const isNearEquinox = Math.abs(tanSubsolarLat) < 0.001;
  const stepDeg = profile.nightClip.stepDeg;

  ctx.save();
  ctx.beginPath();

  const terminatorPoints: { x: number; y: number }[] = [];
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    const lonRad = lon * (Math.PI / 180);
    const deltaLon = lonRad - subsolarLonRad;
    let lat: number;
    if (isNearEquinox) {
      lat = 0;
    } else {
      lat = Math.atan(-Math.cos(deltaLon) / tanSubsolarLat) * (180 / Math.PI);
    }
    const p = projection.project(lat, lon);
    terminatorPoints.push({ x: p.x, y: p.y });
  }

  for (let i = 0; i < terminatorPoints.length; i++) {
    const p = terminatorPoints[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }

  // The anti-subsolar point is the centre of the night side.
  const antiSubsolarLat = -subsolar.lat;
  const antiSubsolarLon =
    subsolar.lon > 0 ? subsolar.lon - 180 : subsolar.lon + 180;

  if (projection.kind === "equirectangular") {
    const width = projection.wrapWidth ?? 0;
    const height = projection.wrapHeight ?? 0;
    const antiPoint = projection.project(antiSubsolarLat, antiSubsolarLon);
    const lastP = terminatorPoints[terminatorPoints.length - 1];
    const firstP = terminatorPoints[0];
    if (antiPoint.y < height / 2) {
      // Night side is at the top.
      ctx.lineTo(width, lastP.y);
      ctx.lineTo(width, 0);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, firstP.y);
    } else {
      // Night side is at the bottom.
      ctx.lineTo(width, lastP.y);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.lineTo(0, firstP.y);
    }
  } else {
    const { x: cx, y: cy } = projection.discCenterPx!;
    const antiProj = projection.project(antiSubsolarLat, antiSubsolarLon);
    const antiAngle = Math.atan2(antiProj.y - cy, antiProj.x - cx);

    // Sweep an arc around the outside of the projection circle on the
    // night side. This is approximate but effective for clipping.
    const lastTerminator = terminatorPoints[terminatorPoints.length - 1];
    const firstTerminator = terminatorPoints[0];
    const endAngle = Math.atan2(lastTerminator.y - cy, lastTerminator.x - cx);
    const startAngle = Math.atan2(
      firstTerminator.y - cy,
      firstTerminator.x - cx,
    );
    const bigR = projection.discRadiusPx! * 1.5;
    const steps = 36;
    // Determine sweep direction: go from endAngle to startAngle through
    // the anti-subsolar side.
    let sweepAngle = startAngle - endAngle;
    if (Math.cos(antiAngle - (endAngle + sweepAngle / 2)) < 0) {
      // anti-subsolar is on the other side, sweep the other way
      if (sweepAngle > 0) sweepAngle -= 2 * Math.PI;
      else sweepAngle += 2 * Math.PI;
    }
    for (let i = 0; i <= steps; i++) {
      const a = endAngle + (sweepAngle * i) / steps;
      ctx.lineTo(cx + bigR * Math.cos(a), cy + bigR * Math.sin(a));
    }
  }

  ctx.closePath();
  ctx.clip();

  if (draw.country) {
    drawBoostedCountryBordersLayer(ctx, projection, profile);
  }
  if (draw.states) {
    drawBoostedStateBordersLayer(ctx, projection, profile);
  }

  ctx.restore();
}

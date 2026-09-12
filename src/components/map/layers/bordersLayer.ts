/**
 * bordersLayer -- shared Canvas 2D draw code for country and US state
 * border polylines, against a shared `Projection` so both the flat map and
 * the azimuthal disc call the same draw code instead of duplicating the
 * seam logic (unwrap-and-repeat on the flat map, rim-drop + jump-break on
 * the disc) and the colour/width tables (#1091).
 *
 * The night-side CLIP geometry (the terminator-shaped clip path each view
 * builds before redrawing borders at boosted opacity) stays in each view --
 * it differs in step size (2 deg vs 3 deg) and closure geometry between the
 * two maps, and harmonising it is a later PR's design call. Each view's
 * night-boosted function keeps its own clip code and calls
 * `drawBoostedCountryBordersLayer` / `drawBoostedStateBordersLayer` inside
 * the clip.
 */

import { WORLD_COUNTRIES } from "@/lib/data/worldCountries.generated";
import { US_STATES } from "@/lib/data/usStates.generated";
import { addWrappedRingPath } from "@/lib/utils/standardMap";
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

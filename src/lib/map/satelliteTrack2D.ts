/**
 * Flat-map (2D canvas) satellite orbit track geometry (#994 PR B).
 *
 * Companion to the globe's store-driven `GroundTrack` in
 * `SatelliteOverlay.tsx`: builds the same `buildOrbitTrack` timeline with the
 * same `selectTrackDotIndices` / `selectTrackLabelIndices` cadence, so the
 * flat map and the globe agree on which points get a dot or a time-marker
 * label for a given satellite + `SatelliteTrackConfig`.
 *
 * Kept canvas-free (returns plain x/y coordinate arrays, not draw calls) so
 * it is unit-testable without a `CanvasRenderingContext2D` -- jsdom does not
 * implement 2D canvas rendering. `FlatMapView.tsx`'s `drawSatelliteTracks` is
 * a thin loop over this module's output.
 */

import type { TLEData } from "@/types/satellite";
import { buildOrbitTrack } from "@/lib/api/satellites";
import {
  selectTrackDotIndices,
  selectTrackLabelIndices,
} from "@/lib/map/satelliteGeometry";

export interface FlatTrackPoint {
  x: number;
  y: number;
}

export interface FlatTrackLabel extends FlatTrackPoint {
  minutesFromNow: number;
}

export interface FlatSatelliteTrackGeometry {
  /** Trailing (past) polyline, split into segments at antimeridian crossings. */
  pastSegments: FlatTrackPoint[][];
  /** Forward (future) polyline, split the same way. */
  futureSegments: FlatTrackPoint[][];
  /** Every-10-minute dot markers (bounded by `selectTrackDotIndices`). */
  dots: FlatTrackPoint[];
  /** Time-marker labels (bounded by `selectTrackLabelIndices`). */
  labels: FlatTrackLabel[];
}

/** Minutes of trailing track shown when a track's `showPast` is on -- same
 * value `SatelliteOverlay`'s `GroundTrack` uses. */
const PAST_TRACK_MINUTES = 45;

/**
 * Same equirectangular projection as `FlatMapView`'s (unexported)
 * `latLonToCanvas`: `x = ((lon + 180) / 360) * width`,
 * `y = ((90 - lat) / 180) * height`. Duplicated here (rather than imported)
 * because `FlatMapView.tsx`'s copy is a local, unexported function.
 */
function latLonToCanvas(
  lat: number,
  lon: number,
  width: number,
  height: number,
): FlatTrackPoint {
  return {
    x: ((lon + 180) / 360) * width,
    y: ((90 - lat) / 180) * height,
  };
}

export interface FlatSatelliteTrackConfig {
  orbitsAhead: 1 | 2 | 3;
  showPast: boolean;
}

/**
 * Build one satellite's flat-map orbit track for the given canvas size.
 *
 * Past/future segments are split the same way `SatelliteOverlay`'s
 * `GroundTrack` splits its 3D polyline: bridge the last past point and the
 * `t = 0` point into the future segment so the line is continuous across
 * "now", and break a segment whenever the antimeridian is crossed -- here
 * detected the way the rest of `FlatMapView` detects it (pixel-space jump
 * `> width / 2`, `FlatMapView.tsx`'s `drawPath`), not by a raw longitude
 * delta, so the break threshold matches every other flat-map polyline.
 */
export function buildFlatSatelliteTrack(
  satellite: TLEData,
  config: FlatSatelliteTrackConfig,
  now: Date,
  width: number,
  height: number,
): FlatSatelliteTrackGeometry {
  const track = buildOrbitTrack(satellite, now, {
    pastMin: config.showPast ? PAST_TRACK_MINUTES : 0,
    orbitsAhead: config.orbitsAhead,
    stepMin: 1,
  });

  const dotIndices = new Set(selectTrackDotIndices(track));
  const labelIndices = new Set(selectTrackLabelIndices(track));

  const pastSegments: FlatTrackPoint[][] = [];
  const futureSegments: FlatTrackPoint[][] = [];
  let currentPast: FlatTrackPoint[] = [];
  let currentFuture: FlatTrackPoint[] = [];
  const dots: FlatTrackPoint[] = [];
  const labels: FlatTrackLabel[] = [];

  let lastX: number | null = null;

  for (let i = 0; i < track.length; i++) {
    const point = track[i];
    const vec = latLonToCanvas(point.lat, point.lon, width, height);

    if (lastX !== null && Math.abs(vec.x - lastX) > width / 2) {
      if (currentPast.length > 1) pastSegments.push(currentPast);
      if (currentFuture.length > 1) futureSegments.push(currentFuture);
      currentPast = [];
      currentFuture = [];
    }
    lastX = vec.x;

    if (point.minutesFromNow < 0) {
      currentPast.push(vec);
      if (currentFuture.length > 1) {
        futureSegments.push(currentFuture);
        currentFuture = [];
      }
    } else if (currentPast.length > 0 && currentFuture.length === 0) {
      // Bridge across the "now" boundary, same as GroundTrack.
      currentFuture.push(currentPast[currentPast.length - 1], vec);
      if (currentPast.length > 1) pastSegments.push(currentPast);
      currentPast = [];
    } else {
      currentFuture.push(vec);
    }

    if (dotIndices.has(i)) dots.push(vec);
    if (labelIndices.has(i)) {
      labels.push({ ...vec, minutesFromNow: point.minutesFromNow });
    }
  }

  if (currentPast.length > 1) pastSegments.push(currentPast);
  if (currentFuture.length > 1) futureSegments.push(currentFuture);

  return { pastSegments, futureSegments, dots, labels };
}

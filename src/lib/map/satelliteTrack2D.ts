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
 * implement 2D canvas rendering. `satelliteTrackDraw2D.ts`'s
 * `drawSatelliteTracks` is a thin loop over this module's output.
 *
 * Split into a propagation step (`buildOrbitTrack`, expensive SGP4) and a
 * projection step (`projectOrbitTrack`, cheap O(n) lat/lon-to-canvas) so
 * `FlatMapView` can cache the former independently of canvas size/selection
 * (#994 PR B round 2 item 1) -- see `getCachedOrbitTrack` below.
 */

import type { TLEData } from "@/types/satellite";
import { buildOrbitTrack, type OrbitTrackPoint } from "@/lib/api/satellites";
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
 * Project an already-propagated orbit-track timeline onto flat-map canvas
 * coordinates for the given canvas size. Pure and cheap (O(n) over `track`,
 * no SGP4) -- unlike `buildOrbitTrack`, this is safe to call on every render.
 *
 * Past/future segments are split the same way `SatelliteOverlay`'s
 * `GroundTrack` splits its 3D polyline: bridge the last past point and the
 * `t = 0` point into the future segment so the line is continuous across
 * "now", and break a segment whenever the antimeridian is crossed -- here
 * detected the way the rest of `FlatMapView` detects it (pixel-space jump
 * `> width / 2`, `FlatMapView.tsx`'s `drawPath`), not by a raw longitude
 * delta, so the break threshold matches every other flat-map polyline.
 */
export function projectOrbitTrack(
  track: readonly OrbitTrackPoint[],
  width: number,
  height: number,
): FlatSatelliteTrackGeometry {
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

/**
 * Build one satellite's flat-map orbit track for the given canvas size.
 * Thin: propagates via `buildOrbitTrack`, then projects via
 * `projectOrbitTrack`. Callers that redraw far more often than the orbit
 * actually changes (`FlatMapView`) should use `getCachedOrbitTrack` +
 * `projectOrbitTrack` directly instead, to avoid re-running SGP4 every call.
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
  return projectOrbitTrack(track, width, height);
}

// ---------------------------------------------------------------------------
// Per-satellite orbit-track propagation cache (#994 PR B round 2 item 1)
// ---------------------------------------------------------------------------

interface CachedOrbitTrack {
  key: string;
  track: OrbitTrackPoint[];
}

/**
 * Keyed by NORAD id rather than the full composite key below, so the cache
 * holds only the latest track per satellite (bounded by however many
 * distinct satellites have ever been tracked this session) instead of
 * growing one entry per minute tick forever.
 */
const orbitTrackCache = new Map<number, CachedOrbitTrack>();

/**
 * Cached wrapper around `buildOrbitTrack`, keyed on everything that should
 * actually invalidate a propagation (satellite identity/TLE + track config +
 * a caller-supplied `minuteTick`) but NOT on values that change far more
 * often for reasons unrelated to the orbit itself.
 *
 * `FlatMapView`'s `satPositions` gets a new array identity on every 5s
 * satellite-position poll (`useSatellites`), so a naive per-render
 * `buildOrbitTrack` call there would re-run full SGP4 propagation -- up to
 * ~4,300 one-minute steps for a GEO bird at 3 orbits ahead -- on every poll,
 * every selection change, and every resize (#994 PR B round 2 finding 1).
 * `SatelliteOverlay.tsx`'s `GroundTrack` avoids this for the globe because
 * it is a real per-satellite React component, so its own `useMemo` can be
 * keyed on just `[noradId, line1, line2, showPast, orbitsAhead, minuteTick]`.
 * `FlatMapView` instead builds every tracked satellite's geometry inside one
 * loop in a single memo (there is no "one component per satellite" to hang a
 * per-track `useMemo` off), so the equivalent caching has to live outside
 * React's hook system -- a plain module-level cache, keyed the same way.
 */
export function getCachedOrbitTrack(
  satellite: TLEData,
  config: FlatSatelliteTrackConfig,
  minuteTick: number,
): OrbitTrackPoint[] {
  const key = `${satellite.noradId}|${satellite.line1}|${satellite.line2}|${config.orbitsAhead}|${config.showPast}|${minuteTick}`;
  const cached = orbitTrackCache.get(satellite.noradId);
  if (cached && cached.key === key) return cached.track;

  const track = buildOrbitTrack(satellite, new Date(), {
    pastMin: config.showPast ? PAST_TRACK_MINUTES : 0,
    orbitsAhead: config.orbitsAhead,
    stepMin: 1,
  });
  orbitTrackCache.set(satellite.noradId, { key, track });
  return track;
}

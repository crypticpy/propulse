/**
 * Shared satellite-overlay geometry helpers.
 *
 * `latLonAltToVector3` / `latLonToSurface` used to be duplicated verbatim in
 * `SatelliteOverlay.tsx` and `ISSTrackerOverlay.tsx` (#994 census). Both
 * build on the same lat/lon-to-sphere-point math as
 * `src/components/map/lib/globeCoords.ts`'s `latLonToVector3`, just at a
 * satellite-specific radius (surface vs. exaggerated altitude), so they are
 * thin wrappers around that shared helper rather than a second copy of the
 * phi/theta trig.
 */

import type * as THREE from "three";
import { latLonToVector3 } from "@/components/map/lib/globeCoords";

/** Globe radius (matching EarthSphere). */
export const SATELLITE_GLOBE_RADIUS = 1.0;

/** Earth radius in km, for altitude scaling. */
export const SATELLITE_EARTH_RADIUS_KM = 6371.0;

/**
 * Visual altitude scale factor. True altitude would place the ISS at
 * r = 1 + 408/6371 ~= 1.064; scaled up so satellites are clearly above the
 * surface.
 */
export const SATELLITE_ALT_SCALE = 3.0;

/** Base surface offset to prevent z-fighting with the globe/tiles. */
export const SATELLITE_SURFACE_OFFSET = 0.015;

/**
 * Convert lat/lon/alt to a 3D position on the globe, at the exaggerated
 * visual altitude used for satellite markers and orbit rings.
 */
export function latLonAltToVector3(
  lat: number,
  lon: number,
  altKm: number,
): THREE.Vector3 {
  const visualAlt = (altKm / SATELLITE_EARTH_RADIUS_KM) * SATELLITE_ALT_SCALE;
  const radius = SATELLITE_GLOBE_RADIUS + SATELLITE_SURFACE_OFFSET + visualAlt;
  return latLonToVector3(lat, lon, radius);
}

/**
 * Convert lat/lon to a surface position (ground tracks, footprints,
 * connector lines) — a tiny offset above the globe surface to avoid
 * z-fighting.
 */
export function latLonToSurface(lat: number, lon: number): THREE.Vector3 {
  return latLonToVector3(lat, lon, SATELLITE_GLOBE_RADIUS + 0.005);
}

// ---------------------------------------------------------------------------
// Orbit-track time-marker label selection (#1029 review)
// ---------------------------------------------------------------------------

/** Target upper bound on time-marker labels emitted per orbit track. */
export const MAX_TRACK_LABELS = 12;

/** Default minimum great-circle separation between two emitted labels. */
export const MIN_TRACK_LABEL_SEPARATION_DEG = 2;

/** Never label more densely than this, even on a short track. */
const BASE_LABEL_INTERVAL_MIN = 30;

/** Label interval is always rounded up to a multiple of this many minutes. */
const LABEL_INTERVAL_ROUNDING_MIN = 5;

export interface TrackLabelPoint {
  lat: number;
  lon: number;
  minutesFromNow: number;
}

export interface SelectTrackLabelOptions {
  /** Upper bound on emitted labels. Defaults to `MAX_TRACK_LABELS`. */
  maxLabels?: number;
  /**
   * Minimum great-circle distance (degrees) between consecutive emitted
   * labels. Defaults to `MIN_TRACK_LABEL_SEPARATION_DEG`.
   */
  minSeparationDeg?: number;
}

/**
 * Great-circle angular separation between two lat/lon points, in degrees
 * (haversine central angle — same formula as `getDistance` in
 * `src/lib/utils/path.ts`, kept local here to avoid a cross-domain import
 * for a single trig call).
 */
function angularSeparationDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = Math.PI / 180;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const deltaPhi = (lat2 - lat1) * toRad;
  const deltaLambda = (lon2 - lon1) * toRad;

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const centralAngleRad = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return centralAngleRad * (180 / Math.PI);
}

/**
 * Choose which points of an orbit-track timeline get a time-marker label.
 *
 * A geostationary satellite (period ~1436 min) rendered 3 orbits ahead at a
 * 1-minute step produces ~4300 track points; labeling every 30 minutes
 * there emits ~145 labels, each a Drei `Html` DOM portal in the per-frame
 * globe occlusion batch (`SatelliteOverlay`'s `GroundTrack`, #1029 review).
 * Two independent bounds keep the count small regardless of track length:
 *
 *  1. Temporal — the label interval only ever widens past the 30-minute
 *     default (never narrows below it), chosen so at most ~`maxLabels`
 *     labels are emitted across the whole track, then rounded up to a
 *     5-minute multiple for a tidy cadence.
 *  2. Spatial — a candidate is skipped if it falls within
 *     `minSeparationDeg` great-circle degrees of the last *emitted* label,
 *     so a slow-moving (near-GEO) track doesn't stack labels on nearly the
 *     same globe position even after the temporal thinning.
 *
 * The `t = 0` ("now") point, if present in `points`, is always selected —
 * it survives both the temporal and spatial filters — since it anchors the
 * satellite's current position and is the one label a user relies on.
 *
 * `points` must be ordered by `minutesFromNow` ascending, as `buildOrbitTrack`
 * produces them.
 */
export function selectTrackLabelIndices(
  points: readonly TrackLabelPoint[],
  options: SelectTrackLabelOptions = {},
): number[] {
  if (points.length === 0) return [];

  const maxLabels = options.maxLabels ?? MAX_TRACK_LABELS;
  const minSeparationDeg =
    options.minSeparationDeg ?? MIN_TRACK_LABEL_SEPARATION_DEG;

  const totalMinutes = Math.max(
    1,
    Math.abs(points[points.length - 1].minutesFromNow - points[0].minutesFromNow),
  );
  const rawIntervalMin = Math.max(
    BASE_LABEL_INTERVAL_MIN,
    Math.ceil(totalMinutes / Math.max(1, maxLabels)),
  );
  const intervalMin =
    Math.ceil(rawIntervalMin / LABEL_INTERVAL_ROUNDING_MIN) *
    LABEL_INTERVAL_ROUNDING_MIN;

  const selected: number[] = [];
  let lastLabel: TrackLabelPoint | null = null;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const isAnchor = point.minutesFromNow === 0;
    const onInterval = point.minutesFromNow % intervalMin === 0;
    if (!isAnchor && !onInterval) continue;

    if (!isAnchor && lastLabel) {
      const separation = angularSeparationDeg(
        lastLabel.lat,
        lastLabel.lon,
        point.lat,
        point.lon,
      );
      if (separation < minSeparationDeg) continue;
    }

    selected.push(i);
    lastLabel = point;
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Footprint slot selection (#1029 review)
// ---------------------------------------------------------------------------

export interface FootprintSelectionOptions {
  /** Maximum number of footprints to render at once. */
  maxFootprints: number;
  /** Ids that must survive the cap regardless of their position in `footprints`. */
  trackedSatelliteIds?: ReadonlySet<string>;
  /** The currently-selected satellite id, if any — always wins the cap. */
  selectedSatelliteId?: string | null;
}

/**
 * Cap `footprints` at `maxFootprints`, rescuing must-keep ids that the
 * simple `slice` would otherwise drop.
 *
 * Two tiers, in priority order:
 *
 *  1. Tracked ids (`trackedSatelliteIds`, a per-satellite opt-in) are
 *     rescued into any slot that doesn't already hold another must-keep id.
 *  2. The selected satellite (`selectedSatelliteId`) always wins, even if
 *     every slot is already occupied by a tracked id — five tracked
 *     footprints can fill every slot of a 5-footprint cap, and without this
 *     tier the selected satellite's footprint silently disappears from the
 *     globe while its detail modal is open (#1029 review). If no
 *     unprotected slot exists, the selected satellite evicts the last slot,
 *     even though that slot holds a tracked id — the explicit selection
 *     always outranks the passive tracked opt-in.
 */
export function selectLimitedFootprints<T extends { satelliteId: string }>(
  footprints: readonly T[],
  options: FootprintSelectionOptions,
): T[] {
  const { maxFootprints, selectedSatelliteId } = options;
  const trackedSatelliteIds = options.trackedSatelliteIds ?? new Set<string>();
  const limited = footprints.slice(0, maxFootprints);

  if (trackedSatelliteIds.size > 0) {
    const missingTracked = Array.from(trackedSatelliteIds).filter(
      (id) => !limited.some((fp) => fp.satelliteId === id),
    );
    let rescueSlot = limited.length - 1;
    for (const id of missingTracked) {
      const found = footprints.find((fp) => fp.satelliteId === id);
      if (!found) continue;
      while (
        rescueSlot >= 0 &&
        trackedSatelliteIds.has(limited[rescueSlot].satelliteId)
      ) {
        rescueSlot--;
      }
      if (rescueSlot < 0) break;
      limited[rescueSlot] = found;
      rescueSlot--;
    }
  }

  if (
    selectedSatelliteId &&
    !limited.some((fp) => fp.satelliteId === selectedSatelliteId)
  ) {
    const found = footprints.find(
      (fp) => fp.satelliteId === selectedSatelliteId,
    );
    if (found && limited.length > 0) {
      limited[limited.length - 1] = found;
    } else if (found) {
      limited.push(found);
    }
  }

  return limited;
}

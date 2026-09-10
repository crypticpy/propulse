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

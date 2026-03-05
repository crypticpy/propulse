/**
 * Shared coordinate conversion helpers for globe overlay components.
 *
 * These functions convert between geographic coordinates (lat/lon) and
 * 3D positions on the unit globe. The coordinate system matches the
 * 3d-tiles-renderer WGS84 ellipsoid scaled to unit sphere:
 *   - Y axis points to geographic north pole
 *   - X/Z plane is the equator
 *   - lon=0 maps to the -X axis (Three.js convention with phiStart offset)
 */

import * as THREE from "three";

/**
 * Convert lat/lon to a THREE.Vector3 on a sphere of given radius.
 *
 * @param lat  Latitude in degrees (-90 to +90)
 * @param lon  Longitude in degrees (-180 to +180)
 * @param radius  Sphere radius (default 1.0)
 */
export function latLonToVector3(
  lat: number,
  lon: number,
  radius: number = 1.0,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Convert lat/lon to a [x, y, z] tuple. Useful for InstancedMesh
 * workflows where a Vector3 allocation is unnecessary.
 */
export function latLonTo3D(
  lat: number,
  lon: number,
  radius: number = 1.0,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

/**
 * Get the surface normal (up direction) at a given lat/lon.
 * Returns a normalized Vector3 pointing away from the globe center.
 */
export function getUpDirection(lat: number, lon: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize();
}

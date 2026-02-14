/**
 * SatelliteFootprint3D
 *
 * Renders translucent radio footprint circles on the 3D globe surface for
 * selected satellites. Each footprint represents the satellite's approximate
 * radio coverage area, calculated from its orbital altitude.
 *
 * The circle is oriented tangent to the globe surface at the sub-satellite
 * point, with a ring-like fade (edges more opaque than center).
 *
 * Performance-limited to 5 simultaneous footprints.
 *
 * Accepts all data as props -- no direct hook imports.
 */

import React, { useMemo } from "react";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SatelliteFootprintData {
  satelliteId: string;
  lat: number;
  lon: number;
  altitudeKm: number;
  color: string; // hex color from satellite category
}

interface SatelliteFootprint3DProps {
  footprints: SatelliteFootprintData[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Globe surface radius */
const SURFACE_RADIUS = 1.01;

/** Earth mean radius in km */
const EARTH_RADIUS_KM = 6371;

/** Maximum simultaneous footprints */
const MAX_FOOTPRINTS = 5;

/** Circle geometry resolution */
const CIRCLE_SEGMENTS = 64;

/** Visual scale factor for aesthetics (raw footprint is too large) */
const VISUAL_SCALE = 0.5;

/** Disc fill opacity (center) */
const CENTER_OPACITY = 0.1;

/** Edge ring opacity */
const EDGE_OPACITY = 0.25;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to a 3D position on the globe.
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
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
 * Get the "up" direction (surface normal) at a given lat/lon.
 */
function getUpDirection(lat: number, lon: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize();
}

/**
 * Calculate the radio footprint radius on the globe surface.
 * Based on the geometric horizon: angular radius = arccos(R / (R + h))
 * Returns the radius in globe coordinate units, scaled for visual aesthetics.
 */
function footprintGlobeRadius(altitudeKm: number): number {
  const angularRadiusRad = Math.acos(
    EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm),
  );
  // Convert angular radius to surface distance in globe units
  const surfaceRadius = angularRadiusRad * SURFACE_RADIUS;
  return surfaceRadius * VISUAL_SCALE;
}

// ---------------------------------------------------------------------------
// Sub-component: single footprint
// ---------------------------------------------------------------------------

interface FootprintDiscProps {
  lat: number;
  lon: number;
  altitudeKm: number;
  color: string;
}

const FootprintDisc = React.memo(function FootprintDisc({
  lat,
  lon,
  altitudeKm,
  color,
}: FootprintDiscProps) {
  const radius = footprintGlobeRadius(altitudeKm);

  // Position on the globe surface
  const position = useMemo(
    () => latLonToVector3(lat, lon, SURFACE_RADIUS),
    [lat, lon],
  );

  // Orientation: circle lies tangent to globe surface
  const quaternion = useMemo(() => {
    const up = getUpDirection(lat, lon);
    const q = new THREE.Quaternion();
    // CircleGeometry lies in the XY plane by default; we want it tangent to the sphere
    // The default normal is (0, 0, 1), rotate to align with the surface normal (up)
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    return q;
  }, [lat, lon]);

  // Filled disc geometry (semi-transparent center)
  const discGeometry = useMemo(
    () => new THREE.CircleGeometry(radius, CIRCLE_SEGMENTS),
    [radius],
  );

  // Edge ring geometry (more opaque border)
  const ringGeometry = useMemo(
    () => new THREE.RingGeometry(radius * 0.9, radius, CIRCLE_SEGMENTS),
    [radius],
  );

  return (
    <group>
      {/* Filled footprint disc */}
      <mesh position={position} quaternion={quaternion} renderOrder={0}>
        <primitive object={discGeometry} attach="geometry" />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={CENTER_OPACITY}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>

      {/* Edge ring -- slightly more opaque */}
      <mesh position={position} quaternion={quaternion} renderOrder={1}>
        <primitive object={ringGeometry} attach="geometry" />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={EDGE_OPACITY}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>
    </group>
  );
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SatelliteFootprint3D = React.memo(function SatelliteFootprint3D({
  footprints,
}: SatelliteFootprint3DProps) {
  if (!footprints || footprints.length === 0) return null;

  // Limit to MAX_FOOTPRINTS for performance
  const limited = footprints.slice(0, MAX_FOOTPRINTS);

  return (
    <group name="satellite-footprints">
      {limited.map((fp) => (
        <FootprintDisc
          key={fp.satelliteId}
          lat={fp.lat}
          lon={fp.lon}
          altitudeKm={fp.altitudeKm}
          color={fp.color}
        />
      ))}
    </group>
  );
});

export default SatelliteFootprint3D;

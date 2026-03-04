/**
 * SatelliteFootprint3D
 *
 * Renders translucent radio footprint caps on the 3D globe surface for
 * selected satellites. Each footprint represents the satellite's approximate
 * radio coverage area, calculated from its orbital altitude.
 *
 * Uses spherical cap geometry that conforms to the globe curvature, avoiding
 * the flat-disc artifact where edges hover above the surface.
 *
 * Performance-limited to 5 simultaneous footprints.
 *
 * Accepts all data as props -- no direct hook imports.
 */

import React, { useEffect, useMemo } from "react";
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

/** Visual scale factor for aesthetics (raw footprint is too large) */
const VISUAL_SCALE = 0.5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Calculate the radio footprint angular radius in radians.
 * Based on the geometric horizon: angular radius = arccos(R / (R + h))
 * Scaled for visual aesthetics.
 */
function footprintAngularRadius(altitudeKm: number): number {
  const angularRadiusRad = Math.acos(
    EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm),
  );
  return angularRadiusRad * VISUAL_SCALE;
}

/**
 * Generate a spherical cap geometry that conforms to the globe surface.
 *
 * The cap is generated centered at the +Y pole of a sphere with the given
 * surfaceRadius, spanning the given angularRadius (half-angle from center).
 * Use a quaternion to rotate the cap to the desired lat/lon position.
 *
 * @param angularRadius  Half-angle from center in radians
 * @param segments       Circumferential divisions
 * @param rings          Concentric rings from center to edge
 * @param surfaceRadius  Globe surface radius (cap vertices lie on this sphere)
 */
function createSphericalCapGeometry(
  angularRadius: number,
  segments: number,
  rings: number,
  surfaceRadius: number,
): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];

  // Center vertex at the "north pole" of the cap
  vertices.push(0, surfaceRadius, 0);

  for (let r = 1; r <= rings; r++) {
    const ringAngle = (r / rings) * angularRadius;
    const sinR = Math.sin(ringAngle);
    const cosR = Math.cos(ringAngle);

    for (let s = 0; s < segments; s++) {
      const segAngle = (s / segments) * Math.PI * 2;
      vertices.push(
        surfaceRadius * sinR * Math.cos(segAngle),
        surfaceRadius * cosR,
        surfaceRadius * sinR * Math.sin(segAngle),
      );
    }
  }

  // Center fan — connect center vertex to first ring
  for (let s = 0; s < segments; s++) {
    indices.push(0, 1 + s, 1 + ((s + 1) % segments));
  }

  // Ring strips — connect consecutive rings
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const curr = 1 + r * segments + s;
      const next = 1 + r * segments + ((s + 1) % segments);
      const currOuter = 1 + (r + 1) * segments + s;
      const nextOuter = 1 + (r + 1) * segments + ((s + 1) % segments);
      indices.push(curr, currOuter, next);
      indices.push(next, currOuter, nextOuter);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
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
  const angularRadius = footprintAngularRadius(altitudeKm);

  const capGeometry = useMemo(
    () => createSphericalCapGeometry(angularRadius, 48, 12, SURFACE_RADIUS),
    [angularRadius],
  );

  useEffect(() => () => capGeometry.dispose(), [capGeometry]);

  // Rotate cap from +Y pole to the correct lat/lon surface normal
  const quaternion = useMemo(() => {
    const up = getUpDirection(lat, lon);
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    return q;
  }, [lat, lon]);

  return (
    <mesh quaternion={quaternion} renderOrder={6}>
      <primitive object={capGeometry} attach="geometry" />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
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

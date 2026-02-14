/**
 * GeomagneticFieldLines3D
 *
 * Renders animated 3D magnetic field lines from Earth's magnetic poles,
 * colored by the current Kp geomagnetic index. Field lines are modeled as
 * magnetic dipole curves extending from magnetic north to south poles,
 * with small particles flowing along each line.
 *
 * Kp coloring:
 * - 0-3 (quiet): green
 * - 4-5 (unsettled/active): yellow
 * - 6-7 (storm): orange
 * - 8-9 (severe storm): red
 *
 * Accepts all data as props -- no direct hook imports.
 */

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeomagneticFieldLines3DProps {
  /** Current Kp index (0-9) */
  kpIndex: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Earth's magnetic north pole (approximate 2025 location) */
const MAG_NORTH_LAT = 86.5;
const MAG_NORTH_LON = -172.5;

/** Earth's magnetic south pole */
const MAG_SOUTH_LAT = -64.1;
const MAG_SOUTH_LON = 136.0;

/** Globe unit radius */
const GLOBE_RADIUS = 1.0;

/** Maximum field line extent as multiplier of globe radius */
const MAX_FIELD_EXTENT = 3.0;

/** Tube radius for field lines */
const TUBE_RADIUS = 0.003;

/** Number of points along each field line curve */
const CURVE_SEGMENTS = 64;

/** Tube geometry radial segments */
const TUBE_RADIAL_SEGMENTS = 6;

/** Particles per field line */
const PARTICLES_PER_LINE = 3;

/** Particle radius */
const PARTICLE_RADIUS = 0.006;

/** Latitudes at which field lines emerge from each pole */
const FIELD_LINE_LATITUDES = [65, 70, 75, 80];

/** Number of longitude divisions per latitude ring */
const LONGITUDE_DIVISIONS = 8;

/** Particle speed (fraction of curve length per second) */
const PARTICLE_SPEED = 0.08;

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

/** Clamp a value */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Get field line color based on Kp index.
 */
function getKpColor(kp: number): THREE.Color {
  if (kp <= 3) return new THREE.Color("#22cc44"); // quiet green
  if (kp <= 5) return new THREE.Color("#ddcc00"); // yellow
  if (kp <= 7) return new THREE.Color("#ff8800"); // orange
  return new THREE.Color("#ff2222"); // red
}

/**
 * Generate a single dipole field line curve from a starting colatitude.
 *
 * Simplified magnetic dipole: r = L * cos^2(theta_m) where L is the
 * equatorial crossing distance and theta_m is the magnetic colatitude.
 *
 * We trace the line from north magnetic hemisphere to south, producing
 * a 3D CatmullRom curve rotated into geographic coordinates.
 */
function generateFieldLineCurve(
  startLat: number,
  lonOffset: number,
): THREE.CatmullRomCurve3 {
  // Convert starting geographic latitude to magnetic colatitude
  const startColatRad = ((90 - startLat) * Math.PI) / 180;

  // L-shell parameter: r at equator for this field line
  const L = GLOBE_RADIUS / (Math.cos(startColatRad) * Math.cos(startColatRad));

  // Clamp L so lines don't extend too far
  const effectiveL = Math.min(L, MAX_FIELD_EXTENT * GLOBE_RADIUS);

  // Magnetic pole axis: direction from center of Earth through magnetic north
  const magNorth = latLonToVector3(MAG_NORTH_LAT, MAG_NORTH_LON, 1).normalize();
  const magSouth = latLonToVector3(MAG_SOUTH_LAT, MAG_SOUTH_LON, 1).normalize();
  const magAxis = magNorth.clone().sub(magSouth).normalize();

  // Build a local coordinate frame aligned with the magnetic axis
  const up = magAxis.clone();
  const right = new THREE.Vector3();
  // Pick a vector not parallel to up
  const tempVec =
    Math.abs(up.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
  right.crossVectors(up, tempVec).normalize();
  const forward = new THREE.Vector3().crossVectors(right, up).normalize();

  // Rotate the plane of this field line around the magnetic axis
  const lonRad = (lonOffset * Math.PI) / 180;
  const planeX = right
    .clone()
    .multiplyScalar(Math.cos(lonRad))
    .add(forward.clone().multiplyScalar(Math.sin(lonRad)));

  // Trace field line: magnetic colatitude from ~startColatRad to PI - startColatRad
  const points: THREE.Vector3[] = [];
  const steps = CURVE_SEGMENTS;
  const thetaStart = startColatRad;
  const thetaEnd = Math.PI - startColatRad;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const theta = thetaStart + t * (thetaEnd - thetaStart);

    // Dipole formula: r = L * cos^2(theta_m)
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const r = effectiveL * cosTheta * cosTheta;

    // Convert from magnetic polar to 3D cartesian
    // In magnetic frame: along-axis = r*cos(theta), perpendicular = r*sin(theta)
    const axialComponent = up.clone().multiplyScalar(r * cosTheta);
    const radialComponent = planeX.clone().multiplyScalar(r * sinTheta);

    // Earth center offset to put magnetic dipole at center
    const magCenter = magNorth
      .clone()
      .add(magSouth)
      .multiplyScalar(0.5 * GLOBE_RADIUS);
    const point = magCenter.clone().add(axialComponent).add(radialComponent);

    points.push(point);
  }

  return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GeomagneticFieldLines3D = React.memo(
  function GeomagneticFieldLines3D({ kpIndex }: GeomagneticFieldLines3DProps) {
    const particleRefs = useRef<THREE.Mesh[]>([]);
    const kp = clamp(Math.round(kpIndex), 0, 9);

    // Generate all field line curves and tube geometries
    const fieldLines = useMemo(() => {
      const lines: Array<{
        curve: THREE.CatmullRomCurve3;
        geometry: THREE.TubeGeometry;
      }> = [];

      for (const lat of FIELD_LINE_LATITUDES) {
        for (let i = 0; i < LONGITUDE_DIVISIONS; i++) {
          const lonOffset = (360 / LONGITUDE_DIVISIONS) * i;
          const curve = generateFieldLineCurve(lat, lonOffset);

          // Only create geometry if the curve has reasonable extent
          const geometry = new THREE.TubeGeometry(
            curve,
            CURVE_SEGMENTS,
            TUBE_RADIUS,
            TUBE_RADIAL_SEGMENTS,
            false,
          );

          lines.push({ curve, geometry });
        }
      }

      return lines;
    }, []);

    // Material for the tubes
    const tubeMaterial = useMemo(() => {
      const color = getKpColor(kp);
      return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
    }, [kp]);

    // Particle material
    const particleMaterial = useMemo(() => {
      const color = getKpColor(kp);
      return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    }, [kp]);

    // Shared particle geometry
    const particleGeometry = useMemo(
      () => new THREE.SphereGeometry(PARTICLE_RADIUS, 8, 8),
      [],
    );

    // Total particle count
    const totalParticles = fieldLines.length * PARTICLES_PER_LINE;

    // Animate particles along curves
    useFrame(({ clock }) => {
      const t = clock.getElapsedTime();

      for (let lineIdx = 0; lineIdx < fieldLines.length; lineIdx++) {
        const { curve } = fieldLines[lineIdx];

        for (let p = 0; p < PARTICLES_PER_LINE; p++) {
          const particleIdx = lineIdx * PARTICLES_PER_LINE + p;
          const mesh = particleRefs.current[particleIdx];
          if (!mesh) continue;

          // Offset each particle evenly along the curve, advance with time
          const offset = p / PARTICLES_PER_LINE;
          const progress = (t * PARTICLE_SPEED + offset) % 1.0;

          const point = curve.getPointAt(progress);
          mesh.position.copy(point);

          // Pulse particle size slightly
          const pulse = 1.0 + 0.3 * Math.sin(t * 4 + particleIdx * 0.5);
          mesh.scale.setScalar(pulse);
        }
      }
    });

    // Don't render in completely quiet conditions with Kp 0
    // Still render at Kp 0 for visual interest but very subtle
    return (
      <group name="geomagnetic-field-lines">
        {/* Field line tubes */}
        {fieldLines.map((line, i) => (
          <mesh
            key={`tube-${i}`}
            geometry={line.geometry}
            material={tubeMaterial}
          />
        ))}

        {/* Flowing particles */}
        {Array.from({ length: totalParticles }, (_, i) => (
          <mesh
            key={`particle-${i}`}
            ref={(el) => {
              if (el) particleRefs.current[i] = el;
            }}
            geometry={particleGeometry}
            material={particleMaterial}
          />
        ))}
      </group>
    );
  },
);

export default GeomagneticFieldLines3D;

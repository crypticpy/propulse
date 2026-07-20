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

import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { latLonToVector3 } from "@/components/map/lib/globeCoords";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

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

/**
 * Earth's magnetic north pole (approximate 2025 IGRF location).
 * The dipole is modeled as centered at Earth's center with the axis
 * passing through this point; the south pole is its antipode.
 */
const MAG_NORTH_LAT = 80.65;
const MAG_NORTH_LON = -72.68;

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

/**
 * Magnetic latitudes at which field lines emerge from each hemisphere.
 * L = 1/cos²(λ), so these give L-shells of ~1.7, 2.1, 2.6, and 3.6 —
 * nested loops that fit the MAX_FIELD_EXTENT display volume. Auroral
 * latitudes (65°+) map to L-shells of 5.6-33 R and cannot close inside it.
 */
const FIELD_LINE_LATITUDES = [40, 46, 52, 58];

/** Number of longitude divisions per latitude ring */
const LONGITUDE_DIVISIONS = 8;

/** Particle speed (fraction of curve length per second) */
const PARTICLE_SPEED = 0.08;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a value */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Get field line color based on Kp index.
 */
function getKpColor(kp: number): THREE.Color {
  if (kp <= 3) return new THREE.Color("#33dd55"); // quiet green
  if (kp <= 5) return new THREE.Color("#ddcc00"); // yellow
  if (kp <= 7) return new THREE.Color("#ff8800"); // orange
  return new THREE.Color("#ff2222"); // red
}

/**
 * Build the magnetic dipole coordinate frame (cached outside the hot path).
 *
 * Returns three orthonormal vectors:
 *   magUp   – unit vector along the magnetic axis (toward magnetic north)
 *   magRight – perpendicular to magUp (arbitrary but fixed)
 *   magForward – completes the right-handed frame
 */
function buildMagneticFrame() {
  const magUp = latLonToVector3(MAG_NORTH_LAT, MAG_NORTH_LON, 1).normalize();

  // Pick a reference vector that isn't nearly parallel to magUp
  const ref =
    Math.abs(magUp.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);

  const magRight = new THREE.Vector3().crossVectors(magUp, ref).normalize();
  const magForward = new THREE.Vector3()
    .crossVectors(magRight, magUp)
    .normalize();

  return { magUp, magRight, magForward };
}

const MAG_FRAME = buildMagneticFrame();

/**
 * Generate a single dipole field line curve from a starting magnetic latitude.
 *
 * Magnetic dipole equation: r(θ) = L · sin²(θ)
 *   θ = magnetic colatitude (0 at north pole, π at south pole)
 *   L = equatorial crossing distance = R / cos²(λ) = R / sin²(θ₀)
 *       where λ is the magnetic latitude of the footpoint
 * r is clamped to MAX_FIELD_EXTENT so oversized shells flatten against
 * the display boundary instead of leaving the scene.
 *
 * The line is traced from the northern footpoint (colatitude θ_start)
 * symmetrically through the equator to the southern footpoint (π − θ_start).
 * All geometry is centered at the origin (Earth's center).
 */
function generateFieldLineCurve(
  startMagLat: number,
  lonOffset: number,
): THREE.CatmullRomCurve3 {
  const { magUp, magRight, magForward } = MAG_FRAME;

  // Magnetic colatitude of the footpoint
  const startColatRad = ((90 - startMagLat) * Math.PI) / 180;

  // L-shell: equatorial crossing distance, R / sin²(θ₀)
  const sinColat = Math.sin(startColatRad);
  const L = GLOBE_RADIUS / (sinColat * sinColat);

  // Rotate the meridional plane of this line around the magnetic axis
  const lonRad = (lonOffset * Math.PI) / 180;
  const planePerp = magRight
    .clone()
    .multiplyScalar(Math.cos(lonRad))
    .add(magForward.clone().multiplyScalar(Math.sin(lonRad)));

  // Trace from northern footpoint to southern footpoint
  const thetaStart = startColatRad; // north footpoint
  const thetaEnd = Math.PI - startColatRad; // south footpoint
  const steps = CURVE_SEGMENTS;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= steps; i++) {
    const frac = i / steps;
    const theta = thetaStart + frac * (thetaEnd - thetaStart);

    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const r = Math.min(L * sinT * sinT, MAX_FIELD_EXTENT * GLOBE_RADIUS);

    // Decompose into axial (along magUp) and radial (in meridional plane)
    // Polar → Cartesian: axial = r·cos(θ), radial = r·sin(θ)
    const point = magUp
      .clone()
      .multiplyScalar(r * cosT)
      .add(planePerp.clone().multiplyScalar(r * sinT));

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

    // Material for the tubes. Field lines protrude well above the globe
    // (up to 3R), so depth testing against the opaque tile sphere gives
    // correct far-side occlusion for free (see globeRenderOrder.ts rule 1).
    const tubeMaterial = useMemo(() => {
      const color = getKpColor(kp);
      return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
      });
    }, [kp]);

    // Particle material
    const particleMaterial = useMemo(() => {
      const color = getKpColor(kp);
      return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        depthTest: true,
      });
    }, [kp]);

    // Shared particle geometry
    const particleGeometry = useMemo(
      () => new THREE.SphereGeometry(PARTICLE_RADIUS, 8, 8),
      [],
    );

    // Dispose materials when Kp changes and all resources on unmount
    useEffect(() => {
      return () => {
        tubeMaterial.dispose();
        particleMaterial.dispose();
      };
    }, [tubeMaterial, particleMaterial]);

    useEffect(() => {
      return () => {
        fieldLines.forEach((line) => line.geometry.dispose());
        particleGeometry.dispose();
      };
    }, [fieldLines, particleGeometry]);

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
    // renderOrder must sit on each mesh — Three.js does not inherit it
    // from the parent group.
    return (
      <group name="geomagnetic-field-lines">
        {/* Field line tubes */}
        {fieldLines.map((line, i) => (
          <mesh
            key={`tube-${i}`}
            geometry={line.geometry}
            material={tubeMaterial}
            renderOrder={GLOBE_LAYER_ORDER.volumes}
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
            renderOrder={GLOBE_LAYER_ORDER.volumes + 0.1}
          />
        ))}
      </group>
    );
  },
);

export default GeomagneticFieldLines3D;

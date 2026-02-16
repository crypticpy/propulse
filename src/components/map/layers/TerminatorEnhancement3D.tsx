/**
 * TerminatorEnhancement3D
 *
 * Renders a glowing propagation corridor along the solar terminator line.
 * The greyline/terminator zone is well known in amateur radio for enhanced
 * HF propagation, especially on low bands. This overlay adds a warm golden
 * glow along the terminator with flowing particle animation.
 *
 * The band extends ~5 degrees on each side of the terminator path, with
 * opacity proportional to the observed greyline spot activity intensity.
 *
 * Accepts all data as props -- no direct hook imports.
 */

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TerminatorEnhancement3DProps {
  /** Points along the day/night terminator boundary */
  terminatorPoints: Array<{ lat: number; lon: number }>;
  /** Intensity 0-1, based on actual greyline spot activity */
  intensity: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Radius just above globe surface */
const SURFACE_RADIUS = 1.01;

/** Band width in degrees on each side of terminator */
const BAND_WIDTH_DEG = 5;

/** Glow color -- warm golden/orange for propagation enhancement */
const GLOW_COLOR = "#ffaa44";

/** Inner glow color -- brighter center */
const INNER_GLOW_COLOR = "#ffcc66";

/** Number of flowing particles along the terminator */
const NUM_PARTICLES = 30;

/** Particle radius */
const PARTICLE_RADIUS = 0.004;

/** Particle flow speed (fraction of path per second) */
const PARTICLE_SPEED = 0.03;

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
 * Offset a lat/lon point perpendicular to a path direction by a given
 * number of degrees. Simplified: offset in lat/lon by a small delta
 * rotated 90 degrees from the local path tangent.
 */
function offsetPoint(
  lat: number,
  lon: number,
  nextLat: number,
  nextLon: number,
  offsetDeg: number,
): { lat: number; lon: number } {
  // Tangent direction along the path
  const dLat = nextLat - lat;
  const dLon = nextLon - lon;
  const len = Math.sqrt(dLat * dLat + dLon * dLon) || 1;

  // Perpendicular direction (rotate 90 degrees)
  const perpLat = -dLon / len;
  const perpLon = dLat / len;

  return {
    lat: lat + perpLat * offsetDeg,
    lon: lon + perpLon * offsetDeg,
  };
}

/**
 * Build a band mesh geometry from inner and outer point arrays on the globe.
 */
function createBandGeometry(
  points: Array<{ lat: number; lon: number }>,
  widthDeg: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const numPoints = points.length;

  if (numPoints < 2) return new THREE.BufferGeometry();

  for (let i = 0; i < numPoints; i++) {
    const curr = points[i];
    const next = points[(i + 1) % numPoints];

    // Inner edge (toward day side)
    const inner = offsetPoint(
      curr.lat,
      curr.lon,
      next.lat,
      next.lon,
      -widthDeg,
    );
    const innerVec = latLonToVector3(inner.lat, inner.lon, SURFACE_RADIUS);

    // Outer edge (toward night side)
    const outer = offsetPoint(curr.lat, curr.lon, next.lat, next.lon, widthDeg);
    const outerVec = latLonToVector3(outer.lat, outer.lon, SURFACE_RADIUS);

    positions.push(innerVec.x, innerVec.y, innerVec.z);
    positions.push(outerVec.x, outerVec.y, outerVec.z);
  }

  // Create triangles connecting inner and outer rings
  for (let i = 0; i < numPoints; i++) {
    const nextI = (i + 1) % numPoints;
    const innerIdx = i * 2;
    const outerIdx = i * 2 + 1;
    const nextInnerIdx = nextI * 2;
    const nextOuterIdx = nextI * 2 + 1;

    indices.push(innerIdx, outerIdx, nextInnerIdx);
    indices.push(nextInnerIdx, outerIdx, nextOuterIdx);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TerminatorEnhancement3D = React.memo(
  function TerminatorEnhancement3D({
    terminatorPoints,
    intensity,
  }: TerminatorEnhancement3DProps) {
    const bandMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
    const innerBandMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
    const particleRefs = useRef<THREE.Mesh[]>([]);
    const hasRenderableData = terminatorPoints.length >= 2 && intensity > 0;

    // Build the band geometry
    const bandGeometry = useMemo(
      () => createBandGeometry(terminatorPoints, BAND_WIDTH_DEG),
      [terminatorPoints],
    );

    // Narrower inner band for brighter center
    const innerBandGeometry = useMemo(
      () => createBandGeometry(terminatorPoints, BAND_WIDTH_DEG * 0.4),
      [terminatorPoints],
    );

    // Build the curve path along the terminator for particle animation
    const terminatorCurve = useMemo<THREE.CatmullRomCurve3 | null>(() => {
      if (!hasRenderableData) return null;
      const curvePoints = terminatorPoints.map((p) =>
        latLonToVector3(p.lat, p.lon, SURFACE_RADIUS + 0.005),
      );
      return new THREE.CatmullRomCurve3(curvePoints, true, "catmullrom", 0.5);
    }, [hasRenderableData, terminatorPoints]);

    // Particle geometry and material
    const particleGeometry = useMemo(
      () => new THREE.SphereGeometry(PARTICLE_RADIUS, 6, 6),
      [],
    );

    const particleMaterial = useMemo(
      () =>
        new THREE.MeshBasicMaterial({
          color: INNER_GLOW_COLOR,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      [],
    );

    // Animation: pulse opacity and advance particles
    useFrame(({ clock }) => {
      if (!hasRenderableData || !terminatorCurve) return;

      const t = clock.getElapsedTime();

      // Pulsing glow on the band
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.5);
      const baseOpacity = intensity * 0.25 * pulse;

      if (bandMaterialRef.current) {
        bandMaterialRef.current.opacity = baseOpacity;
      }
      if (innerBandMaterialRef.current) {
        innerBandMaterialRef.current.opacity = baseOpacity * 1.8;
      }

      // Advance particles along the terminator curve
      for (let i = 0; i < NUM_PARTICLES; i++) {
        const mesh = particleRefs.current[i];
        if (!mesh) continue;

        const offset = i / NUM_PARTICLES;
        const progress = (t * PARTICLE_SPEED + offset) % 1.0;
        const point = terminatorCurve.getPointAt(progress);
        mesh.position.copy(point);

        // Vary particle opacity with intensity and a per-particle phase
        const particlePulse = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.2);
        mesh.scale.setScalar(0.8 + 0.4 * particlePulse);
      }
    });

    // Early exit if no data or zero intensity
    if (!hasRenderableData) {
      return null;
    }

    return (
      <group name="terminator-enhancement">
        {/* Outer glow band */}
        <mesh geometry={bandGeometry}>
          <meshBasicMaterial
            ref={bandMaterialRef}
            color={GLOW_COLOR}
            transparent
            opacity={intensity * 0.25}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Inner brighter band */}
        <mesh geometry={innerBandGeometry}>
          <meshBasicMaterial
            ref={innerBandMaterialRef}
            color={INNER_GLOW_COLOR}
            transparent
            opacity={intensity * 0.4}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Flowing particles along terminator */}
        {Array.from({ length: NUM_PARTICLES }, (_, i) => (
          <mesh
            key={`term-particle-${i}`}
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

export default TerminatorEnhancement3D;

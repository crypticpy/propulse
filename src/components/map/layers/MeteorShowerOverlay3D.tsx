/**
 * MeteorShowerOverlay3D
 *
 * Renders active meteor shower radiant points and scatter zones on the 3D globe.
 * Each shower is shown as:
 * - A starburst point at the radiant position (line segments radiating outward)
 * - A translucent scatter-zone ring on the globe surface
 * - Drifting particles animated outward from the radiant
 * - A label with shower name, ZHR, and peak timing
 *
 * 6m-favorable showers are colored bright green; others are purple/magenta.
 * Brightness and size scale proportionally to ZHR (Perseids ZHR=100 = largest).
 *
 * Accepts all data as props -- no direct hook imports.
 */

import React, { useEffect, useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  latLonToVector3,
  getUpDirection,
} from "@/components/map/lib/globeCoords";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MeteorShowerData {
  /** Shower name (e.g. "Perseids") */
  name: string;
  /** Radiant position latitude on globe */
  lat: number;
  /** Radiant position longitude on globe */
  lon: number;
  /** Zenithal hourly rate (higher = more intense) */
  zhr: number;
  /** Whether this shower is favorable for 6m meteor scatter */
  bestFor6m: boolean;
  /** Days until peak (0 = today is peak) */
  daysUntilPeak: number;
}

interface MeteorShowerOverlay3DProps {
  showers: MeteorShowerData[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Surface placement radius */
const SURFACE_RADIUS = 1.01;

/** Color for 6m-favorable showers */
const COLOR_6M = "#00ff66";

/** Color for non-6m showers */
const COLOR_DEFAULT = "#cc44ff";

/** Number of starburst spokes */
const SPOKE_COUNT = 6;

/** Number of drifting particles per shower */
const PARTICLE_COUNT = 3;

/** Max ZHR for scaling (Perseids ~100) */
const ZHR_SCALE_MAX = 120;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Scale ZHR to a visual size factor (0.5 to 1.5).
 */
function zhrToScale(zhr: number): number {
  return 0.5 + (Math.min(zhr, ZHR_SCALE_MAX) / ZHR_SCALE_MAX) * 1.0;
}

/**
 * Format peak timing for label display.
 */
function formatPeakLabel(daysUntilPeak: number): string {
  if (daysUntilPeak <= 0) return "PEAK NOW";
  if (daysUntilPeak === 1) return "Peak tomorrow";
  return `Peak in ${daysUntilPeak}d`;
}

// ---------------------------------------------------------------------------
// Starburst geometry builder
// ---------------------------------------------------------------------------

/**
 * Create a starburst line geometry (spokes radiating from center).
 * Returns positions as a Float32Array for a BufferGeometry (GL_LINES).
 */
function createStarburstPositions(spokeLength: number): Float32Array {
  const positions = new Float32Array(SPOKE_COUNT * 2 * 3);

  for (let i = 0; i < SPOKE_COUNT; i++) {
    const angle = (i / SPOKE_COUNT) * Math.PI * 2;
    const idx = i * 6;

    // Center point
    positions[idx] = 0;
    positions[idx + 1] = 0;
    positions[idx + 2] = 0;

    // Endpoint
    positions[idx + 3] = Math.cos(angle) * spokeLength;
    positions[idx + 4] = Math.sin(angle) * spokeLength;
    positions[idx + 5] = 0;
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Sub-component: Single meteor shower
// ---------------------------------------------------------------------------

interface ShowerMarkerProps {
  shower: MeteorShowerData;
  starburstGeo: THREE.BufferGeometry;
  scatterGeo: THREE.RingGeometry;
  particleGeo: THREE.SphereGeometry;
  particleRefs: React.MutableRefObject<(THREE.Mesh | null)[]>;
  particleBaseIndex: number;
}

function ShowerMarker({
  shower,
  starburstGeo,
  scatterGeo,
  particleGeo,
  particleRefs,
  particleBaseIndex,
}: ShowerMarkerProps) {
  const color = shower.bestFor6m ? COLOR_6M : COLOR_DEFAULT;
  const scale = zhrToScale(shower.zhr);
  const position = latLonToVector3(shower.lat, shower.lon, SURFACE_RADIUS);

  // Quaternion to orient flat features (starburst, scatter ring) on the surface
  const surfaceQuaternion = useMemo(() => {
    const normal = getUpDirection(shower.lat, shower.lon);
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    return q;
  }, [shower.lat, shower.lon]);

  // Scatter zone size: scales with ZHR, capped for aesthetics
  const scatterScale = 0.06 + (scale - 0.5) * 0.08;

  return (
    <group>
      {/* Scatter zone ring on globe surface */}
      <mesh
        position={position}
        quaternion={surfaceQuaternion}
        geometry={scatterGeo}
        scale={[scatterScale, scatterScale, 1]}
        renderOrder={6}
      >
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2 * scale}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </mesh>

      {/* Starburst at radiant point */}
      <lineSegments
        position={position}
        quaternion={surfaceQuaternion}
        geometry={starburstGeo}
        scale={[scale, scale, scale]}
        renderOrder={8}
      >
        <lineBasicMaterial
          color={color}
          transparent
          opacity={0.9}
          depthTest={false}
          depthWrite={false}
        />
      </lineSegments>

      {/* Central glow sphere */}
      <mesh position={position} renderOrder={7}>
        <sphereGeometry args={[0.005 * scale, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Drifting particles (positioned via useFrame from parent) */}
      {Array.from({ length: PARTICLE_COUNT }).map((_, pi) => (
        <mesh
          key={pi}
          ref={(el: THREE.Mesh | null) => {
            particleRefs.current[particleBaseIndex + pi] = el;
          }}
          geometry={particleGeo}
          renderOrder={7}
        >
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Label: shower name + ZHR / peak info */}
      <Html
        position={latLonToVector3(
          shower.lat,
          shower.lon,
          SURFACE_RADIUS + 0.025 * scale,
        )}
        center
        zIndexRange={[1, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div className="flex flex-col items-center gap-0">
          <div
            className="px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.88)",
              color,
              border: `1px solid ${color}50`,
              boxShadow: `0 0 6px ${color}40`,
            }}
          >
            {shower.name}
          </div>
          <div
            className="px-1 py-0.5 text-[8px] font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.75)",
              color,
              borderRadius: "0 0 4px 4px",
            }}
          >
            ZHR: {shower.zhr} &middot; {formatPeakLabel(shower.daysUntilPeak)}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MeteorShowerOverlay3D = React.memo(function MeteorShowerOverlay3D({
  showers,
}: MeteorShowerOverlay3DProps) {
  // Refs for all drifting particles (PARTICLE_COUNT per shower)
  const particleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const hasShowers = showers.length > 0;

  // Shared geometries
  const starburstGeo = useMemo(() => {
    const positions = createStarburstPositions(0.015);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    return geo;
  }, []);

  const scatterGeo = useMemo(() => new THREE.RingGeometry(0.5, 1, 48), []);

  const particleGeo = useMemo(() => new THREE.SphereGeometry(0.002, 6, 6), []);

  useEffect(() => {
    return () => {
      starburstGeo.dispose();
      scatterGeo.dispose();
      particleGeo.dispose();
    };
  }, [starburstGeo, scatterGeo, particleGeo]);

  // Ensure particle refs array has correct length
  const totalParticles = showers.length * PARTICLE_COUNT;
  particleRefs.current.length = totalParticles;

  // Pre-compute shower positions and tangent planes for particle drift
  const showerData = useMemo(() => {
    return showers.map((s) => {
      const center = latLonToVector3(s.lat, s.lon, SURFACE_RADIUS);
      const normal = getUpDirection(s.lat, s.lon);

      // Build a tangent plane basis for particle drift
      const tangent = new THREE.Vector3();
      if (Math.abs(normal.y) < 0.99) {
        tangent.crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize();
      } else {
        tangent.crossVectors(new THREE.Vector3(1, 0, 0), normal).normalize();
      }
      const bitangent = new THREE.Vector3()
        .crossVectors(normal, tangent)
        .normalize();

      return { center, normal, tangent, bitangent, scale: zhrToScale(s.zhr) };
    });
  }, [showers]);

  // Single useFrame: animate all drifting particles across all showers
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    for (let si = 0; si < showers.length; si++) {
      const { center, tangent, bitangent, scale } = showerData[si];
      const baseIdx = si * PARTICLE_COUNT;

      for (let pi = 0; pi < PARTICLE_COUNT; pi++) {
        const mesh = particleRefs.current[baseIdx + pi];
        if (!mesh) continue;

        // Each particle drifts outward from center in a unique direction
        const angle = (pi / PARTICLE_COUNT) * Math.PI * 2 + t * 0.3 + si * 1.7;
        const drift = ((t * 0.4 + pi * 1.3 + si * 0.9) % 2.0) / 2.0; // 0 to 1 cycle

        const driftDist = drift * 0.04 * scale;
        const dx = Math.cos(angle) * driftDist;
        const dy = Math.sin(angle) * driftDist;

        mesh.position.set(
          center.x + tangent.x * dx + bitangent.x * dy,
          center.y + tangent.y * dx + bitangent.y * dy,
          center.z + tangent.z * dx + bitangent.z * dy,
        );

        // Fade out as particle drifts away
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = (1.0 - drift) * 0.5;

        // Scale down as it drifts
        const particleScale = (1.0 - drift * 0.6) * scale;
        mesh.scale.setScalar(particleScale);
      }
    }
  });

  if (!hasShowers) return null;

  return (
    <group>
      {showers.map((shower, i) => (
        <ShowerMarker
          key={shower.name}
          shower={shower}
          starburstGeo={starburstGeo}
          scatterGeo={scatterGeo}
          particleGeo={particleGeo}
          particleRefs={particleRefs}
          particleBaseIndex={i * PARTICLE_COUNT}
        />
      ))}
    </group>
  );
});

export default MeteorShowerOverlay3D;

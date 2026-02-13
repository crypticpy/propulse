/**
 * ReflectionMarker Component
 *
 * Renders small marker spheres at ionospheric reflection points and ground
 * bounce points along a multi-hop ray path. Reflection markers sit at the
 * apex of each hop with a subtle glow; ground markers sit on the surface.
 *
 * Low-quality hops (score < 35) pulse to draw attention to weak links.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReflectionMarkerProps {
  /** Latitude of marker position */
  lat: number;
  /** Longitude of marker position */
  lon: number;
  /** Radius from globe center (1.0 = surface) */
  radius: number;
  /** Marker color */
  color: string;
  /** "reflection" = ionosphere bounce, "ground" = surface bounce */
  type: "reflection" | "ground";
  /** Optional quality score (0-100) — low values trigger pulsing */
  qualityScore?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFLECTION_SPHERE_RADIUS = 0.008;
const GROUND_SPHERE_RADIUS = 0.005;
const GLOW_SCALE = 2.2;
const PULSE_SPEED = 3.5;
const PULSE_THRESHOLD = 35;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latLonTo3D(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReflectionMarker({
  lat,
  lon,
  radius,
  color,
  type,
  qualityScore,
}: ReflectionMarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  const shouldPulse =
    qualityScore !== undefined && qualityScore < PULSE_THRESHOLD;

  const position = useMemo(
    () => latLonTo3D(lat, lon, radius),
    [lat, lon, radius],
  );

  const sphereRadius =
    type === "reflection" ? REFLECTION_SPHERE_RADIUS : GROUND_SPHERE_RADIUS;

  // Animate pulsing for low-quality markers
  useFrame(({ clock }) => {
    if (!shouldPulse) return;

    const pulse = Math.sin(clock.elapsedTime * PULSE_SPEED) * 0.3 + 0.7;

    if (materialRef.current) {
      materialRef.current.opacity = pulse;
    }
    if (meshRef.current) {
      const s = 1 + (1 - pulse) * 0.4;
      meshRef.current.scale.setScalar(s);
    }
    if (glowMaterialRef.current) {
      glowMaterialRef.current.opacity = pulse * 0.2;
    }
  });

  // Validate coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return (
    <group>
      {/* Core sphere */}
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[sphereRadius, 12, 12]} />
        <meshBasicMaterial
          ref={materialRef}
          color={color}
          transparent
          opacity={type === "reflection" ? 0.9 : 0.7}
          depthWrite={false}
        />
      </mesh>

      {/* Outer glow — reflection markers only */}
      {type === "reflection" && (
        <mesh ref={glowRef} position={position}>
          <sphereGeometry args={[sphereRadius * GLOW_SCALE, 12, 12]} />
          <meshBasicMaterial
            ref={glowMaterialRef}
            color={color}
            transparent
            opacity={0.18}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

ReflectionMarker.displayName = "ReflectionMarker";

export default ReflectionMarker;

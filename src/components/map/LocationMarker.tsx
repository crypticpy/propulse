/**
 * LocationMarker Component
 *
 * Renders a marker on the globe at a specific lat/lon position.
 * Used for home station and target location markers.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

interface LocationMarkerProps {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Marker color */
  color?: string;
  /** Optional label text */
  label?: string;
  /** Marker type for styling */
  type?: "home" | "target";
}

/**
 * Convert lat/lon to 3D position on sphere
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

export function LocationMarker({
  lat,
  lon,
  color = "#ff6b35",
  label,
  type = "target",
}: LocationMarkerProps) {
  const markerRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  // Calculate 3D position
  const position = useMemo(() => {
    return latLonToVector3(lat, lon, 1.01);
  }, [lat, lon]);

  // Pulse animation for target markers
  useFrame(({ clock }) => {
    if (pulseRef.current && type === "target") {
      const scale = 1 + Math.sin(clock.elapsedTime * 3) * 0.3;
      pulseRef.current.scale.set(scale, scale, scale);
    }
  });

  const markerSize = type === "home" ? 0.02 : 0.025;
  const pulseSize = markerSize * 2;

  return (
    <group position={position}>
      {/* Pulse ring for target markers */}
      {type === "target" && (
        <mesh ref={pulseRef}>
          <ringGeometry args={[pulseSize * 0.8, pulseSize, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Main marker dot */}
      <mesh ref={markerRef}>
        <sphereGeometry args={[markerSize, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>

      {/* Label */}
      {label && (
        <Html
          position={[0, markerSize * 3, 0]}
          center
          style={{
            pointerEvents: "none",
          }}
        >
          <div
            className="px-2 py-0.5 rounded text-xs font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.9)",
              color: color,
              border: `1px solid ${color}`,
              boxShadow: `0 0 10px ${color}40`,
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

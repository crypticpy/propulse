/**
 * SpotMarker Component
 *
 * Renders a clickable marker on the 3D globe at a specific lat/lon position.
 * Features include glow effects, optional labels, and click/hover interactions.
 */

import { useRef, useMemo, useState, useCallback } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

/** Default marker color - plasma orange */
const DEFAULT_COLOR = "#FF6B35";

/** Default marker size */
const DEFAULT_SIZE = 0.02;

/** Radius offset to prevent z-fighting with globe surface */
const SURFACE_OFFSET = 1.02;

export interface SpotMarkerProps {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Marker color */
  color?: string;
  /** Marker size */
  size?: number;
  /** Optional label text */
  label?: string;
  /** Glow intensity (0-1) */
  glowIntensity?: number;
  /** Click handler */
  onClick?: (lat: number, lon: number) => void;
  /** Hover handler */
  onHover?: (isHovered: boolean, position: { x: number; y: number }) => void;
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

/**
 * Get screen position from native mouse/pointer event
 * Uses clientX/clientY which are viewport-relative coordinates
 */
function getScreenPositionFromEvent(
  event: ThreeEvent<MouseEvent | PointerEvent>,
): { x: number; y: number } {
  const nativeEvent = event.nativeEvent;
  return {
    x: nativeEvent.clientX,
    y: nativeEvent.clientY,
  };
}

/**
 * SpotMarker renders a clickable marker on the globe surface
 *
 * @example
 * ```tsx
 * <SpotMarker
 *   lat={40.7128}
 *   lon={-74.006}
 *   label="NYC"
 *   color="#00FF88"
 *   onClick={(lat, lon) => console.log('Clicked:', lat, lon)}
 * />
 * ```
 */
export function SpotMarker({
  lat,
  lon,
  color = DEFAULT_COLOR,
  size = DEFAULT_SIZE,
  label,
  glowIntensity = 0.5,
  onClick,
  onHover,
}: SpotMarkerProps) {
  const markerRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  const [isHovered, setIsHovered] = useState(false);

  // Calculate 3D position
  const position = useMemo(() => {
    return latLonToVector3(lat, lon, SURFACE_OFFSET);
  }, [lat, lon]);

  // Handle click event
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onClick?.(lat, lon);
    },
    [lat, lon, onClick],
  );

  // Handle pointer enter - use native event for screen position
  const handlePointerEnter = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setIsHovered(true);

      if (onHover) {
        const screenPos = getScreenPositionFromEvent(event);
        onHover(true, screenPos);
      }
    },
    [onHover],
  );

  // Handle pointer leave
  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    onHover?.(false, { x: 0, y: 0 });
  }, [onHover]);

  // Animate glow effect
  useFrame(({ clock }) => {
    if (glowRef.current && materialRef.current) {
      // Pulsing glow effect
      const time = clock.elapsedTime * 2;
      const pulse = 0.5 + Math.sin(time) * 0.3;
      const baseOpacity = glowIntensity * pulse;

      materialRef.current.opacity = isHovered ? baseOpacity * 1.5 : baseOpacity;

      // Scale glow when hovered
      const glowScale = isHovered ? 1.5 : 1;
      glowRef.current.scale.setScalar(glowScale);
    }
  });

  const glowSize = size * 2;

  return (
    <group position={position}>
      {/* Glow sprite behind marker */}
      <mesh ref={glowRef} renderOrder={0}>
        <circleGeometry args={[glowSize, 32]} />
        <meshBasicMaterial
          ref={materialRef}
          color={color}
          transparent
          opacity={glowIntensity * 0.5}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Main marker sphere */}
      <mesh
        ref={markerRef}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        renderOrder={1}
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isHovered ? 1 : 0.9}
          depthTest={false}
        />
      </mesh>

      {/* Emissive ring for additional glow effect */}
      <mesh renderOrder={0}>
        <ringGeometry args={[size * 1.2, size * 1.5, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isHovered ? 0.6 : 0.3}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Optional label using Html overlay */}
      {label && (
        <Html
          position={[0, size * 3, 0]}
          center
          style={{
            pointerEvents: "none",
            transition: "opacity 0.2s ease",
            opacity: isHovered ? 1 : 0.8,
          }}
        >
          <div
            className="px-2 py-0.5 rounded text-xs font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.9)",
              color: color,
              border: `1px solid ${color}`,
              boxShadow: `0 0 ${isHovered ? "15px" : "10px"} ${color}40`,
              transform: isHovered ? "scale(1.1)" : "scale(1)",
              transition: "all 0.2s ease",
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

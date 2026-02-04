/**
 * PinMarker Component
 *
 * Renders a distinctive pushpin-style marker on the 3D globe for user pins.
 * The pin appears stuck into the globe surface, pointing straight up in world space,
 * with a prominent glow halo surrounding it for visibility from any distance.
 */

import { useRef, useMemo, useState, useCallback } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

/** Default pin color - cyan to match app theme */
const DEFAULT_COLOR = "#22D3EE";

/** Default pin size */
const DEFAULT_SIZE = 0.025;

/** Globe radius (unit sphere) */
const GLOBE_RADIUS = 1.0;

/** How much of the pin stem is embedded in the globe */
const EMBED_DEPTH = 0.015;

/** Total height of the pin needle above the surface */
const NEEDLE_HEIGHT = 0.08;

/** Size of the glow halo (multiplier of pin size) */
const HALO_SIZE_MULTIPLIER = 3;

export interface PinMarkerProps {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Pin color */
  color?: string;
  /** Pin size */
  size?: number;
  /** Optional label text */
  label?: string;
  /** Category emoji to display on pin */
  emoji?: string;
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
 * Get the surface normal at a given lat/lon
 */
function getSurfaceNormal(lat: number, lon: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize();
}

/**
 * Get screen position from native mouse/pointer event
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
 * PinMarker renders a pushpin stuck into the globe surface
 */
export function PinMarker({
  lat,
  lon,
  color = DEFAULT_COLOR,
  size = DEFAULT_SIZE,
  label,
  emoji = "📍",
  onClick,
  onHover,
}: PinMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Surface position (where pin enters the globe)
  const surfacePosition = useMemo(() => {
    return latLonToVector3(lat, lon, GLOBE_RADIUS);
  }, [lat, lon]);

  // Surface normal for positioning the glow flat on the surface
  const surfaceNormal = useMemo(() => {
    return getSurfaceNormal(lat, lon);
  }, [lat, lon]);

  // Calculate rotation to make glow lie flat on surface
  const glowRotation = useMemo(() => {
    const quaternion = new THREE.Quaternion();
    const defaultUp = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(defaultUp, surfaceNormal);
    return new THREE.Euler().setFromQuaternion(quaternion);
  }, [surfaceNormal]);

  // Handle click event
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onClick?.(lat, lon);
    },
    [lat, lon, onClick],
  );

  // Handle pointer enter
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

  // Animate glow pulsing
  useFrame(({ clock }) => {
    if (glowRef.current) {
      const time = clock.elapsedTime * 2;
      const pulse = 0.6 + Math.sin(time) * 0.2;
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = isHovered ? pulse * 1.3 : pulse * 0.8;
    }
  });

  // Pin needle geometry (thin cylinder pointing up in world Y)
  const needleGeometry = useMemo(() => {
    // Create a cylinder for the needle
    return new THREE.CylinderGeometry(
      size * 0.08, // top radius (pointed)
      size * 0.15, // bottom radius
      NEEDLE_HEIGHT + EMBED_DEPTH,
      8,
    );
  }, [size]);

  // Pin head geometry (sphere at top)
  const headGeometry = useMemo(() => {
    return new THREE.SphereGeometry(size * 0.6, 16, 16);
  }, [size]);

  // Halo size
  const haloSize = size * HALO_SIZE_MULTIPLIER;

  return (
    <group ref={groupRef}>
      {/* Glow halo - lies flat on the globe surface */}
      <group position={surfacePosition} rotation={glowRotation}>
        {/* Outer glow ring */}
        <mesh ref={glowRef} position={[0, 0.002, 0]} renderOrder={0}>
          <ringGeometry args={[haloSize * 0.3, haloSize, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>

        {/* Inner glow circle */}
        <mesh position={[0, 0.003, 0]} renderOrder={0}>
          <circleGeometry args={[haloSize * 0.4, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={isHovered ? 0.4 : 0.25}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>

        {/* Bright center point */}
        <mesh position={[0, 0.004, 0]} renderOrder={1}>
          <circleGeometry args={[size * 0.5, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={isHovered ? 0.9 : 0.7}
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>
      </group>

      {/* Pin needle - points straight up in world space (Y axis) */}
      <mesh
        position={[
          surfacePosition.x,
          surfacePosition.y + NEEDLE_HEIGHT / 2 - EMBED_DEPTH / 2,
          surfacePosition.z,
        ]}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        renderOrder={2}
      >
        <primitive object={needleGeometry} attach="geometry" />
        <meshBasicMaterial
          color={isHovered ? "#FFFFFF" : color}
          transparent
          opacity={0.95}
          depthTest={false}
        />
      </mesh>

      {/* Pin head (colored sphere at top) */}
      <mesh
        position={[
          surfacePosition.x,
          surfacePosition.y + NEEDLE_HEIGHT - EMBED_DEPTH + size * 0.6,
          surfacePosition.z,
        ]}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        renderOrder={3}
      >
        <primitive object={headGeometry} attach="geometry" />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isHovered ? 1 : 0.95}
          depthTest={false}
        />
      </mesh>

      {/* Emoji above the pin head */}
      <Html
        position={[
          surfacePosition.x,
          surfacePosition.y + NEEDLE_HEIGHT + size * 1.5,
          surfacePosition.z,
        ]}
        center
        style={{
          pointerEvents: "none",
          transition: "all 0.2s ease",
          transform: isHovered ? "scale(1.3)" : "scale(1)",
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: "28px",
            height: "28px",
            fontSize: "18px",
            filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color}50)`,
          }}
        >
          {emoji}
        </div>
      </Html>

      {/* Label text */}
      {label && (
        <Html
          position={[
            surfacePosition.x,
            surfacePosition.y + NEEDLE_HEIGHT + size * 3,
            surfacePosition.z,
          ]}
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
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

PinMarker.displayName = "PinMarker";

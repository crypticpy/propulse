/**
 * PinMarker Component
 *
 * Renders a distinctive pushpin-style marker on the 3D globe for user pins.
 * Visually distinct from SpotMarker (used for DX spots) with:
 * - Teardrop/pin shape with vertical stem
 * - Category emoji display
 * - Unique animation (gentle bob instead of pulse)
 * - Globe occlusion (fades on far side of globe)
 */

import { useRef, useMemo, useState, useCallback, useEffect } from "react";
import { useFrame, ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useGlobeOcclusion } from "@/hooks/useGlobeOcclusion";

/** Default pin color - cyan to match app theme */
const DEFAULT_COLOR = "#22D3EE";

/** Default pin size */
const DEFAULT_SIZE = 0.025;

/** Radius offset to prevent z-fighting with globe surface */
const SURFACE_OFFSET = 1.02;

/** Height of the pin stem above the globe surface */
const STEM_HEIGHT = 0.06;

export interface PinMarkerProps {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Unique pin identifier */
  pinId?: string;
  /** Pin color */
  color?: string;
  /** Pin size */
  size?: number;
  /** Overall size scale multiplier (default 1.0) */
  sizeScale?: number;
  /** Optional label text */
  label?: string;
  /** Category emoji to display on pin */
  emoji?: string;
  /** Click handler */
  onClick?: (lat: number, lon: number) => void;
  /** Hover handler */
  onHover?: (
    isHovered: boolean,
    position: { x: number; y: number },
    pinId?: string,
  ) => void;
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
 * Get the "up" direction at a given lat/lon (normal to the sphere surface)
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
 * Get screen position from native mouse/pointer event
 */
function getScreenPositionFromEvent(
  event: ThreeEvent<MouseEvent | PointerEvent>,
): { x: number; y: number } {
  const { nativeEvent } = event;
  return {
    x: nativeEvent.clientX,
    y: nativeEvent.clientY,
  };
}

/**
 * PinMarker renders a distinctive pushpin marker on the globe surface
 */
export function PinMarker({
  lat,
  lon,
  pinId,
  color = DEFAULT_COLOR,
  size: rawSize = DEFAULT_SIZE,
  sizeScale = 1.0,
  label,
  emoji = "\uD83D\uDCCD",
  onClick,
  onHover,
}: PinMarkerProps) {
  const size = rawSize * sizeScale;
  const groupRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const stemMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const headMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowRingMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const shadowCircleMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Globe occlusion - fade out pins on the far side
  const { opacityRef: occlusionRef, opacity: occlusionOpacity } =
    useGlobeOcclusion(lat, lon);

  // Calculate base position on globe surface
  const basePosition = useMemo(() => {
    return latLonToVector3(lat, lon, SURFACE_OFFSET);
  }, [lat, lon]);

  // Calculate up direction for orienting the pin
  const upDirection = useMemo(() => {
    return getUpDirection(lat, lon);
  }, [lat, lon]);

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
        onHover(true, screenPos, pinId);
      }
    },
    [onHover, pinId],
  );

  // Handle pointer leave
  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    onHover?.(false, { x: 0, y: 0 }, pinId);
  }, [onHover, pinId]);

  // Animate pin (gentle bobbing motion) and apply globe occlusion
  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Gentle bob animation
      const time = clock.elapsedTime * 1.5;
      const bobOffset = Math.sin(time) * 0.003;

      // Apply bob along the up direction (reuse pre-allocated vector)
      tempBobVec.copy(upDirection).multiplyScalar(bobOffset);
      groupRef.current.position.copy(basePosition).add(tempBobVec);

      // Scale up slightly when hovered (reuse pre-allocated vector)
      const targetScale = isHovered ? 1.2 : 1;
      tempScaleVec.set(targetScale, targetScale, targetScale);
      groupRef.current.scale.lerp(tempScaleVec, 0.1);
    }

    // Apply globe occlusion to all materials
    const occlusion = occlusionRef.current;

    if (stemMaterialRef.current) {
      stemMaterialRef.current.opacity = 0.8 * occlusion;
    }

    if (headMaterialRef.current) {
      headMaterialRef.current.opacity = (isHovered ? 1 : 0.9) * occlusion;
    }

    if (glowRingMaterialRef.current) {
      glowRingMaterialRef.current.opacity = (isHovered ? 0.5 : 0.3) * occlusion;
    }

    if (shadowCircleMaterialRef.current) {
      shadowCircleMaterialRef.current.opacity = 0.3 * occlusion;
    }
  });

  // Pre-allocate reusable vectors to avoid per-frame GC pressure
  const tempBobVec = useMemo(() => new THREE.Vector3(), []);
  const tempScaleVec = useMemo(() => new THREE.Vector3(), []);

  // Create pin head geometry (inverted cone/teardrop pointing down)
  const headGeometry = useMemo(() => {
    const geo = new THREE.ConeGeometry(size, size * 1.5, 16);
    // Rotate so point faces outward from globe (along up direction)
    geo.rotateX(Math.PI); // Point outward
    return geo;
  }, [size]);

  // Create stem geometry
  const stemGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(size * 0.15, size * 0.15, STEM_HEIGHT, 8);
  }, [size]);

  // Dispose geometries on unmount to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      headGeometry.dispose();
      stemGeometry.dispose();
    };
  }, [headGeometry, stemGeometry]);

  // Calculate rotation to align pin with surface normal
  const rotation = useMemo(() => {
    const quaternion = new THREE.Quaternion();
    const defaultUp = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(defaultUp, upDirection);
    return new THREE.Euler().setFromQuaternion(quaternion);
  }, [upDirection]);

  return (
    <group ref={groupRef} position={basePosition} rotation={rotation}>
      {/* Pin stem (vertical line from surface) */}
      <mesh position={[0, STEM_HEIGHT / 2, 0]} renderOrder={1}>
        <primitive object={stemGeometry} attach="geometry" />
        <meshBasicMaterial
          ref={stemMaterialRef}
          color={color}
          transparent
          opacity={0.8}
          depthTest={false}
        />
      </mesh>

      {/* Pin head (teardrop/cone shape) */}
      <mesh
        ref={headRef}
        position={[0, STEM_HEIGHT + size * 0.75, 0]}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        renderOrder={2}
      >
        <primitive object={headGeometry} attach="geometry" />
        <meshBasicMaterial
          ref={headMaterialRef}
          color={color}
          transparent
          opacity={isHovered ? 1 : 0.9}
          depthTest={false}
        />
      </mesh>

      {/* Glow ring at base */}
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={0}>
        <ringGeometry args={[size * 0.8, size * 1.2, 32]} />
        <meshBasicMaterial
          ref={glowRingMaterialRef}
          color={color}
          transparent
          opacity={isHovered ? 0.5 : 0.3}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Shadow/ground indicator circle */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        renderOrder={0}
      >
        <circleGeometry args={[size * 0.6, 16]} />
        <meshBasicMaterial
          ref={shadowCircleMaterialRef}
          color="#000000"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Emoji label using Html overlay */}
      <Html
        position={[0, STEM_HEIGHT + size * 2, 0]}
        center
        zIndexRange={[1, 0]}
        style={{
          pointerEvents: "none",
          transition: "all 0.2s ease",
          transform: isHovered ? "scale(1.2)" : "scale(1)",
          opacity: occlusionOpacity,
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: "24px",
            height: "24px",
            fontSize: "16px",
            filter: `drop-shadow(0 0 4px ${color})`,
          }}
        >
          {emoji}
        </div>
      </Html>

      {/* Label text (shown below emoji when hovered or always if provided) */}
      {label && (
        <Html
          position={[0, STEM_HEIGHT + size * 3.5, 0]}
          center
          zIndexRange={[1, 0]}
          style={{
            pointerEvents: "none",
            transition: "opacity 0.2s ease",
            opacity: (isHovered ? 1 : 0.7) * occlusionOpacity,
          }}
        >
          <div
            className="px-2 py-0.5 rounded text-xs font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.9)",
              color: color,
              border: `1px solid ${color}`,
              boxShadow: `0 0 ${isHovered ? "15px" : "8px"} ${color}40`,
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

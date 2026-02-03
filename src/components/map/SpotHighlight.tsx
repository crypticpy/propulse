/**
 * SpotHighlight Component
 *
 * Renders a pulsing ring/glow effect at the focused DX spot's position
 * on the 3D globe. Only visible when actively focusing on a spot.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSpotFocus, latLonToPosition3D } from "@/hooks/useSpotFocus";

/** Plasma orange color for the highlight effect */
const PLASMA_ORANGE = "#FF6B35";
const PLASMA_ORANGE_BRIGHT = "#FF8F5C";

/** Base size of the highlight ring */
const RING_BASE_SIZE = 0.04;

/** Maximum pulse scale */
const PULSE_MAX_SCALE = 2.5;

/** Pulse animation speed */
const PULSE_SPEED = 3;

/** Number of ring layers for the glow effect */
const RING_LAYERS = 3;

interface SpotHighlightProps {
  /** Override the default plasma orange color */
  color?: string;
  /** Override visibility (defaults to isFocusing from useSpotFocus) */
  visible?: boolean;
}

/**
 * Inner ring component with pulsing animation
 */
function PulsingRing({
  position,
  color,
  baseSize,
  delay,
  opacity,
}: {
  position: THREE.Vector3;
  color: string;
  baseSize: number;
  delay: number;
  opacity: number;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!ringRef.current || !materialRef.current) return;

    // Create pulsing effect with delay offset
    const time = clock.elapsedTime * PULSE_SPEED + delay;
    const pulse = (Math.sin(time) + 1) / 2; // Normalize to 0-1

    // Scale from 1 to PULSE_MAX_SCALE
    const scale = 1 + pulse * (PULSE_MAX_SCALE - 1);
    ringRef.current.scale.set(scale, scale, scale);

    // Fade out as it expands
    const fadeOpacity = opacity * (1 - pulse * 0.7);
    materialRef.current.opacity = fadeOpacity;
  });

  return (
    <mesh ref={ringRef} position={position}>
      <ringGeometry args={[baseSize * 0.8, baseSize, 32]} />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

/**
 * Glowing center point
 */
function GlowPoint({
  position,
  color,
  size,
}: {
  position: THREE.Vector3;
  color: string;
  size: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;

    // Subtle breathing effect
    const time = clock.elapsedTime * 2;
    const scale = 1 + Math.sin(time) * 0.2;
    meshRef.current.scale.set(scale, scale, scale);

    // Brightness pulse
    const brightness = 0.8 + Math.sin(time * 1.5) * 0.2;
    materialRef.current.opacity = brightness;
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={0.9}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Outer glow halo effect
 */
function GlowHalo({
  position,
  color,
  size,
}: {
  position: THREE.Vector3;
  color: string;
  size: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;

    // Slow rotation for visual interest
    meshRef.current.rotation.z = clock.elapsedTime * 0.5;

    // Subtle opacity pulse
    const time = clock.elapsedTime * 1.5;
    const opacity = 0.15 + Math.sin(time) * 0.05;
    materialRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} position={position}>
      <circleGeometry args={[size, 32]} />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

/**
 * SpotHighlight renders a pulsing highlight effect at the focused spot location
 *
 * Uses the useSpotFocus hook to get the currently focused spot and its position.
 * The highlight consists of:
 * - Multiple pulsing rings that expand outward
 * - A glowing center point
 * - An outer halo effect
 *
 * All elements use plasma-orange color and animate continuously while visible.
 *
 * @example
 * ```tsx
 * // In your Three.js scene
 * <SpotHighlight />
 *
 * // With custom color
 * <SpotHighlight color="#00FF88" />
 * ```
 */
export function SpotHighlight({
  color = PLASMA_ORANGE,
  visible: visibleOverride,
}: SpotHighlightProps) {
  const { isFocusing, focusedSpot } = useSpotFocus();

  // Determine visibility
  const isVisible = visibleOverride ?? isFocusing;

  // Calculate 3D position from lat/lon
  const position = useMemo((): THREE.Vector3 | null => {
    if (!focusedSpot?.dxLat || !focusedSpot?.dxLon) {
      return null;
    }

    const pos = latLonToPosition3D(focusedSpot.dxLat, focusedSpot.dxLon, 1.025);
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }, [focusedSpot]);

  // Don't render if not visible or no position
  if (!isVisible || !position) {
    return null;
  }

  return (
    <group renderOrder={1}>
      {/* Outer glow halo */}
      <GlowHalo position={position} color={color} size={RING_BASE_SIZE * 4} />

      {/* Multiple pulsing rings with staggered delays */}
      {Array.from({ length: RING_LAYERS }).map((_, index) => (
        <PulsingRing
          key={index}
          position={position}
          color={index === 0 ? PLASMA_ORANGE_BRIGHT : color}
          baseSize={RING_BASE_SIZE}
          delay={(index * Math.PI * 2) / RING_LAYERS}
          opacity={0.6 - index * 0.15}
        />
      ))}

      {/* Glowing center point */}
      <GlowPoint
        position={position}
        color={PLASMA_ORANGE_BRIGHT}
        size={RING_BASE_SIZE * 0.4}
      />
    </group>
  );
}

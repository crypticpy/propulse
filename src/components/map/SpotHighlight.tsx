/**
 * SpotHighlight Component
 *
 * Renders a pulsing ring/glow effect at the focused DX spot's position
 * on the 3D globe. Only visible when actively focusing on a spot.
 *
 * Performance: All 5 sub-elements animate from a single useFrame callback
 * in the parent, avoiding 5 separate R3F scheduler entries.
 */

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSpotFocus, latLonToPosition3D } from "@/hooks/useSpotFocus";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

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
 * SpotHighlight renders a pulsing highlight effect at the focused spot location.
 *
 * Uses a single useFrame to drive all child animations via refs,
 * rather than 5 separate useFrame callbacks.
 */
export function SpotHighlight({
  color = PLASMA_ORANGE,
  visible: visibleOverride,
}: SpotHighlightProps) {
  const { isFocusing, focusedSpot } = useSpotFocus();

  const isVisible = visibleOverride ?? isFocusing;

  // Calculate 3D position from lat/lon
  const position = useMemo((): THREE.Vector3 | null => {
    if (!focusedSpot?.dxLat || !focusedSpot?.dxLon) {
      return null;
    }
    const pos = latLonToPosition3D(focusedSpot.dxLat, focusedSpot.dxLon, 1.025);
    return new THREE.Vector3(pos.x, pos.y, pos.z);
  }, [focusedSpot]);

  // Orient the flat rings/halo tangent to the globe surface, front face
  // outward — without this they sit in the world XY plane and appear
  // edge-on at most spot positions.
  const surfaceQuaternion = useMemo(() => {
    if (!position) return null;
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      position.clone().normalize(),
    );
  }, [position]);

  // Refs for all animated elements — driven by a single useFrame
  const ringRefs = useRef<(THREE.Mesh | null)[]>([null, null, null]);
  const ringMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([
    null,
    null,
    null,
  ]);
  const glowPointRef = useRef<THREE.Mesh>(null);
  const glowPointMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const haloMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Pre-computed delays for ring layers
  const ringDelays = useMemo(
    () =>
      Array.from(
        { length: RING_LAYERS },
        (_, i) => (i * Math.PI * 2) / RING_LAYERS,
      ),
    [],
  );
  const ringOpacities = useMemo(
    () => Array.from({ length: RING_LAYERS }, (_, i) => 0.6 - i * 0.15),
    [],
  );

  // Single consolidated useFrame for all 5 sub-elements
  useFrame(({ clock }) => {
    if (!isVisible || !position) return;

    const elapsed = clock.elapsedTime;

    // ── Pulsing rings (3x) ──────────────────────────────────────────
    for (let i = 0; i < RING_LAYERS; i++) {
      const mesh = ringRefs.current[i];
      const mat = ringMatRefs.current[i];
      if (!mesh || !mat) continue;

      const time = elapsed * PULSE_SPEED + ringDelays[i];
      const pulse = (Math.sin(time) + 1) / 2;
      const scale = 1 + pulse * (PULSE_MAX_SCALE - 1);
      mesh.scale.set(scale, scale, scale);
      mat.opacity = ringOpacities[i] * (1 - pulse * 0.7);
    }

    // ── Glow point (1x) ─────────────────────────────────────────────
    if (glowPointRef.current && glowPointMatRef.current) {
      const time = elapsed * 2;
      const scale = 1 + Math.sin(time) * 0.2;
      glowPointRef.current.scale.set(scale, scale, scale);
      glowPointMatRef.current.opacity = 0.8 + Math.sin(time * 1.5) * 0.2;
    }

    // ── Glow halo (1x) ──────────────────────────────────────────────
    if (haloRef.current && haloMatRef.current) {
      haloRef.current.rotation.z = elapsed * 0.5;
      haloMatRef.current.opacity = 0.15 + Math.sin(elapsed * 1.5) * 0.05;
    }
  });

  if (!isVisible || !position || !surfaceQuaternion) {
    return null;
  }

  // renderOrder sits on each mesh — Three.js does not inherit it from the
  // parent group. FrontSide on the tangent discs culls the far hemisphere
  // (depthTest is off); the center sphere protrudes above the surface, so
  // it keeps depthTest for free far-side occlusion.
  return (
    <group position={position} quaternion={surfaceQuaternion}>
      {/* Outer glow halo */}
      <mesh ref={haloRef} renderOrder={GLOBE_LAYER_ORDER.markers}>
        <circleGeometry args={[RING_BASE_SIZE * 4, 32]} />
        <meshBasicMaterial
          ref={haloMatRef}
          color={color}
          transparent
          opacity={0.15}
          side={THREE.FrontSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {/* Multiple pulsing rings with staggered delays */}
      {ringDelays.map((_, index) => (
        <mesh
          key={index}
          ref={(el) => {
            ringRefs.current[index] = el;
          }}
          renderOrder={GLOBE_LAYER_ORDER.markers + 0.1}
        >
          <ringGeometry args={[RING_BASE_SIZE * 0.8, RING_BASE_SIZE, 32]} />
          <meshBasicMaterial
            ref={(el) => {
              ringMatRefs.current[index] = el;
            }}
            color={index === 0 ? PLASMA_ORANGE_BRIGHT : color}
            transparent
            opacity={ringOpacities[index]}
            side={THREE.FrontSide}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>
      ))}

      {/* Glowing center point */}
      <mesh ref={glowPointRef} renderOrder={GLOBE_LAYER_ORDER.markers + 0.2}>
        <sphereGeometry args={[RING_BASE_SIZE * 0.4, 16, 16]} />
        <meshBasicMaterial
          ref={glowPointMatRef}
          color={PLASMA_ORANGE_BRIGHT}
          transparent
          opacity={0.9}
          depthTest={true}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

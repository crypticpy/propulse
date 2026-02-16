/**
 * Ft8CycleRadar
 *
 * A pulsing ring at the operator's QTH that expands over the FT8/FT4 cycle
 * duration, creating a "radar sweep" effect. The ring starts small and grows
 * outward as the cycle progresses, fading as it expands. On each new cycle
 * boundary, a brief flash highlights the reset.
 *
 * The ring is oriented tangent to the globe surface at the QTH position
 * (perpendicular to the surface normal), giving the appearance of a
 * ground-level radar pulse emanating from the station.
 *
 * Uses scale-based animation instead of per-frame geometry allocation
 * for optimal performance (~0 allocations per cycle).
 */

import React, { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Globe surface radius for the radar ring (slightly above surface) */
const SURFACE_RADIUS = 1.004;

/** Base opacity that fades with cycle progress */
const BASE_OPACITY = 0.35;

/** Flash opacity on new cycle */
const FLASH_OPACITY = 0.6;

/** Flash decay duration in seconds */
const FLASH_DECAY_S = 0.3;

/** Radar ring color (plasma-orange) */
const RING_COLOR = "#FF8844";

/** Ring geometry segments */
const RING_SEGMENTS = 48;

/**
 * Static ring geometry — sized at "full expansion" scale.
 * We animate via mesh.scale instead of recreating geometry each frame.
 * Inner/outer radii chosen so the ring looks right at scale=1 (end of cycle).
 */
const RING_INNER = 0.038;
const RING_OUTER = 0.04;

/** Scale range: ring grows from MIN_SCALE to MAX_SCALE over the cycle */
const MIN_SCALE = 0.005 / RING_OUTER; // ~0.125
const MAX_SCALE = 1.0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Ft8CycleRadarProps {
  /** Operator latitude */
  qthLat: number;
  /** Operator longitude */
  qthLon: number;
  /** 0-1 progress through current FT8/FT4 cycle */
  cycleProgress: number;
  /** True when cycle boundary just crossed */
  isNewCycle: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Ft8CycleRadar = React.memo(function Ft8CycleRadar({
  qthLat,
  qthLon,
  cycleProgress,
  isNewCycle,
}: Ft8CycleRadarProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Flash state tracking — uses R3F clock exclusively (no performance.now)
  const flashTimeRef = useRef<number>(-1);
  const prevIsNewCycleRef = useRef(false);

  // Detect new cycle edge (rising edge of isNewCycle) — mark for flash
  // The actual flash timestamp is set in useFrame using R3F clock
  const flashPendingRef = useRef(false);
  useEffect(() => {
    if (isNewCycle && !prevIsNewCycleRef.current) {
      flashPendingRef.current = true;
    }
    prevIsNewCycleRef.current = isNewCycle;
  }, [isNewCycle]);

  // Position and orient the mesh when QTH changes
  useEffect(() => {
    if (!meshRef.current) return;

    const pos = latLonToVector3(qthLat, qthLon, SURFACE_RADIUS);
    meshRef.current.position.copy(pos);

    // Orient ring tangent to globe surface:
    // lookAt(pos * 2) makes the ring face outward from the globe center
    meshRef.current.lookAt(pos.clone().multiplyScalar(2));
  }, [qthLat, qthLon]);

  // Animate ring scale and opacity each frame (no geometry allocation)
  useFrame(({ clock }) => {
    if (!meshRef.current || !materialRef.current) return;

    const now = clock.getElapsedTime();

    // If a flash was requested via useEffect, stamp it with R3F time
    if (flashPendingRef.current) {
      flashTimeRef.current = now;
      flashPendingRef.current = false;
    }

    // Scale-based ring expansion: lerp from MIN_SCALE to MAX_SCALE
    const scale = MIN_SCALE + cycleProgress * (MAX_SCALE - MIN_SCALE);
    meshRef.current.scale.setScalar(scale);

    // Compute opacity: base fade + optional flash
    let opacity = BASE_OPACITY * (1 - cycleProgress);

    // Flash effect: additive brightness that decays (R3F clock only)
    if (flashTimeRef.current > 0) {
      const flashElapsed = now - flashTimeRef.current;
      if (flashElapsed < FLASH_DECAY_S) {
        const flashFactor = 1 - flashElapsed / FLASH_DECAY_S;
        opacity = Math.max(opacity, FLASH_OPACITY * flashFactor);
      } else {
        flashTimeRef.current = -1;
      }
    }

    materialRef.current.opacity = opacity;
  });

  return (
    <mesh ref={meshRef} renderOrder={2}>
      <ringGeometry args={[RING_INNER, RING_OUTER, RING_SEGMENTS]} />
      <meshBasicMaterial
        ref={materialRef}
        color={RING_COLOR}
        transparent
        opacity={BASE_OPACITY}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
});

export default Ft8CycleRadar;

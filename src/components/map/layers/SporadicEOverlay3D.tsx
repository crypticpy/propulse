/**
 * SporadicEOverlay3D Component
 *
 * Renders Sporadic E cloud probability patches at ionospheric E-layer
 * altitude on the 3D globe. Uses translucent green discs that float
 * above the globe surface, creating an ethereal cloud-like effect.
 *
 * Higher foEs values produce brighter, more opaque patches. A subtle
 * pulse animation on high-probability zones creates a "living" feel.
 *
 * Only regions with probability > 0.02 are rendered.
 */

import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SporadicERegion } from "@/hooks/useSporadicE";

// =============================================================================
// TYPES
// =============================================================================

interface SporadicEOverlay3DProps {
  regions: SporadicERegion[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** E-layer altitude — floats visibly above the globe surface */
const GLOBE_RADIUS = 1.025;

/** Minimum probability to render — low threshold ensures winter Es is
 *  visible (dark green) while summer mid-lat peaks are bright green. */
const MIN_PROBABILITY = 0.02;

/** Hard cap on rendered instances */
const MAX_INSTANCES = 2000;

// =============================================================================
// MODULE-LEVEL REUSABLES
// =============================================================================

const dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 0, 1);

// Sporadic E color palette — ethereal green tones
const colorWeak = new THREE.Color("#226644"); // dark green — low probability
const colorStrong = new THREE.Color("#66ff99"); // bright green — high probability/foEs

// =============================================================================
// HELPERS
// =============================================================================

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

/**
 * Map probability and foEs to a green intensity color.
 * Higher probability and foEs produce brighter greens.
 */
function sporadicEToColor(
  probability: number,
  foEs: number,
  out: THREE.Color,
): void {
  // Combined intensity: probability dominates, foEs adds brightness
  // foEs typically ranges 2-15 MHz, normalize to 0-1
  const foEsNorm = Math.min(1, Math.max(0, (foEs - 2) / 13));
  const intensity = Math.min(1, probability * 0.7 + foEsNorm * 0.3);
  out.lerpColors(colorWeak, colorStrong, intensity);
}

// =============================================================================
// COMPONENT
// =============================================================================

export const SporadicEOverlay3D = React.memo(
  function SporadicEOverlay3D({ regions }: SporadicEOverlay3DProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Build instance data from regions
    const instanceData = useMemo(() => {
      const filtered = regions.filter((r) => r.probability > MIN_PROBABILITY);
      const matrices: THREE.Matrix4[] = [];
      const colors: THREE.Color[] = [];
      const probabilities: number[] = [];

      for (
        let i = 0;
        i < filtered.length && matrices.length < MAX_INSTANCES;
        i++
      ) {
        const region = filtered[i];
        const [x, y, z] = latLonTo3D(region.lat, region.lon, GLOBE_RADIUS);

        // Orient disc to face outward from globe center
        dummy.position.set(x, y, z);
        const normal = dummy.position.clone().normalize();
        dummy.quaternion.setFromUnitVectors(up, normal);

        // Scale: larger discs for higher probability — creates cloud-like blobs
        // Base scale 0.12 produces visible patches on a radius-1.0 globe;
        // probability further expands them up to 1.6x for strong regions.
        const baseScale = 0.12;
        const probScale = 1 + region.probability * 0.6;
        dummy.scale.setScalar(baseScale * probScale);
        dummy.updateMatrix();

        matrices.push(dummy.matrix.clone());

        const c = new THREE.Color();
        sporadicEToColor(region.probability, region.estimatedFoEs, c);
        colors.push(c);
        probabilities.push(region.probability);
      }

      return { matrices, colors, probabilities, count: matrices.length };
    }, [regions]);

    // Apply instance data to mesh after mount and when data changes
    useEffect(() => {
      const mesh = meshRef.current;
      if (!mesh || instanceData.count === 0) return;

      for (let i = 0; i < instanceData.count; i++) {
        mesh.setMatrixAt(i, instanceData.matrices[i]);
        mesh.setColorAt(i, instanceData.colors[i]);
      }

      mesh.count = instanceData.count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }, [instanceData]);

    // Ethereal pulse animation — slow, dreamy opacity oscillation
    const materialRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame(({ clock }) => {
      if (materialRef.current) {
        const t = clock.getElapsedTime();
        // Layered sine waves for organic, cloud-like pulsing
        const pulse = Math.sin(t * 0.6) * 0.06 + Math.sin(t * 1.3) * 0.03;
        materialRef.current.opacity = 0.55 + pulse;
      }
    });

    if (!regions || regions.length === 0) {
      return null;
    }

    // Check if any regions pass the minimum probability filter
    const hasVisible = regions.some((r) => r.probability > MIN_PROBABILITY);
    if (!hasVisible) return null;

    return (
      <group name="sporadic-e-overlay">
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={8}
        >
          <circleGeometry args={[1, 20]} />
          <meshBasicMaterial
            ref={materialRef}
            transparent
            opacity={0.55}
            depthWrite={false}
            blending={THREE.NormalBlending}
            side={THREE.DoubleSide}
            vertexColors
          />
        </instancedMesh>
      </group>
    );
  },
  (prev, next) => prev.regions === next.regions,
);

export default SporadicEOverlay3D;

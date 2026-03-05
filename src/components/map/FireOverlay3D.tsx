/**
 * FireOverlay3D
 *
 * Renders active fire hotspot markers on the 3D globe using two InstancedMesh
 * layers: an outer orange glow and an inner deep red-orange core. Designed
 * for high-count scenarios (5000+ simultaneous hotspots) without creating
 * individual mesh objects per hotspot.
 *
 * Visual behaviour:
 * - Scale based on fire radiative power (FRP)
 * - Low-confidence detections are filtered out
 * - Outer glow has a subtle flicker animation
 *
 * The component is memoised on the `hotspots` array reference to avoid
 * unnecessary React reconciliation; all per-frame work happens in useFrame.
 */

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { FireHotspot } from "@/lib/api/fires";
import { latLonTo3D } from "@/components/map/lib/globeCoords";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on rendered instances to prevent GPU overload */
const MAX_INSTANCES = 5000;

/** Globe-surface radius for hotspot placement (matches other overlays) */
const GLOBE_RADIUS = 1.006;

// ---------------------------------------------------------------------------
// Module-level dummy -- reused every frame, never recreated
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FireOverlay3DProps {
  hotspots: FireHotspot[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FireOverlay3D = React.memo(
  function FireOverlay3D({ hotspots }: FireOverlay3DProps) {
    const glowRef = useRef<THREE.InstancedMesh>(null);
    const coreRef = useRef<THREE.InstancedMesh>(null);

    // Per-frame update -- positions, scales, flicker animation, and counts
    useFrame(({ clock }) => {
      const glowMesh = glowRef.current;
      const coreMesh = coreRef.current;
      if (!glowMesh || !coreMesh) return;

      const elapsed = clock.getElapsedTime();
      let count = 0;

      for (let i = 0; i < hotspots.length && count < MAX_INSTANCES; i++) {
        const hotspot = hotspots[i];

        // Skip low-confidence detections
        // FIRMS returns single-letter codes: "l" (low), "n" (nominal), "h" (high)
        if (hotspot.confidence === "low" || hotspot.confidence === "l")
          continue;

        const [x, y, z] = latLonTo3D(hotspot.lat, hotspot.lon, GLOBE_RADIUS);

        // Scale based on fire radiative power
        const size = Math.max(0.002, Math.min(0.008, hotspot.frp / 500));

        // Flicker animation for the outer glow
        const flicker = 0.9 + 0.2 * Math.sin(elapsed * 8 + i * 3.7);

        // --- Outer glow instance ---
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(size * flicker);
        dummy.updateMatrix();
        glowMesh.setMatrixAt(count, dummy.matrix);

        // --- Inner core instance (no flicker, slightly smaller) ---
        dummy.scale.setScalar(size * 0.5);
        dummy.updateMatrix();
        coreMesh.setMatrixAt(count, dummy.matrix);

        count++;
      }

      // Update instance counts and flag the buffers dirty
      glowMesh.count = count;
      coreMesh.count = count;

      if (count > 0) {
        glowMesh.instanceMatrix.needsUpdate = true;
        coreMesh.instanceMatrix.needsUpdate = true;
      }
    });

    // Nothing to render -- avoid allocating GPU resources
    if (hotspots.length === 0) return null;

    return (
      <group name="fire-overlay">
        {/* Outer glow -- orange, additive blending, low opacity */}
        <instancedMesh
          ref={glowRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={3}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#ff6600"
            transparent
            opacity={0.3}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </instancedMesh>

        {/* Inner core -- deep red-orange, higher opacity */}
        <instancedMesh
          ref={coreRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={3}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#ff2200"
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        </instancedMesh>
      </group>
    );
  },
  // Custom comparator: only re-render when the hotspots array reference changes
  (prev, next) => prev.hotspots === next.hotspots,
);

export default FireOverlay3D;

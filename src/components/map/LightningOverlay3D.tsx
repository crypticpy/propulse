/**
 * LightningOverlay3D
 *
 * Renders lightning strike markers on the 3D globe using two InstancedMesh
 * layers: an outer bright glow and an inner white-hot core. Designed
 * for high-count scenarios (1000+ simultaneous strikes) without creating
 * individual mesh objects per strike.
 *
 * Visual behaviour:
 * - Strikes fade from full brightness to 10% over a 10-minute window
 * - Strikes less than 5 seconds old get a brief flash-scale pulse
 * - Old strikes (>10 min) are filtered out entirely
 * - Strike size and altitude vary by peak current (currentKA)
 * - Very strong strikes (>100 kA) get a stretched bolt appearance during flash
 *
 * The component is memoised on the `strikes` array reference to avoid
 * unnecessary React reconciliation; all per-frame work happens in useFrame.
 */

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { LightningStrike } from "@/lib/api/lightning";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on rendered instances to prevent GPU overload */
const MAX_INSTANCES = 2000;

/** Strikes older than this are not rendered */
const FADE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

/** Duration of the initial bright-flash effect for new strikes */
const FLASH_DURATION_MS = 5000; // 5 seconds

/** Base globe-surface radius for strike placement — elevated into troposphere */
const GLOBE_RADIUS = 1.03;

/** Additional altitude for max-intensity strikes */
const ALTITUDE_SPREAD = 0.02;

/** Max peak current used for normalisation */
const MAX_CURRENT_KA = 200;

// ---------------------------------------------------------------------------
// Module-level reusables — reused every frame, never recreated
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();
const tempColor = new THREE.Color();
const weakColor = new THREE.Color("#66ccff"); // electric blue for weak
const strongColor = new THREE.Color("#ffffff"); // white-hot for strong
const matrix = new THREE.Matrix4();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a number between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Coordinate conversion (same convention as every other globe component)
// ---------------------------------------------------------------------------

function latLonTo3D(
  lat: number,
  lon: number,
  radius: number = GLOBE_RADIUS,
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
// Props
// ---------------------------------------------------------------------------

interface LightningOverlay3DProps {
  strikes: LightningStrike[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const LightningOverlay3D = React.memo(
  function LightningOverlay3D({ strikes }: LightningOverlay3DProps) {
    const glowRef = useRef<THREE.InstancedMesh>(null);
    const coreRef = useRef<THREE.InstancedMesh>(null);

    // Per-frame update — positions, scales, and counts
    useFrame(() => {
      const glowMesh = glowRef.current;
      const coreMesh = coreRef.current;
      if (!glowMesh || !coreMesh) return;

      const now = Date.now();
      let count = 0;

      for (let i = 0; i < strikes.length && count < MAX_INSTANCES; i++) {
        const strike = strikes[i];
        const age = now - strike.time;

        // Skip strikes that have fully faded
        if (age > FADE_DURATION_MS) continue;

        // Normalise peak current for intensity-based sizing
        const intensity = clamp(strike.currentKA / MAX_CURRENT_KA, 0.3, 1.0);

        // Altitude varies with intensity — stronger strikes sit higher
        const normalizedKA = clamp(strike.currentKA / MAX_CURRENT_KA, 0, 1);
        const strikeRadius = GLOBE_RADIUS + normalizedKA * ALTITUDE_SPREAD;

        const [x, y, z] = latLonTo3D(strike.lat, strike.lon, strikeRadius);
        const alpha = Math.max(0.15, 1 - age / FADE_DURATION_MS);

        // Flash multiplier: new strikes pulse larger then ease back
        const isFlashing = age < FLASH_DURATION_MS;
        const t = isFlashing ? age / FLASH_DURATION_MS : 1;
        const flash = isFlashing ? 1 + (1 - t) * 3.0 : 1;

        // --- Outer glow instance --- (3x larger base than before)
        const glowBaseScale = 0.025 * intensity * alpha * flash;

        if (isFlashing && strike.currentKA > 100) {
          // Stretched bolt appearance for strong, fresh strikes
          dummy.position.set(x, y, z);
          matrix.makeScale(glowBaseScale, glowBaseScale * 2.0, glowBaseScale);
          dummy.matrix.copy(matrix);
          dummy.matrix.setPosition(x, y, z);
          glowMesh.setMatrixAt(count, dummy.matrix);
        } else {
          dummy.position.set(x, y, z);
          dummy.scale.setScalar(glowBaseScale);
          dummy.updateMatrix();
          glowMesh.setMatrixAt(count, dummy.matrix);
        }

        // --- Inner core instance (bright, sized by intensity) ---
        const coreBaseScale = 0.012 * intensity * alpha * flash;
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(coreBaseScale);
        dummy.updateMatrix();
        coreMesh.setMatrixAt(count, dummy.matrix);

        // Colour the core by intensity: electric blue (weak) to white-hot (strong)
        tempColor.lerpColors(weakColor, strongColor, intensity);
        coreMesh.setColorAt(count, tempColor);

        count++;
      }

      // Update instance counts and flag the buffers dirty
      glowMesh.count = count;
      coreMesh.count = count;

      if (count > 0) {
        glowMesh.instanceMatrix.needsUpdate = true;
        coreMesh.instanceMatrix.needsUpdate = true;
        if (coreMesh.instanceColor) {
          coreMesh.instanceColor.needsUpdate = true;
        }
      }
    });

    // Nothing to render — avoid allocating GPU resources
    if (strikes.length === 0) return null;

    return (
      <group name="lightning-overlay">
        {/* Outer glow — bright cyan, additive blending, high opacity */}
        <instancedMesh
          ref={glowRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            color="#44ddff"
            transparent
            opacity={0.8}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </instancedMesh>

        {/* Inner core — white-hot, coloured per-instance by intensity */}
        <instancedMesh
          ref={coreRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.95}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </instancedMesh>
      </group>
    );
  },
  // Custom comparator: only re-render when the strikes array reference changes
  (prev, next) => prev.strikes === next.strikes,
);

export default LightningOverlay3D;

/**
 * DuctingOverlay3D Component
 *
 * Renders tropospheric ducting probability regions on the 3D globe.
 * Each region is a translucent colored disc at ground level, colored by
 * ducting type with intensity proportional to probability:
 *
 *   - Surface ducting: green (#22cc66)
 *   - Elevated ducting: yellow (#ddcc22)
 *   - Evaporation ducting: teal (#22bbaa)
 *
 * Higher probability produces brighter colors and larger discs.
 * Additive blending makes overlapping regions glow convincingly.
 * A layered sine-wave animation creates an organic shimmer.
 *
 * Only regions with probability > 0.1 are rendered.
 */

import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DuctingRegion } from "@/hooks/useDuctingForecast";
import { latLonTo3D } from "@/components/map/lib/globeCoords";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// =============================================================================
// TYPES
// =============================================================================

interface DuctingOverlay3DProps {
  regions: DuctingRegion[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Ground-level radius — just above surface */
const GLOBE_RADIUS = 1.008;

/** Minimum probability to render */
const MIN_PROBABILITY = 0.1;

/** Hard cap on rendered instances */
const MAX_INSTANCES = 2000;

// =============================================================================
// MODULE-LEVEL REUSABLES
// =============================================================================

const dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 1, 0);

// Ducting type colors — dim variants for low probability
const colorSurfaceDim = new THREE.Color("#0d5528"); // dark green
const colorSurfaceBright = new THREE.Color("#44ff88"); // bright green

const colorElevatedDim = new THREE.Color("#554d0a"); // dark yellow
const colorElevatedBright = new THREE.Color("#ffee55"); // bright yellow

const colorEvaporationDim = new THREE.Color("#0d4a42"); // dark teal
const colorEvaporationBright = new THREE.Color("#44eedd"); // bright teal

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Map ducting type and probability to a color with intensity proportional
 * to probability. Low probability = dim, high probability = bright/vivid.
 */
function ductingToColor(
  type: DuctingRegion["type"],
  probability: number,
  out: THREE.Color,
): void {
  // Normalize probability into 0-1 intensity range
  // MIN_PROBABILITY is 0.1, max is 1.0 — remap to 0-1
  const intensity = Math.min(
    1,
    Math.max(0, (probability - MIN_PROBABILITY) / (1 - MIN_PROBABILITY)),
  );

  switch (type) {
    case "surface":
      out.lerpColors(colorSurfaceDim, colorSurfaceBright, intensity);
      break;
    case "elevated":
      out.lerpColors(colorElevatedDim, colorElevatedBright, intensity);
      break;
    case "evaporation":
      out.lerpColors(colorEvaporationDim, colorEvaporationBright, intensity);
      break;
    default:
      out.lerpColors(colorSurfaceDim, colorSurfaceBright, intensity);
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export const DuctingOverlay3D = React.memo(
  function DuctingOverlay3D({ regions }: DuctingOverlay3DProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Filter regions and compute instance data (matrices + colors)
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

        // Scale: larger discs for higher probability — creates cloud-like regions.
        // Base scale 0.07 produces visible patches that slightly overlap at
        // 10-degree resolution. Probability expands them up to 1.5x.
        const baseScale = 0.07;
        const probScale = 1 + region.probability * 0.5;
        dummy.scale.setScalar(baseScale * probScale);
        dummy.updateMatrix();

        matrices.push(dummy.matrix.clone());

        const c = new THREE.Color();
        ductingToColor(region.type, region.probability, c);
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

    // Shimmer animation: layered sine waves for organic, atmospheric pulsing
    const materialRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame(({ clock }) => {
      if (materialRef.current) {
        const t = clock.getElapsedTime();
        // Two overlaid sine waves at different frequencies for organic feel
        const pulse = Math.sin(t * 0.7) * 0.06 + Math.sin(t * 1.5) * 0.03;
        materialRef.current.opacity = 0.45 + pulse;
      }
    });

    if (!regions || regions.length === 0) {
      return null;
    }

    // Check if any regions pass the minimum probability filter
    const hasVisible = regions.some((r) => r.probability > MIN_PROBABILITY);
    if (!hasVisible) return null;

    return (
      <group name="ducting-overlay">
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={GLOBE_LAYER_ORDER.surfaceArea}
        >
          <sphereGeometry args={[1, 12, 6, 0, Math.PI * 2, 0, 0.35]} />
          <meshBasicMaterial
            ref={materialRef}
            transparent
            opacity={0.45}
            depthTest={false}
            depthWrite={false}
            blending={THREE.NormalBlending}
            side={THREE.FrontSide}
            vertexColors
          />
        </instancedMesh>
      </group>
    );
  },
  (prev, next) => prev.regions === next.regions,
);

export default DuctingOverlay3D;

/**
 * DuctingOverlay3D Component
 *
 * Renders tropospheric ducting probability regions on the 3D globe.
 * Each region is a flat colored disc at ground level, colored by ducting
 * type (surface=green, elevated=yellow, evaporation=cyan) with opacity
 * proportional to probability. High-probability regions pulse gently.
 *
 * Only regions with probability > 0.1 are rendered.
 */

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { DuctingRegion } from "@/hooks/useDuctingForecast";

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
const GLOBE_RADIUS = 1.003;

/** Minimum probability to render */
const MIN_PROBABILITY = 0.1;

/** Hard cap on rendered instances */
const MAX_INSTANCES = 2000;

// =============================================================================
// MODULE-LEVEL REUSABLES
// =============================================================================

const dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 0, 1);

// Ducting type colors
const colorSurface = new THREE.Color("#22cc66"); // green — surface ducting
const colorElevated = new THREE.Color("#ddcc22"); // yellow — elevated ducting
const colorEvaporation = new THREE.Color("#22bbaa"); // teal — evaporation ducting

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

/** Get the color for a ducting type */
function getDuctingColor(type: DuctingRegion["type"]): THREE.Color {
  switch (type) {
    case "surface":
      return colorSurface;
    case "elevated":
      return colorElevated;
    case "evaporation":
      return colorEvaporation;
    default:
      return colorSurface;
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export const DuctingOverlay3D = React.memo(
  function DuctingOverlay3D({ regions }: DuctingOverlay3DProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Filter and sort regions, compute instance data
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

        // Scale disc
        const discScale = 0.035;
        dummy.scale.setScalar(discScale);
        dummy.updateMatrix();

        matrices.push(dummy.matrix.clone());
        colors.push(getDuctingColor(region.type).clone());
        probabilities.push(region.probability);
      }

      return { matrices, colors, probabilities, count: matrices.length };
    }, [regions]);

    // Apply instance data to mesh
    useMemo(() => {
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

    // Shimmer animation: gentle opacity pulse for high-probability regions
    const materialRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame(({ clock }) => {
      if (materialRef.current) {
        const t = clock.getElapsedTime();
        // Base opacity modulated by a slow sine wave
        materialRef.current.opacity = 0.3 + 0.12 * Math.sin(t * 1.2);
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
        >
          <circleGeometry args={[1, 16]} />
          <meshBasicMaterial
            ref={materialRef}
            transparent
            opacity={0.35}
            depthWrite={false}
            side={THREE.DoubleSide}
            vertexColors={false}
          />
        </instancedMesh>
      </group>
    );
  },
  (prev, next) => prev.regions === next.regions,
);

export default DuctingOverlay3D;

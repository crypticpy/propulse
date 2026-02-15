/**
 * NoiseFloorOverlay3D Component
 *
 * Renders an ITU-R P.372 noise floor heatmap on the 3D globe using
 * InstancedMesh with flat colored discs at each grid point. Color maps
 * from blue (quiet) through green/yellow to red (noisy).
 *
 * Data comes from the useNoiseFloor hook which provides a NoiseFloorGrid
 * with lats[], lons[], and values[][] (total noise in dB).
 */

import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// =============================================================================
// TYPES
// =============================================================================

interface NoiseFloorOverlay3DProps {
  grid: {
    lats: number[];
    lons: number[];
    values: number[][]; // [lat][lon] total noise dB
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Radius just above globe surface to avoid z-fighting */
const GLOBE_RADIUS = 1.005;

/** Max instances — typical 10-degree grid yields ~684 points */
const MAX_INSTANCES = 1200;

// =============================================================================
// MODULE-LEVEL REUSABLES
// =============================================================================

const dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 0, 1);

// Color stops for noise level mapping
const colorQuiet = new THREE.Color("#2266ff"); // blue — quiet (<20 dB)
const colorModerate = new THREE.Color("#22cc66"); // green — moderate (20-35 dB)
const colorLoud = new THREE.Color("#ddcc22"); // yellow — loud (35-50 dB)
const colorNoisy = new THREE.Color("#ee3322"); // red — noisy (>50 dB)

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

/** Map a noise dB value to a color using a 4-stop gradient */
function noiseToColor(db: number, out: THREE.Color): void {
  if (db < 20) {
    // Quiet: solid blue
    out.copy(colorQuiet);
  } else if (db < 35) {
    // Quiet -> Moderate: blue to green
    const t = (db - 20) / 15;
    out.lerpColors(colorQuiet, colorModerate, t);
  } else if (db < 50) {
    // Moderate -> Loud: green to yellow
    const t = (db - 35) / 15;
    out.lerpColors(colorModerate, colorLoud, t);
  } else {
    // Loud -> Noisy: yellow to red
    const t = Math.min(1, (db - 50) / 20);
    out.lerpColors(colorLoud, colorNoisy, t);
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export const NoiseFloorOverlay3D = React.memo(
  function NoiseFloorOverlay3D({ grid }: NoiseFloorOverlay3DProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Build instance matrices and colors once when grid changes
    const instanceData = useMemo(() => {
      const { lats, lons, values } = grid;
      const matrices: THREE.Matrix4[] = [];
      const colors: THREE.Color[] = [];

      for (let latIdx = 0; latIdx < lats.length; latIdx++) {
        const row = values[latIdx];
        if (!row) continue;

        for (let lonIdx = 0; lonIdx < lons.length; lonIdx++) {
          if (matrices.length >= MAX_INSTANCES) break;

          const db = row[lonIdx];
          if (db == null) continue;

          const [x, y, z] = latLonTo3D(
            lats[latIdx],
            lons[lonIdx],
            GLOBE_RADIUS,
          );

          // Orient disc to face outward from globe center
          dummy.position.set(x, y, z);
          const normal = dummy.position.clone().normalize();
          dummy.quaternion.setFromUnitVectors(up, normal);

          // Scale disc — slightly larger for coarser grids
          const discScale = 0.04;
          dummy.scale.setScalar(discScale);
          dummy.updateMatrix();

          matrices.push(dummy.matrix.clone());

          const c = new THREE.Color();
          noiseToColor(db, c);
          colors.push(c);
        }
        if (matrices.length >= MAX_INSTANCES) break;
      }

      return { matrices, colors, count: matrices.length };
    }, [grid]);

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

    // Subtle slow opacity pulse for visual interest
    const materialRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame(({ clock }) => {
      if (materialRef.current) {
        const t = clock.getElapsedTime();
        materialRef.current.opacity = 0.45 + 0.05 * Math.sin(t * 0.5);
      }
    });

    if (!grid || grid.lats.length === 0 || grid.values.length === 0) {
      return null;
    }

    return (
      <group name="noise-floor-overlay">
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
        >
          <circleGeometry args={[1, 16]} />
          <meshBasicMaterial
            ref={materialRef}
            transparent
            opacity={0.5}
            depthWrite={false}
            side={THREE.DoubleSide}
            vertexColors
          />
        </instancedMesh>
      </group>
    );
  },
  (prev, next) => prev.grid === next.grid,
);

export default NoiseFloorOverlay3D;

/**
 * DRAPOverlay3D Component
 *
 * Renders D-Region Absorption Prediction (DRAP) data on the 3D globe.
 * Displays a heatmap at ionospheric D-region altitude showing HF absorption
 * zones caused by solar X-ray and proton events.
 *
 * DRAP values represent the Highest Affected Frequency (HAF) in MHz.
 * Higher HAF = more severe absorption:
 *   - 0 MHz: no absorption (not rendered)
 *   - 0.1-5 MHz: mild absorption (blue)
 *   - 5-10 MHz: moderate absorption (yellow/orange)
 *   - 10-20 MHz: strong absorption (orange/red)
 *   - >20 MHz: severe blackout (deep red)
 *
 * Only grid points with HAF > 0 are rendered (absorption is occurring).
 * Subtle opacity pulse animation on the overlay.
 */

import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// =============================================================================
// TYPES
// =============================================================================

interface DRAPOverlay3DProps {
  data: {
    frequencies: number[][]; // lat x lon grid of Highest Affected Frequency (MHz)
    latitudes: number[];
    longitudes: number[];
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** D-region altitude — slightly above surface to show ionospheric layer */
const GLOBE_RADIUS = 1.015;

/** Only render grid points where absorption is occurring (HAF > this) */
const MIN_HAF_MHZ = 0;

/** Hard cap on rendered instances */
const MAX_INSTANCES = 8200;

// =============================================================================
// MODULE-LEVEL REUSABLES
// =============================================================================

const dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 0, 1);

// Color stops for DRAP HAF mapping (higher HAF = worse absorption)
const colorMild = new THREE.Color("#2266ff"); // blue — low HAF (mild absorption)
const colorModerate = new THREE.Color("#ddcc22"); // yellow — moderate HAF
const colorStrong = new THREE.Color("#ee8800"); // orange — strong absorption
const colorSevere = new THREE.Color("#ee2222"); // red — severe blackout

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
 * Map a DRAP HAF value to a color. Higher HAF = more severe = redder.
 *
 * Scale:
 *   0-5 MHz: blue (mild)
 *   5-10 MHz: blue -> yellow (moderate)
 *   10-20 MHz: yellow -> orange (strong)
 *   20+ MHz: orange -> red (severe blackout)
 */
function hafToColor(hafMHz: number, out: THREE.Color): void {
  if (hafMHz <= 5) {
    // 0-5 MHz: mild — solid blue
    out.copy(colorMild);
  } else if (hafMHz <= 10) {
    // 5-10 MHz: blue to yellow
    const t = (hafMHz - 5) / 5;
    out.lerpColors(colorMild, colorModerate, t);
  } else if (hafMHz <= 20) {
    // 10-20 MHz: yellow to orange
    const t = (hafMHz - 10) / 10;
    out.lerpColors(colorModerate, colorStrong, t);
  } else {
    // >20 MHz: orange to red (severe)
    const t = Math.min(1, (hafMHz - 20) / 10);
    out.lerpColors(colorStrong, colorSevere, t);
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export const DRAPOverlay3D = React.memo(
  function DRAPOverlay3D({ data }: DRAPOverlay3DProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Build instance matrices and colors from DRAP grid
    const instanceData = useMemo(() => {
      const { frequencies, latitudes, longitudes } = data;
      const matrices: THREE.Matrix4[] = [];
      const colors: THREE.Color[] = [];

      for (let latIdx = 0; latIdx < latitudes.length; latIdx++) {
        const row = frequencies[latIdx];
        if (!row) continue;

        for (let lonIdx = 0; lonIdx < longitudes.length; lonIdx++) {
          if (matrices.length >= MAX_INSTANCES) break;

          const haf = row[lonIdx];
          // Skip null/undefined values and grid points with no absorption
          if (haf == null || haf <= MIN_HAF_MHZ) continue;

          const [x, y, z] = latLonTo3D(
            latitudes[latIdx],
            longitudes[lonIdx],
            GLOBE_RADIUS,
          );

          // Orient disc to face outward from globe center
          dummy.position.set(x, y, z);
          const normal = dummy.position.clone().normalize();
          dummy.quaternion.setFromUnitVectors(up, normal);

          // Scale disc — size proportional to grid spacing (~4 deg lon, ~2 deg lat)
          const discScale = 0.025;
          dummy.scale.setScalar(discScale);
          dummy.updateMatrix();

          matrices.push(dummy.matrix.clone());

          const c = new THREE.Color();
          hafToColor(haf, c);
          colors.push(c);
        }
        if (matrices.length >= MAX_INSTANCES) break;
      }

      return { matrices, colors, count: matrices.length };
    }, [data]);

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

    // Subtle pulse on the overlay
    const materialRef = useRef<THREE.MeshBasicMaterial>(null);
    useFrame(({ clock }) => {
      if (materialRef.current) {
        const t = clock.getElapsedTime();
        materialRef.current.opacity = 0.38 + 0.07 * Math.sin(t * 0.8);
      }
    });

    if (
      !data ||
      !data.latitudes ||
      data.latitudes.length === 0 ||
      !data.frequencies ||
      data.frequencies.length === 0
    ) {
      return null;
    }

    return (
      <group name="drap-overlay">
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
        >
          <circleGeometry args={[1, 16]} />
          <meshBasicMaterial
            ref={materialRef}
            transparent
            opacity={0.42}
            depthWrite={false}
            side={THREE.DoubleSide}
            vertexColors
          />
        </instancedMesh>
      </group>
    );
  },
  (prev, next) => prev.data === next.data,
);

export default DRAPOverlay3D;

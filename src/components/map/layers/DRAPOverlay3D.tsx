/**
 * DRAPOverlay3D Component
 *
 * Renders D-Region Absorption Prediction (DRAP) data on the 3D globe.
 * Displays a heatmap at ionospheric D-region altitude showing HF absorption
 * zones caused by solar X-ray and proton events. Grid points where the
 * maximum usable frequency is below 15 MHz are rendered as colored discs.
 *
 * Color mapping:
 *   blue (>15 MHz, normal) -> yellow (10-15 MHz) -> orange (5-10 MHz) -> red (<5 MHz, severe)
 */

import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// =============================================================================
// TYPES
// =============================================================================

interface DRAPOverlay3DProps {
  data: {
    frequencies: number[][]; // lat x lon grid of max usable freq (MHz)
    latitudes: number[];
    longitudes: number[];
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** D-region altitude — above surface to show ionospheric layer */
const GLOBE_RADIUS = 1.015;

/** Only render grid points with absorption (freq below this threshold) */
const ABSORPTION_THRESHOLD_MHZ = 15;

/** Hard cap on rendered instances */
const MAX_INSTANCES = 5000;

// =============================================================================
// MODULE-LEVEL REUSABLES
// =============================================================================

const dummy = new THREE.Object3D();
const up = new THREE.Vector3(0, 0, 1);

// Color stops for DRAP frequency mapping
const colorNormal = new THREE.Color("#2266ff"); // blue — near 15 MHz (minimal absorption)
const colorModerate = new THREE.Color("#ddcc22"); // yellow — 10-15 MHz
const colorStrong = new THREE.Color("#ee8800"); // orange — 5-10 MHz
const colorSevere = new THREE.Color("#ee2222"); // red — <5 MHz (severe blackout)

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

/** Map a frequency value to a DRAP color. Lower freq = more severe. */
function freqToColor(freqMHz: number, out: THREE.Color): void {
  if (freqMHz >= 15) {
    out.copy(colorNormal);
  } else if (freqMHz >= 10) {
    // 10-15 MHz: blue to yellow
    const t = 1 - (freqMHz - 10) / 5;
    out.lerpColors(colorNormal, colorModerate, t);
  } else if (freqMHz >= 5) {
    // 5-10 MHz: yellow to orange
    const t = 1 - (freqMHz - 5) / 5;
    out.lerpColors(colorModerate, colorStrong, t);
  } else {
    // <5 MHz: orange to red
    const t = Math.min(1, 1 - freqMHz / 5);
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

          const freq = row[lonIdx];
          if (freq == null || freq >= ABSORPTION_THRESHOLD_MHZ) continue;

          const [x, y, z] = latLonTo3D(
            latitudes[latIdx],
            longitudes[lonIdx],
            GLOBE_RADIUS,
          );

          // Orient disc to face outward from globe center
          dummy.position.set(x, y, z);
          const normal = dummy.position.clone().normalize();
          dummy.quaternion.setFromUnitVectors(up, normal);

          // Scale disc — size proportional to grid spacing
          const discScale = 0.025;
          dummy.scale.setScalar(discScale);
          dummy.updateMatrix();

          matrices.push(dummy.matrix.clone());

          const c = new THREE.Color();
          freqToColor(freq, c);
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

    // Subtle pulse on the most severely affected areas
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

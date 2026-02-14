/**
 * SpectrumWaterfallRing3D
 *
 * Renders a cylindrical waterfall display orbiting the globe at the equator,
 * showing band activity over time. Each column represents an amateur band,
 * and each row represents a time slice. Newer data appears at the outer edge
 * and scrolls inward as time passes.
 *
 * Uses InstancedMesh with small rectangular patches for high performance.
 * Color intensity maps from quiet (dark blue) to active (bright yellow/white).
 *
 * Accepts all data as props -- no direct hook imports.
 */

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpectrumWaterfallRing3DProps {
  /** Band activity data - rows over time, columns per band */
  bandActivity: Array<{
    timestamp: number;
    bands: Record<string, number>; // band name -> spot count (0-100 normalized)
  }>;
  /** Ordered band labels */
  bandNames: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ring base radius (distance from globe center) */
const RING_RADIUS = 1.15;

/** Ring width (radial extent from inner to outer) */
const RING_WIDTH = 0.08;

/** Maximum visible time rows */
const MAX_TIME_ROWS = 20;

/** Tilt from equatorial plane for better 3D visibility (radians) */
const RING_TILT = (10 * Math.PI) / 180;

/** Cell height (radial, for each time row) */
const CELL_HEIGHT = RING_WIDTH / MAX_TIME_ROWS;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

/** Low activity color (dark blue) */
const COLOR_QUIET = new THREE.Color("#0a1a3a");
/** Medium activity color (cyan) */
const COLOR_MODERATE = new THREE.Color("#00aacc");
/** High activity color (bright yellow) */
const COLOR_ACTIVE = new THREE.Color("#ffee44");
/** Peak activity color (white) */
const COLOR_PEAK = new THREE.Color("#ffffff");

/**
 * Map a normalized activity value (0-100) to a color.
 */
function activityToColor(value: number, target: THREE.Color): THREE.Color {
  const v = Math.max(0, Math.min(100, value)) / 100;

  if (v < 0.33) {
    target.lerpColors(COLOR_QUIET, COLOR_MODERATE, v / 0.33);
  } else if (v < 0.66) {
    target.lerpColors(COLOR_MODERATE, COLOR_ACTIVE, (v - 0.33) / 0.33);
  } else {
    target.lerpColors(COLOR_ACTIVE, COLOR_PEAK, (v - 0.66) / 0.34);
  }

  return target;
}

// ---------------------------------------------------------------------------
// Module-level reusable objects
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();
const tempColor = new THREE.Color();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SpectrumWaterfallRing3D = React.memo(
  function SpectrumWaterfallRing3D({
    bandActivity,
    bandNames,
  }: SpectrumWaterfallRing3DProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    const numBands = bandNames.length;
    const numRows = Math.min(bandActivity.length, MAX_TIME_ROWS);

    // Early exit
    if (numBands === 0 || numRows === 0) return null;

    const maxInstances = numBands * MAX_TIME_ROWS;

    // Angular width of each band cell (in radians)
    const cellAngle = (Math.PI * 2) / numBands;

    // Cell geometry (small rectangle)
    const cellGeometry = useMemo(() => {
      // PlaneGeometry sized for one cell
      // Width is approximately arc length at ring radius
      const cellWidth = cellAngle * RING_RADIUS * 0.9; // 90% fill for gaps
      return new THREE.PlaneGeometry(cellWidth, CELL_HEIGHT);
    }, [cellAngle]);

    // Band label positions around the ring edge
    const bandLabelPositions = useMemo(() => {
      return bandNames.map((_, i) => {
        const angle = cellAngle * i + cellAngle * 0.5;
        const labelRadius = RING_RADIUS + RING_WIDTH * 0.5 + 0.02;
        const x = labelRadius * Math.cos(angle);
        const z = labelRadius * Math.sin(angle);
        const y = Math.sin(RING_TILT) * labelRadius * 0.1;
        return new THREE.Vector3(x, y, z);
      });
    }, [bandNames, cellAngle]);

    // Update instances each frame (waterfall scroll effect)
    useFrame(() => {
      const mesh = meshRef.current;
      if (!mesh) return;

      let instanceIdx = 0;

      // Take the most recent numRows entries
      const recentRows = bandActivity.slice(-MAX_TIME_ROWS);

      for (let row = 0; row < MAX_TIME_ROWS; row++) {
        const dataRow = recentRows[row];

        for (let col = 0; col < numBands; col++) {
          if (instanceIdx >= maxInstances) break;

          // Angle for this band column
          const angle = cellAngle * col + cellAngle * 0.5;

          // Radial position: newer rows at outer edge, older toward inner
          const rowFraction = row / MAX_TIME_ROWS;
          const radius = RING_RADIUS + RING_WIDTH * (1 - rowFraction);

          // Position the cell
          const x = radius * Math.cos(angle);
          const z = radius * Math.sin(angle);
          const y = Math.sin(RING_TILT) * radius * 0.1;

          dummy.position.set(x, y, z);

          // Orient cell to face outward from the ring center
          dummy.lookAt(0, y, 0);
          dummy.rotateY(Math.PI); // face outward

          dummy.updateMatrix();
          mesh.setMatrixAt(instanceIdx, dummy.matrix);

          // Color by activity
          const activity = dataRow ? (dataRow.bands[bandNames[col]] ?? 0) : 0;

          activityToColor(activity, tempColor);
          mesh.setColorAt(instanceIdx, tempColor);

          instanceIdx++;
        }
      }

      mesh.count = instanceIdx;

      if (instanceIdx > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
      }
    });

    return (
      <group name="spectrum-waterfall-ring" rotation={[RING_TILT, 0, 0]}>
        {/* Instanced cells */}
        <instancedMesh
          ref={meshRef}
          args={[cellGeometry, undefined, maxInstances]}
          frustumCulled={false}
        >
          <meshBasicMaterial
            transparent
            opacity={0.75}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            vertexColors
          />
        </instancedMesh>

        {/* Band labels around the ring */}
        {bandLabelPositions.map((pos, i) => (
          <Html
            key={bandNames[i]}
            position={pos}
            center
            zIndexRange={[1, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div
              className="px-1 py-0.5 rounded text-[8px] font-mono whitespace-nowrap"
              style={{
                backgroundColor: "rgba(0, 10, 20, 0.8)",
                color: "#88ccff",
                border: "1px solid rgba(100, 180, 255, 0.3)",
              }}
            >
              {bandNames[i]}
            </div>
          </Html>
        ))}
      </group>
    );
  },
);

export default SpectrumWaterfallRing3D;

/**
 * SpectrumWaterfallRing3D
 *
 * Renders a cylindrical waterfall display orbiting the globe at the equator,
 * showing band activity over time. Each column represents an amateur band,
 * and each row represents a time slice. Newer data appears at the outer edge
 * and scrolls inward as time passes.
 *
 * Uses InstancedMesh with rectangular patches laid flat on the ring surface
 * so they are visible from the typical above-oblique viewing angle.
 * Color intensity maps from quiet (dark blue) to active (bright yellow/white).
 *
 * Accepts all data as props -- no direct hook imports.
 */

import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useActiveBand } from "@/hooks/useActiveBandMode";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

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

/** Inner radius of the ring (distance from globe center) */
const RING_INNER_RADIUS = 1.18;

/** Ring radial width — generous so the waterfall is clearly visible */
const RING_WIDTH = 0.22;

/** Outer radius (computed) */
const RING_OUTER_RADIUS = RING_INNER_RADIUS + RING_WIDTH;

/** Maximum visible time rows */
const MAX_TIME_ROWS = 20;

/** Tilt from equatorial plane for better 3D visibility (radians) */
const RING_TILT = (10 * Math.PI) / 180;

/** Small gap between cells for the grid look (fraction of cell size) */
const GAP_FRACTION = 0.08;

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

    // Active band for highlighting the corresponding column
    const activeBand = useActiveBand();
    const activeBandIndex = bandNames.indexOf(activeBand);

    const numBands = bandNames.length;
    const numDataRows = Math.min(bandActivity.length, MAX_TIME_ROWS);
    const hasRenderableData = numBands > 0 && numDataRows > 0;
    const maxInstances = Math.max(1, numBands * MAX_TIME_ROWS);

    // Angular width of each band cell (in radians)
    const cellAngle = numBands > 0 ? (Math.PI * 2) / numBands : 0;

    // Cell geometry: a flat plane that will be laid on the ring surface.
    // Width = arc length for the band column (with gap).
    // Height = radial extent for one time row (with gap).
    const cellGeometry = useMemo(() => {
      if (numBands === 0) {
        return new THREE.PlaneGeometry(0.001, 0.001);
      }
      const rowHeight = RING_WIDTH / MAX_TIME_ROWS;
      const arcWidth = cellAngle * RING_INNER_RADIUS;
      return new THREE.PlaneGeometry(
        arcWidth * (1 - GAP_FRACTION),
        rowHeight * (1 - GAP_FRACTION),
      );
    }, [cellAngle, numBands]);

    useEffect(() => {
      return () => {
        cellGeometry.dispose();
      };
    }, [cellGeometry]);

    // Band label positions around the outer edge of the ring
    const bandLabelPositions = useMemo(() => {
      return bandNames.map((_, i) => {
        const angle = cellAngle * i + cellAngle * 0.5;
        const labelRadius = RING_OUTER_RADIUS + 0.03;
        const x = labelRadius * Math.cos(angle);
        const z = labelRadius * Math.sin(angle);
        return new THREE.Vector3(x, 0, z);
      });
    }, [bandNames, cellAngle]);

    // Rebuild instances only when data or the highlighted band changes.
    useEffect(() => {
      const mesh = meshRef.current;
      if (!mesh) return;

      if (!hasRenderableData) {
        mesh.count = 0;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
        return;
      }

      let instanceIdx = 0;
      const rowHeight = RING_WIDTH / MAX_TIME_ROWS;

      // Take the most recent rows — newest first so row 0 = newest = outermost
      const recentRows = bandActivity.slice(-MAX_TIME_ROWS);
      const rowCount = recentRows.length;

      for (let row = 0; row < MAX_TIME_ROWS; row++) {
        for (let col = 0; col < numBands; col++) {
          if (instanceIdx >= maxInstances) break;

          // Angle for this band column (center of the cell)
          const angle = cellAngle * col + cellAngle * 0.5;

          // Radial position: row 0 = newest = outer edge, higher rows = older = inner
          const radius = RING_OUTER_RADIUS - rowHeight * 0.5 - rowHeight * row;

          // Position flat on the XZ plane (group rotation handles tilt)
          const x = radius * Math.cos(angle);
          const z = radius * Math.sin(angle);

          dummy.position.set(x, 0, z);
          dummy.scale.set(1, 1, 1);

          // Orient cell flat on the ring surface:
          // 1. Rx(-PI/2): lay the XY plane into XZ (normal faces +Y)
          // 2. Ry(angle + PI/2): spin around vertical so cell width aligns
          //    with the arc tangent at this angular position
          // Euler order 'XYZ': M = Rz * Ry * Rx, Rx applied first.
          dummy.rotation.set(-Math.PI / 2, angle + Math.PI / 2, 0);

          dummy.updateMatrix();
          mesh.setMatrixAt(instanceIdx, dummy.matrix);

          // Color: data rows with activity get colored, empty rows/bands are skipped
          // recentRows is ordered oldest-first from .slice(), so map row index:
          // row 0 (outermost/newest) = recentRows[rowCount - 1]
          const dataIdx = rowCount - 1 - row;
          const dataRow = dataIdx >= 0 ? recentRows[dataIdx] : null;

          if (dataRow) {
            const activity = dataRow.bands[bandNames[col]] ?? 0;
            if (activity <= 0) continue; // Skip empty bands — no black squares
            activityToColor(activity, tempColor);
          } else {
            continue; // No data row — skip entirely
          }

          // Dim non-active band columns when an active band is set
          if (activeBandIndex >= 0 && col !== activeBandIndex) {
            tempColor.multiplyScalar(0.35);
          }

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
    }, [
      activeBandIndex,
      bandActivity,
      bandNames,
      cellAngle,
      hasRenderableData,
      maxInstances,
      numBands,
    ]);

    // Early exit
    if (!hasRenderableData) return null;

    return (
      <group name="spectrum-waterfall-ring" rotation={[RING_TILT, 0, 0]}>
        {/* Instanced cells */}
        <instancedMesh
          ref={meshRef}
          args={[cellGeometry, undefined, maxInstances]}
          frustumCulled={false}
          renderOrder={GLOBE_LAYER_ORDER.hud + 0.1}
        >
          <meshBasicMaterial
            transparent
            opacity={0.75}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
            vertexColors
          />
        </instancedMesh>

        {/* Band labels around the outer edge — active band highlighted */}
        {bandLabelPositions.map((pos, i) => {
          const isActive = i === activeBandIndex;
          return (
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
                  backgroundColor: isActive
                    ? "rgba(0, 30, 50, 0.95)"
                    : "rgba(0, 10, 20, 0.8)",
                  color: isActive ? "#ffee44" : "#88ccff",
                  border: isActive
                    ? "1px solid rgba(255, 238, 68, 0.6)"
                    : "1px solid rgba(100, 180, 255, 0.3)",
                  boxShadow: isActive
                    ? "0 0 8px rgba(255, 238, 68, 0.4)"
                    : "none",
                  fontWeight: isActive ? 700 : 400,
                }}
              >
                {bandNames[i]}
              </div>
            </Html>
          );
        })}
      </group>
    );
  },
);

export default SpectrumWaterfallRing3D;

/**
 * APRSOverlay3D
 *
 * Renders nearby APRS station markers on the 3D globe using a single
 * InstancedMesh of green spheres. Designed for moderate-count scenarios
 * (up to 2000 stations) without creating individual mesh objects per station.
 *
 * Visual behaviour:
 * - Constant-size green spheres at each APRS station location
 * - Semi-transparent with no depth write for clean blending
 *
 * The component is memoised on the `stations` array reference to avoid
 * unnecessary React reconciliation; all per-frame work happens in useFrame.
 */

import React, { useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { APRSStation } from "@/lib/api/aprs";
import { latLonTo3D } from "@/components/map/lib/globeCoords";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on rendered instances to prevent GPU overload */
const MAX_INSTANCES = 2000;

/** Globe-surface radius for station placement (matches other overlays) */
const GLOBE_RADIUS = 1.006;

/** Constant sphere scale for all APRS markers */
const MARKER_SCALE = 0.003;

// ---------------------------------------------------------------------------
// Module-level dummy -- reused every frame, never recreated
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface APRSOverlay3DProps {
  stations: APRSStation[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const APRSOverlay3D = React.memo(
  function APRSOverlay3D({ stations }: APRSOverlay3DProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Cache positions so latLonTo3D is only recomputed when data changes
    const lastStationsRef = useRef(stations);
    // Stores [x, y, z] per visible station
    const cachedDataRef = useRef<Float32Array | null>(null);
    const cachedCountRef = useRef(0);

    const recomputeCache = useCallback((items: APRSStation[]) => {
      const count = Math.min(items.length, MAX_INSTANCES);
      const data = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        const s = items[i];
        const [x, y, z] = latLonTo3D(s.lat, s.lon, GLOBE_RADIUS);
        const offset = i * 3;
        data[offset] = x;
        data[offset + 1] = y;
        data[offset + 2] = z;
      }

      cachedDataRef.current = data;
      cachedCountRef.current = count;
      lastStationsRef.current = items;
    }, []);

    // Per-frame update -- positions, scales, and counts
    useFrame(() => {
      const mesh = meshRef.current;
      if (!mesh) return;

      // Recompute positions only when the stations array reference changes
      if (stations !== lastStationsRef.current || !cachedDataRef.current) {
        recomputeCache(stations);
      }

      const cachedData = cachedDataRef.current!;
      const cachedCount = cachedCountRef.current;

      for (let i = 0; i < cachedCount; i++) {
        const offset = i * 3;
        dummy.position.set(
          cachedData[offset],
          cachedData[offset + 1],
          cachedData[offset + 2],
        );
        dummy.scale.setScalar(MARKER_SCALE);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }

      // Update instance count and flag the buffer dirty
      mesh.count = cachedCount;

      if (cachedCount > 0) {
        mesh.instanceMatrix.needsUpdate = true;
      }
    });

    // Nothing to render -- avoid allocating GPU resources
    if (stations.length === 0) return null;

    return (
      <group name="aprs-overlay">
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={3}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#22c55e"
            transparent
            opacity={0.6}
            depthWrite={false}
          />
        </instancedMesh>
      </group>
    );
  },
  // Custom comparator: only re-render when the stations array reference changes
  (prev, next) => prev.stations === next.stations,
);

export default APRSOverlay3D;

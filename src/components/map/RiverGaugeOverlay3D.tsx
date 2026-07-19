/**
 * RiverGaugeOverlay3D
 *
 * Renders USGS river gauge markers on the 3D globe using colour-coded
 * InstancedMesh spheres. Each gauge is coloured according to its flood
 * status using per-instance vertex colours (instanceColor attribute).
 *
 * Two InstancedMesh layers provide visual depth:
 * - Outer glow: additive blending, low opacity, status colour
 * - Inner core: higher opacity, status colour
 *
 * Color mapping by flood status:
 * - normal  -> green   #22c55e
 * - action  -> yellow  #eab308
 * - minor   -> orange  #f97316
 * - moderate -> red    #ef4444
 * - major   -> dark red #991b1b
 *
 * The component is memoised on the `gauges` array reference to avoid
 * unnecessary React reconciliation; all per-frame work happens in useFrame.
 */

import React, { useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { RiverGauge } from "@/lib/api/gauges";
import { latLonTo3D } from "@/components/map/lib/globeCoords";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on rendered instances to prevent GPU overload */
const MAX_INSTANCES = 1000;

/** Globe-surface radius for gauge placement (matches other overlays) */
const GLOBE_RADIUS = 1.006;

/** Constant sphere scale for all gauge markers */
const MARKER_SCALE = 0.004;

// ---------------------------------------------------------------------------
// Flood status colour map
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<RiverGauge["floodStatus"], THREE.Color> = {
  normal: new THREE.Color("#22c55e"),
  action: new THREE.Color("#eab308"),
  minor: new THREE.Color("#f97316"),
  moderate: new THREE.Color("#ef4444"),
  major: new THREE.Color("#991b1b"),
};

// ---------------------------------------------------------------------------
// Module-level dummy -- reused every frame, never recreated
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RiverGaugeOverlay3DProps {
  gauges: RiverGauge[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RiverGaugeOverlay3D = React.memo(
  function RiverGaugeOverlay3D({ gauges }: RiverGaugeOverlay3DProps) {
    const glowRef = useRef<THREE.InstancedMesh>(null);
    const coreRef = useRef<THREE.InstancedMesh>(null);

    // Cache positions and colours so latLonTo3D is only recomputed on data change
    const lastGaugesRef = useRef(gauges);
    // Stores [x, y, z] per gauge
    const cachedPosRef = useRef<Float32Array | null>(null);
    // Stores [r, g, b] per gauge for instance colours
    const cachedColorsRef = useRef<Float32Array | null>(null);
    const cachedCountRef = useRef(0);

    const recomputeCache = useCallback((items: RiverGauge[]) => {
      const count = Math.min(items.length, MAX_INSTANCES);
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        const g = items[i];
        const [x, y, z] = latLonTo3D(g.lat, g.lon, GLOBE_RADIUS);
        const posOffset = i * 3;
        positions[posOffset] = x;
        positions[posOffset + 1] = y;
        positions[posOffset + 2] = z;

        const color = STATUS_COLORS[g.floodStatus] ?? STATUS_COLORS.normal;
        colors[posOffset] = color.r;
        colors[posOffset + 1] = color.g;
        colors[posOffset + 2] = color.b;
      }

      cachedPosRef.current = positions;
      cachedColorsRef.current = colors;
      cachedCountRef.current = count;
      lastGaugesRef.current = items;
    }, []);

    // Per-frame update -- positions, colours, scales, and counts
    useFrame(() => {
      const glowMesh = glowRef.current;
      const coreMesh = coreRef.current;
      if (!glowMesh || !coreMesh) return;

      // Recompute positions only when the gauges array reference changes
      if (gauges !== lastGaugesRef.current || !cachedPosRef.current) {
        recomputeCache(gauges);
      }

      const positions = cachedPosRef.current!;
      const colors = cachedColorsRef.current!;
      const cachedCount = cachedCountRef.current;

      const tempColor = new THREE.Color();

      for (let i = 0; i < cachedCount; i++) {
        const posOffset = i * 3;
        const x = positions[posOffset];
        const y = positions[posOffset + 1];
        const z = positions[posOffset + 2];

        // --- Outer glow instance ---
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(MARKER_SCALE);
        dummy.updateMatrix();
        glowMesh.setMatrixAt(i, dummy.matrix);

        // --- Inner core instance (slightly smaller) ---
        dummy.scale.setScalar(MARKER_SCALE * 0.5);
        dummy.updateMatrix();
        coreMesh.setMatrixAt(i, dummy.matrix);

        // --- Per-instance colour ---
        tempColor.setRGB(
          colors[posOffset],
          colors[posOffset + 1],
          colors[posOffset + 2],
        );
        glowMesh.setColorAt(i, tempColor);
        coreMesh.setColorAt(i, tempColor);
      }

      // Update instance counts and flag buffers dirty
      glowMesh.count = cachedCount;
      coreMesh.count = cachedCount;

      if (cachedCount > 0) {
        glowMesh.instanceMatrix.needsUpdate = true;
        coreMesh.instanceMatrix.needsUpdate = true;
        if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
        if (coreMesh.instanceColor) coreMesh.instanceColor.needsUpdate = true;
      }
    });

    // Nothing to render -- avoid allocating GPU resources
    if (gauges.length === 0) return null;

    return (
      <group name="river-gauge-overlay">
        {/* Outer glow -- status-coloured, additive blending, low opacity */}
        <instancedMesh
          ref={glowRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={GLOBE_LAYER_ORDER.markers}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#ffffff"
            vertexColors
            transparent
            opacity={0.3}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
          />
        </instancedMesh>

        {/* Inner core -- status-coloured, higher opacity */}
        <instancedMesh
          ref={coreRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={GLOBE_LAYER_ORDER.markers}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#ffffff"
            vertexColors
            transparent
            opacity={0.7}
            depthWrite={false}
            depthTest={false}
          />
        </instancedMesh>
      </group>
    );
  },
  // Custom comparator: only re-render when the gauges array reference changes
  (prev, next) => prev.gauges === next.gauges,
);

export default RiverGaugeOverlay3D;

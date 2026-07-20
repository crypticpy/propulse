/**
 * TropicalCycloneOverlay3D
 *
 * Renders active tropical cyclones on the 3D globe using two InstancedMesh
 * layers (glow + core) for storm position markers, THREE.Line for forecast
 * tracks, and @react-three/drei Text for storm name labels.
 *
 * Visual behaviour:
 * - Marker color mapped to Saffir-Simpson category (TD blue through Cat5 dark red)
 * - Marker scale increases with storm intensity
 * - Outer glow layer spins slowly to convey rotational energy
 * - Forecast tracks rendered as translucent lines above the globe surface
 * - Storm labels float above markers showing name + category
 *
 * The component is memoised on the `cyclones` array reference to avoid
 * unnecessary React reconciliation; all per-frame work happens in useFrame.
 */

import React, { useRef, useCallback, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";
import type { TropicalCyclone, StormCategory } from "@/lib/api/tropical";
import { latLonTo3D } from "@/components/map/lib/globeCoords";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on rendered instances -- worldwide max concurrent storms is ~8 */
const MAX_INSTANCES = 20;

/** Globe-surface radius for storm placement (matches other overlays) */
const GLOBE_RADIUS = 1.006;

/** Slight elevation for forecast track lines so they float above terrain */
const TRACK_RADIUS = GLOBE_RADIUS + 0.002;

/** Elevation for storm name labels above the marker */
const LABEL_RADIUS = GLOBE_RADIUS + 0.02;

// ---------------------------------------------------------------------------
// Color + scale maps by Saffir-Simpson category
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<StormCategory, THREE.Color> = {
  TD: new THREE.Color("#3b82f6"),
  TS: new THREE.Color("#eab308"),
  "1": new THREE.Color("#f97316"),
  "2": new THREE.Color("#f97316"),
  "3": new THREE.Color("#ef4444"),
  "4": new THREE.Color("#dc2626"),
  "5": new THREE.Color("#991b1b"),
};

const CATEGORY_SCALE: Record<StormCategory, number> = {
  TD: 0.008,
  TS: 0.01,
  "1": 0.012,
  "2": 0.012,
  "3": 0.015,
  "4": 0.015,
  "5": 0.018,
};

/** Human-readable category label */
function categoryLabel(cat: StormCategory): string {
  if (cat === "TD") return "TD";
  if (cat === "TS") return "TS";
  return `Cat ${cat}`;
}

// ---------------------------------------------------------------------------
// Module-level dummy -- reused every frame, never recreated
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();

// ---------------------------------------------------------------------------
// Inner component: ForecastTrackLine
// ---------------------------------------------------------------------------

interface ForecastTrackLineProps {
  cyclone: TropicalCyclone;
}

function ForecastTrackLine({ cyclone }: ForecastTrackLineProps) {
  const { forecastTrack, category, lat, lon } = cyclone;

  const geometry = useMemo(() => {
    // Build track including the current position as the first point
    const points: [number, number, number][] = [
      latLonTo3D(lat, lon, TRACK_RADIUS),
    ];
    for (const pt of forecastTrack) {
      points.push(latLonTo3D(pt.lat, pt.lon, TRACK_RADIUS));
    }

    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positions[i * 3] = points[i][0];
      positions[i * 3 + 1] = points[i][1];
      positions[i * 3 + 2] = points[i][2];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [forecastTrack, lat, lon]);

  const material = useMemo(() => {
    const color = CATEGORY_COLORS[category];
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      depthTest: false,
    });
  }, [category]);

  return (
    <primitive
      object={new THREE.Line(geometry, material)}
      renderOrder={GLOBE_LAYER_ORDER.markers}
    />
  );
}

// ---------------------------------------------------------------------------
// Inner component: StormLabel
// ---------------------------------------------------------------------------

interface StormLabelProps {
  cyclone: TropicalCyclone;
}

function StormLabel({ cyclone }: StormLabelProps) {
  const [x, y, z] = latLonTo3D(cyclone.lat, cyclone.lon, LABEL_RADIUS);

  return (
    <Text
      position={[x, y, z]}
      fontSize={0.02}
      color="#ffffff"
      anchorX="center"
      anchorY="bottom"
      outlineWidth={0.002}
      outlineColor="#000000"
      renderOrder={GLOBE_LAYER_ORDER.markers + 0.2}
      font={undefined}
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      {...({ "material-depthTest": false } as any)}
    >
      {`${cyclone.name} ${categoryLabel(cyclone.category)}`}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TropicalCycloneOverlay3DProps {
  cyclones: TropicalCyclone[];
}

export const TropicalCycloneOverlay3D = React.memo(
  function TropicalCycloneOverlay3D({
    cyclones,
  }: TropicalCycloneOverlay3DProps) {
    const glowRef = useRef<THREE.InstancedMesh>(null);
    const coreRef = useRef<THREE.InstancedMesh>(null);

    // Cache positions so latLonTo3D is only recomputed when data changes
    const lastCyclonesRef = useRef(cyclones);
    // Stores [x, y, z, glowScale, coreScale, colorR, colorG, colorB] per storm
    const cachedDataRef = useRef<Float32Array | null>(null);
    const cachedCountRef = useRef(0);

    const recomputeCache = useCallback((storms: TropicalCyclone[]) => {
      const count = Math.min(storms.length, MAX_INSTANCES);
      // 8 floats per storm: x, y, z, glowScale, coreScale, r, g, b
      const data = new Float32Array(count * 8);

      for (let i = 0; i < count; i++) {
        const storm = storms[i];
        const [x, y, z] = latLonTo3D(storm.lat, storm.lon, GLOBE_RADIUS);
        const scale = CATEGORY_SCALE[storm.category];
        const color = CATEGORY_COLORS[storm.category];

        const offset = i * 8;
        data[offset] = x;
        data[offset + 1] = y;
        data[offset + 2] = z;
        data[offset + 3] = scale * 1.8; // glow layer is larger
        data[offset + 4] = scale; // core layer
        data[offset + 5] = color.r;
        data[offset + 6] = color.g;
        data[offset + 7] = color.b;
      }

      cachedDataRef.current = data;
      cachedCountRef.current = count;
      lastCyclonesRef.current = storms;
    }, []);

    // Per-frame update: positions, scales, spinning glow animation, vertex colors
    useFrame(({ clock }) => {
      const glowMesh = glowRef.current;
      const coreMesh = coreRef.current;
      if (!glowMesh || !coreMesh) return;

      // Recompute positions only when the cyclones array reference changes
      if (cyclones !== lastCyclonesRef.current || !cachedDataRef.current) {
        recomputeCache(cyclones);
      }

      const cachedData = cachedDataRef.current!;
      const cachedCount = cachedCountRef.current;
      const elapsed = clock.getElapsedTime();

      const tmpColor = new THREE.Color();

      for (let i = 0; i < cachedCount; i++) {
        const offset = i * 8;
        const x = cachedData[offset];
        const y = cachedData[offset + 1];
        const z = cachedData[offset + 2];
        const glowScale = cachedData[offset + 3];
        const coreScale = cachedData[offset + 4];
        const r = cachedData[offset + 5];
        const g = cachedData[offset + 6];
        const b = cachedData[offset + 7];

        // Spinning animation for glow layer -- slow rotation around local axis
        const spin = elapsed * 0.8 + i * 1.5;
        const pulse = 1 + 0.15 * Math.sin(elapsed * 2 + i * 2.1);

        // --- Outer glow instance ---
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, spin, 0);
        dummy.scale.setScalar(glowScale * pulse);
        dummy.updateMatrix();
        glowMesh.setMatrixAt(i, dummy.matrix);

        // --- Inner core instance (no spin, subtle pulse) ---
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(
          coreScale * (1 + 0.05 * Math.sin(elapsed * 3 + i)),
        );
        dummy.updateMatrix();
        coreMesh.setMatrixAt(i, dummy.matrix);

        // Set per-instance vertex colors
        tmpColor.setRGB(r, g, b);
        glowMesh.setColorAt(i, tmpColor);
        coreMesh.setColorAt(i, tmpColor);
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
    if (cyclones.length === 0) return null;

    return (
      <group name="tropical-cyclone-overlay">
        {/* Storm position markers -- glow layer (additive blending) */}
        <instancedMesh
          ref={glowRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={GLOBE_LAYER_ORDER.markers + 0.1}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0.4}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
          />
        </instancedMesh>

        {/* Storm position markers -- core layer */}
        <instancedMesh
          ref={coreRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={GLOBE_LAYER_ORDER.markers + 0.1}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial
            vertexColors
            transparent
            opacity={0.85}
            depthWrite={false}
            depthTest={false}
          />
        </instancedMesh>

        {/* Forecast tracks */}
        {cyclones.map(
          (c) =>
            c.forecastTrack.length > 1 && (
              <ForecastTrackLine key={`track-${c.id}`} cyclone={c} />
            ),
        )}

        {/* Storm name labels */}
        {cyclones.map((c) => (
          <StormLabel key={`label-${c.id}`} cyclone={c} />
        ))}
      </group>
    );
  },
  (prev, next) => prev.cyclones === next.cyclones,
);

export default TropicalCycloneOverlay3D;

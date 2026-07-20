/**
 * FireOverlay3D
 *
 * Renders active fire hotspot markers on the 3D globe using two InstancedMesh
 * layers: an outer orange glow and an inner deep red-orange core. Designed
 * for high-count scenarios (5000+ simultaneous hotspots) without creating
 * individual mesh objects per hotspot.
 *
 * Visual behaviour:
 * - Scale based on fire radiative power (FRP)
 * - Low-confidence detections are filtered out
 * - Outer glow has a subtle flicker animation
 *
 * The component is memoised on the `hotspots` array reference to avoid
 * unnecessary React reconciliation; all per-frame work happens in useFrame.
 */

import React, { useRef, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { FireHotspot } from "@/lib/api/fires";
import { latLonTo3D } from "@/components/map/lib/globeCoords";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on rendered instances to prevent GPU overload */
const MAX_INSTANCES = 5000;

/** Globe-surface radius for hotspot placement (matches other overlays) */
const GLOBE_RADIUS = 1.006;

/** Minimum pick radius (world units) so small fires stay clickable */
const MIN_PICK_RADIUS = 0.015;

// ---------------------------------------------------------------------------
// Module-level dummies -- reused every frame/raycast, never recreated
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();
const pickPoint = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FireOverlay3DProps {
  hotspots: FireHotspot[];
  /** Called when a hotspot marker is clicked, with viewport screen coords */
  onFireClick?: (
    hotspot: FireHotspot,
    screenPos: { x: number; y: number },
  ) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FireOverlay3D = React.memo(
  function FireOverlay3D({ hotspots, onFireClick }: FireOverlay3DProps) {
    const glowRef = useRef<THREE.InstancedMesh>(null);
    const coreRef = useRef<THREE.InstancedMesh>(null);

    // Bug 30: Cache positions so latLonTo3D is only recomputed when data changes
    const lastHotspotsRef = useRef(hotspots);
    // Stores [x, y, z, size, originalIndex] per visible hotspot
    const cachedDataRef = useRef<Float32Array | null>(null);
    const cachedCountRef = useRef(0);

    const recomputeCache = useCallback((hotspotsArr: FireHotspot[]) => {
      // Count visible hotspots first (skip low-confidence)
      let visibleCount = 0;
      for (
        let i = 0;
        i < hotspotsArr.length && visibleCount < MAX_INSTANCES;
        i++
      ) {
        const h = hotspotsArr[i];
        if (h.confidence !== "low" && h.confidence !== "l") visibleCount++;
      }

      const data = new Float32Array(visibleCount * 5);
      let slot = 0;

      for (let i = 0; i < hotspotsArr.length && slot < visibleCount; i++) {
        const hotspot = hotspotsArr[i];
        if (hotspot.confidence === "low" || hotspot.confidence === "l")
          continue;

        const [x, y, z] = latLonTo3D(hotspot.lat, hotspot.lon, GLOBE_RADIUS);
        const size = Math.max(0.002, Math.min(0.008, hotspot.frp / 500));

        const offset = slot * 5;
        data[offset] = x;
        data[offset + 1] = y;
        data[offset + 2] = z;
        data[offset + 3] = size;
        data[offset + 4] = i; // original index for flicker phase offset
        slot++;
      }

      cachedDataRef.current = data;
      cachedCountRef.current = slot;
      lastHotspotsRef.current = hotspotsArr;
    }, []);

    // Per-frame update -- positions, scales, flicker animation, and counts
    useFrame(({ clock }) => {
      const glowMesh = glowRef.current;
      const coreMesh = coreRef.current;
      if (!glowMesh || !coreMesh) return;

      // Recompute positions only when the hotspots array reference changes
      if (hotspots !== lastHotspotsRef.current || !cachedDataRef.current) {
        recomputeCache(hotspots);
      }

      const cachedData = cachedDataRef.current!;
      const cachedCount = cachedCountRef.current;
      const elapsed = clock.getElapsedTime();

      for (let slot = 0; slot < cachedCount; slot++) {
        const offset = slot * 5;
        const x = cachedData[offset];
        const y = cachedData[offset + 1];
        const z = cachedData[offset + 2];
        const size = cachedData[offset + 3];
        const origIdx = cachedData[offset + 4];

        // Flicker animation for the outer glow
        const flicker = 0.9 + 0.2 * Math.sin(elapsed * 8 + origIdx * 3.7);

        // --- Outer glow instance ---
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(size * flicker);
        dummy.updateMatrix();
        glowMesh.setMatrixAt(slot, dummy.matrix);

        // --- Inner core instance (no flicker, slightly smaller) ---
        dummy.scale.setScalar(size * 0.5);
        dummy.updateMatrix();
        coreMesh.setMatrixAt(slot, dummy.matrix);
      }

      // Update instance counts and flag the buffers dirty
      glowMesh.count = cachedCount;
      coreMesh.count = cachedCount;

      if (cachedCount > 0) {
        glowMesh.instanceMatrix.needsUpdate = true;
        coreMesh.instanceMatrix.needsUpdate = true;
      }
    });

    // Analytic picking: the default InstancedMesh raycast intersects every
    // triangle of all 5000 sphere instances on each pointer event, which is
    // far too slow. Instead, treat each cached hotspot as a point and pick
    // the near-side one closest to the pointer ray within a generous radius.
    const pickRaycast = useCallback(
      function (
        this: THREE.InstancedMesh,
        raycaster: THREE.Raycaster,
        intersects: THREE.Intersection[],
      ) {
        const data = cachedDataRef.current;
        if (!data) return;

        const ray = raycaster.ray;
        let bestSlot = -1;
        let bestRayDist = Infinity;
        let bestDist = 0;

        for (let slot = 0; slot < cachedCountRef.current; slot++) {
          const offset = slot * 5;
          pickPoint.set(data[offset], data[offset + 1], data[offset + 2]);

          // Skip hotspots on the far side of the globe (behind the horizon
          // as seen from the ray origin, i.e. the camera).
          if (pickPoint.dot(ray.origin) < 1.0) continue;

          const rayDist = ray.distanceToPoint(pickPoint);
          const pickRadius = Math.max(data[offset + 3] * 3, MIN_PICK_RADIUS);
          if (rayDist < pickRadius && rayDist < bestRayDist) {
            bestRayDist = rayDist;
            bestDist = ray.origin.distanceTo(pickPoint);
            bestSlot = slot;
          }
        }

        if (bestSlot >= 0) {
          const offset = bestSlot * 5;
          intersects.push({
            distance: bestDist,
            point: new THREE.Vector3(
              data[offset],
              data[offset + 1],
              data[offset + 2],
            ),
            object: this,
            instanceId: bestSlot,
          } as THREE.Intersection);
        }
      },
      [],
    );

    const handleClick = useCallback(
      (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (!onFireClick || e.instanceId === undefined) return;
        const data = cachedDataRef.current;
        if (!data) return;
        const origIdx = data[e.instanceId * 5 + 4];
        const hotspot = hotspots[origIdx];
        if (!hotspot) return;
        onFireClick(hotspot, {
          x: e.nativeEvent.clientX,
          y: e.nativeEvent.clientY,
        });
      },
      [hotspots, onFireClick],
    );

    const handlePointerOver = useCallback(() => {
      document.body.style.cursor = "pointer";
    }, []);
    const handlePointerOut = useCallback(() => {
      document.body.style.cursor = "";
    }, []);

    // Nothing to render -- avoid allocating GPU resources
    if (hotspots.length === 0) return null;

    return (
      <group name="fire-overlay">
        {/* Outer glow -- orange, additive blending, low opacity.
            Unlike the tangent-disc overlays, these are genuine solid
            spheres centered at GLOBE_RADIUS (1.006) with radius up to
            0.008 -- the camera-facing hemisphere spans roughly 1.006 to
            1.014, well clear of the base globe surface (radius 1.0), so
            depthTest (left at its material default of true) correctly
            passes without the tangent-plane depth-discard bug. Depth
            writing stays off so overlapping hotspots/other transparent
            layers still blend. renderOrder still needs to follow the
            contract so this sits correctly relative to other surfaceArea
            layers and the surfaceTexture layers below it. */}
        <instancedMesh
          ref={glowRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={GLOBE_LAYER_ORDER.surfaceArea}
          raycast={pickRaycast}
          onClick={onFireClick ? handleClick : undefined}
          onPointerOver={onFireClick ? handlePointerOver : undefined}
          onPointerOut={onFireClick ? handlePointerOut : undefined}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#ff6600"
            transparent
            opacity={0.3}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </instancedMesh>

        {/* Inner core -- deep red-orange, higher opacity */}
        <instancedMesh
          ref={coreRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={GLOBE_LAYER_ORDER.surfaceArea + 0.1}
        >
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial
            color="#ff2200"
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        </instancedMesh>
      </group>
    );
  },
  // Custom comparator: re-render only on hotspots/handler reference changes
  (prev, next) =>
    prev.hotspots === next.hotspots && prev.onFireClick === next.onFireClick,
);

export default FireOverlay3D;

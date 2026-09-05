/**
 * LightningOverlay3D
 *
 * Renders lightning strike markers on the 3D globe as a single InstancedMesh
 * of camera-facing bolt-glyph billboards (see `src/lib/map/lightningGlyph.ts`
 * for the shared canvas-drawn icon also used by `LightningLayer2D`). Replaces
 * the previous additive-blended glow/core spheres + expanding ring, which
 * read as "giant bloomy white dots" rather than lightning (HamClock spec
 * §16 / batch B3, issue #199).
 *
 * Kept as one InstancedMesh (rather than a pool of individual THREE.Sprite
 * objects) to preserve this component's original high-count design goal —
 * 1000+ simultaneous strikes in a single draw call — while still producing
 * screen-space-sized billboards: each instance's world scale is computed
 * from camera distance and vertical FOV so it subtends a constant pixel
 * size regardless of zoom, the same visual result `sizeAttenuation: false`
 * gives a THREE.Sprite/Points material.
 *
 * Visual behaviour:
 * - Strikes fade from full brightness to 10% (0% visually, filtered out)
 *   over the last portion of the 10-minute rendering window
 * - Fresh strikes (< LIGHTNING_FRESH_WINDOW_MS old) pulse once, 1x -> 1.6x -> 1x scale,
 *   over LIGHTNING_PULSE_DURATION_MS, then settle at 1x for the remainder of the
 *   fresh window
 * - Once a strike ages out of the fresh window it stops pulsing and its
 *   brightness fades linearly toward LIGHTNING_FADED_BRIGHTNESS as it approaches the
 *   10-minute cutoff, where it is dropped entirely
 * - Strike size varies modestly by peak current (currentKA)
 * - Colour comes from the `--hc-warn` design token, resolved once per
 *   mount — never a hardcoded hex
 *
 * The component is memoised on the `strikes` array reference to avoid
 * unnecessary React reconciliation; all per-frame work happens in useFrame.
 */

import React, { useCallback, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { LightningStrike } from "@/lib/api/lightning";
import { latLonTo3D } from "@/components/map/lib/globeCoords";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import {
  getLightningGlyphTexture,
  resolveLightningTone,
  LIGHTNING_BASE_PIXEL_SIZE,
  LIGHTNING_FADED_BRIGHTNESS,
  LIGHTNING_FRESH_WINDOW_MS,
  LIGHTNING_MAX_AGE_MS,
  LIGHTNING_MAX_CURRENT_KA,
  LIGHTNING_MAX_SIZE_FACTOR,
  LIGHTNING_MIN_SIZE_FACTOR,
  LIGHTNING_PULSE_DURATION_MS,
  LIGHTNING_PULSE_PEAK,
} from "@/lib/map/lightningGlyph";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard cap on rendered instances to prevent GPU overload */
const MAX_INSTANCES = 2000;

/** Base globe-surface radius for strike placement — elevated into troposphere */
const GLOBE_RADIUS = 1.03;

/** Additional altitude for max-intensity strikes */
const ALTITUDE_SPREAD = 0.02;

/** Fallback vertical FOV (degrees) if the active camera isn't a
 * PerspectiveCamera — mirrors GlobeView's own fixed camera fov={45}. */
const DEFAULT_FOV_DEG = 45;

// ---------------------------------------------------------------------------
// Module-level reusables — reused every frame, never recreated
// ---------------------------------------------------------------------------

const dummy = new THREE.Object3D();
const tempColor = new THREE.Color();
/** World-space orientation of this mesh's parent (the tilt/spin group the
 * globe and its overlays live in) — billboards must cancel this rotation
 * out locally so they end up facing the camera in world space. */
const parentWorldQuat = new THREE.Quaternion();
const billboardQuat = new THREE.Quaternion();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a number between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LightningOverlay3DProps {
  strikes: LightningStrike[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const LightningOverlay3D = React.memo(
  function LightningOverlay3D({ strikes }: LightningOverlay3DProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Bug 30: Cache positions so latLonTo3D is only recomputed when data changes
    const lastStrikesRef = useRef(strikes);
    // Stores [x, y, z, intensity, normalizedKA, strikeRadius] per visible strike
    const cachedDataRef = useRef<Float32Array | null>(null);
    // Maps from visible strike index back to original strikes array index
    const cachedIndicesRef = useRef<Uint16Array | null>(null);

    // Tone read once per mount from the --hc-warn token (falls back to the
    // app's caution colour outside a themed HamClock ancestor).
    const tone = useMemo(() => resolveLightningTone(), []);
    const texture = useMemo(() => getLightningGlyphTexture(tone), [tone]);

    const recomputeCache = useCallback(
      (strikesArr: LightningStrike[], now: number) => {
        // Count visible strikes first
        let visibleCount = 0;
        for (
          let i = 0;
          i < strikesArr.length && visibleCount < MAX_INSTANCES;
          i++
        ) {
          const age = now - strikesArr[i].time;
          if (age <= LIGHTNING_MAX_AGE_MS) visibleCount++;
        }

        const data = new Float32Array(visibleCount * 6);
        const indices = new Uint16Array(visibleCount);
        let slot = 0;

        for (let i = 0; i < strikesArr.length && slot < visibleCount; i++) {
          const strike = strikesArr[i];
          const age = now - strike.time;
          if (age > LIGHTNING_MAX_AGE_MS) continue;

          const intensity = clamp(strike.currentKA / LIGHTNING_MAX_CURRENT_KA, 0.3, 1.0);
          const normalizedKA = clamp(strike.currentKA / LIGHTNING_MAX_CURRENT_KA, 0, 1);
          const strikeRadius = GLOBE_RADIUS + normalizedKA * ALTITUDE_SPREAD;
          const [x, y, z] = latLonTo3D(strike.lat, strike.lon, strikeRadius);

          const offset = slot * 6;
          data[offset] = x;
          data[offset + 1] = y;
          data[offset + 2] = z;
          data[offset + 3] = intensity;
          data[offset + 4] = normalizedKA;
          data[offset + 5] = strikeRadius;
          indices[slot] = i;
          slot++;
        }

        cachedDataRef.current = data;
        cachedIndicesRef.current = indices;
        lastStrikesRef.current = strikesArr;

        return { data, indices, visibleCount: slot };
      },
      [],
    );

    // Per-frame update — positions, scales, brightness, and counts
    useFrame((state) => {
      const mesh = meshRef.current;
      if (!mesh) return;

      const { camera, size } = state;
      const now = Date.now();

      // Recompute positions only when the strikes array reference changes
      if (strikes !== lastStrikesRef.current || !cachedDataRef.current) {
        recomputeCache(strikes, now);
      }

      const cachedData = cachedDataRef.current!;
      const cachedIndices = cachedIndicesRef.current!;
      const cachedCount = cachedIndices.length;
      let count = 0;

      // Billboards must face the camera in world space, but this mesh's
      // transform is local to the globe's tilt/spin group — cancel that
      // group's world rotation out so the local quaternion resolves back to
      // the camera's world orientation (same principle as inverting
      // matrixWorld for hand-rolled globe raycasts).
      if (mesh.parent) {
        mesh.parent.getWorldQuaternion(parentWorldQuat);
        billboardQuat.copy(parentWorldQuat).invert().multiply(camera.quaternion);
      } else {
        billboardQuat.copy(camera.quaternion);
      }

      // Pixels -> world units at unit distance, for the active camera's FOV.
      const fovDeg =
        camera instanceof THREE.PerspectiveCamera ? camera.fov : DEFAULT_FOV_DEG;
      const pixelToWorld =
        (2 * Math.tan((fovDeg * Math.PI) / 360)) / size.height;

      for (let slot = 0; slot < cachedCount; slot++) {
        const strikeIdx = cachedIndices[slot];
        const strike = strikes[strikeIdx];
        const age = now - strike.time;

        // Skip strikes that have fully faded since the cache was built
        if (age > LIGHTNING_MAX_AGE_MS) continue;

        const offset = slot * 6;
        const x = cachedData[offset];
        const y = cachedData[offset + 1];
        const z = cachedData[offset + 2];
        const intensity = cachedData[offset + 3];

        // One-time pulse on arrival: 1 -> 1 + LIGHTNING_PULSE_PEAK -> 1 over
        // LIGHTNING_PULSE_DURATION_MS, then settle at 1x for the rest of the fresh
        // window.
        const pulsing = age < LIGHTNING_PULSE_DURATION_MS;
        const pulseScale = pulsing
          ? 1 + LIGHTNING_PULSE_PEAK * Math.sin(Math.PI * (age / LIGHTNING_PULSE_DURATION_MS))
          : 1;

        // Fresh strikes stay at full brightness; once they age out of the
        // fresh window, brightness eases down toward LIGHTNING_FADED_BRIGHTNESS as
        // they approach the fade cutoff.
        const isFresh = age < LIGHTNING_FRESH_WINDOW_MS;
        const brightness = isFresh
          ? 1
          : 1 -
            clamp(
              (age - LIGHTNING_FRESH_WINDOW_MS) / (LIGHTNING_MAX_AGE_MS - LIGHTNING_FRESH_WINDOW_MS),
              0,
              1,
            ) *
              (1 - LIGHTNING_FADED_BRIGHTNESS);

        const sizeFactor =
          LIGHTNING_MIN_SIZE_FACTOR + intensity * (LIGHTNING_MAX_SIZE_FACTOR - LIGHTNING_MIN_SIZE_FACTOR);
        const pixelSize = LIGHTNING_BASE_PIXEL_SIZE * sizeFactor * pulseScale;

        dummy.position.set(x, y, z);
        const distance = dummy.position.distanceTo(camera.position);
        const worldScale = pixelSize * pixelToWorld * distance;

        dummy.quaternion.copy(billboardQuat);
        dummy.scale.setScalar(worldScale);
        dummy.updateMatrix();
        mesh.setMatrixAt(count, dummy.matrix);

        // Brightness is encoded as a grayscale instance colour so it
        // modulates the texture's baked tone without shifting its hue —
        // InstancedMesh has no native per-instance opacity.
        tempColor.setScalar(brightness);
        mesh.setColorAt(count, tempColor);

        count++;
      }

      mesh.count = count;
      if (count > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
      }
    });

    // Nothing to render — avoid allocating GPU resources
    if (strikes.length === 0 || !texture) return null;

    return (
      <group name="lightning-overlay">
        {/* Bolt-glyph billboards — normal blending only, no bloom */}
        <instancedMesh
          ref={meshRef}
          args={[undefined, undefined, MAX_INSTANCES]}
          frustumCulled={false}
          renderOrder={GLOBE_LAYER_ORDER.markers}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={texture}
            vertexColors
            transparent
            depthWrite={false}
            depthTest={true}
            blending={THREE.NormalBlending}
            side={THREE.DoubleSide}
          />
        </instancedMesh>
      </group>
    );
  },
  // Custom comparator: only re-render when the strikes array reference changes
  (prev, next) => prev.strikes === next.strikes,
);

export default LightningOverlay3D;

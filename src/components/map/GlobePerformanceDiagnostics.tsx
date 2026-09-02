import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { recordGlobeFrame } from "@/lib/map/globeDiagnostics";
import {
  GLOBE_LAYER_SLOTS,
  getGlobeLayerSlotForRenderOrder,
} from "@/lib/map/globeRenderOrder";

interface GlobePerformanceDiagnosticsProps {
  settleDelayMs: number;
}

function emptyLayerCounts(): Record<string, number> {
  return Object.fromEntries(GLOBE_LAYER_SLOTS.map((slot) => [slot, 0]));
}

/**
 * Development-only scene probe. It records bounded frame percentiles, camera
 * phase, WebGL counters, and scene-graph-visible object counts without React
 * state or a DOM overlay, so profiling does not perturb the map it measures.
 * The per-layer count intentionally is not called a submission count: Three
 * applies camera frustum/layer/material culling later in the render pipeline.
 */
export function GlobePerformanceDiagnostics({
  settleDelayMs,
}: GlobePerformanceDiagnosticsProps) {
  const priorCameraMatrixRef = useRef<THREE.Matrix4 | null>(null);
  const lastCameraMotionRef = useRef(0);
  const lastLayerScanRef = useRef(Number.NEGATIVE_INFINITY);
  const layerCountsRef = useRef<Record<string, number>>(emptyLayerCounts());
  const cameraMatrix = useMemo(() => new THREE.Matrix4(), []);

  useFrame(({ camera, gl, scene }, delta) => {
    const timestampMs = performance.now();
    cameraMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    const cameraMoved =
      priorCameraMatrixRef.current === null ||
      !priorCameraMatrixRef.current.equals(cameraMatrix);
    if (cameraMoved) lastCameraMotionRef.current = timestampMs;
    if (priorCameraMatrixRef.current) {
      priorCameraMatrixRef.current.copy(cameraMatrix);
    } else {
      priorCameraMatrixRef.current = cameraMatrix.clone();
    }

    if (timestampMs - lastLayerScanRef.current >= 1000) {
      const counts = emptyLayerCounts();
      scene.traverseVisible((object) => {
        const renderable = object as THREE.Object3D & {
          isLine?: boolean;
          isMesh?: boolean;
          isPoints?: boolean;
          isSprite?: boolean;
        };
        if (
          !renderable.isLine &&
          !renderable.isMesh &&
          !renderable.isPoints &&
          !renderable.isSprite
        ) {
          return;
        }
        counts[getGlobeLayerSlotForRenderOrder(object.renderOrder)] += 1;
      });
      layerCountsRef.current = counts;
      lastLayerScanRef.current = timestampMs;
    }

    const quietForMs = timestampMs - lastCameraMotionRef.current;
    recordGlobeFrame({
      timestampMs,
      frameTimeMs: delta * 1000,
      cameraPhase: cameraMoved
        ? "moving"
        : quietForMs < settleDelayMs
          ? "settling"
          : "stationary",
      // R3F callbacks run before the draw, so these counters describe the
      // immediately preceding completed frame rather than a partial render.
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      sceneVisibleLayers: layerCountsRef.current,
    });
  });

  return null;
}

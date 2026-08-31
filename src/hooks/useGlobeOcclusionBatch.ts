/**
 * useGlobeOcclusionBatch Hook
 *
 * Batch globe occlusion calculator that computes occlusion opacity for many
 * geographic positions in a single useFrame callback, instead of registering
 * one useFrame per position.
 *
 * 50 labels used to mean 50 separate per-frame callbacks. This hook replaces
 * all of them with a single callback that iterates through the position array.
 *
 * Uses the same math as useGlobeOcclusion (dot-product limb check with
 * smoothstep fade), so visual output is identical.
 */

import { useRef, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { useMapStore } from "@/stores/mapStore";
import {
  createGlobeOcclusionFrame,
  getGlobeOcclusionOpacity,
} from "@/lib/map/globeOcclusion";

/**
 * Minimum change in opacity before triggering a React re-render.
 * Prevents excessive re-renders for Html-based components.
 */
const STATE_UPDATE_THRESHOLD = 0.05;

export interface GlobeOcclusionBatchResult {
  /** Look up the current occlusion opacity for a lat/lon pair */
  getOpacity: (lat: number, lon: number) => number;
  /**
   * Version counter that increments whenever any position's opacity changes
   * by more than STATE_UPDATE_THRESHOLD. Consumers can depend on this value
   * to trigger React re-renders when occlusion visuals need updating.
   */
  version: number;
}

/**
 * Batch globe occlusion calculator.
 *
 * Computes occlusion opacity for an array of geographic positions in a
 * single useFrame callback. Returns a lookup function to read each
 * position's current opacity, plus a version counter that triggers
 * re-renders when opacities change significantly.
 *
 * @param positions - Array of { lat, lon } to track. Positions are keyed
 *   by `lat.toFixed(2),lon.toFixed(2)` for cache lookup.
 *
 * @example
 * ```tsx
 * const positions = spots.map(s => ({ lat: s.dxLat, lon: s.dxLon }));
 * const { getOpacity, version } = useGlobeOcclusionBatch(positions);
 *
 * // In render — version dependency ensures re-render on occlusion change
 * spots.map(s => (
 *   <SpotLabel occlusionOpacity={getOpacity(s.dxLat, s.dxLon)} />
 * ));
 * ```
 */
export function useGlobeOcclusionBatch(
  positions: Array<{ lat: number; lon: number }>,
): GlobeOcclusionBatchResult {
  // Internal cache: "lat,lon" -> opacity
  const cacheRef = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0);
  const versionRef = useRef(0);

  useFrame(({ camera }) => {
    // Transform the camera once per frame, rather than rotating every marker
    // normal in the loop. This also tracks live observatory-tilt changes.
    const frame = createGlobeOcclusionFrame(
      camera.position,
      useMapStore.getState().rotation.x,
    );
    if (!frame) return;

    let anySignificantChange = false;
    const cache = cacheRef.current;

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];

      const newOpacity = getGlobeOcclusionOpacity(pos.lat, pos.lon, frame);

      const key = `${pos.lat.toFixed(2)},${pos.lon.toFixed(2)}`;
      const prev = cache.get(key);

      // Always update the cache (cheap map write)
      cache.set(key, newOpacity);

      // Only flag for re-render when change exceeds threshold
      if (
        prev === undefined ||
        Math.abs(newOpacity - prev) > STATE_UPDATE_THRESHOLD
      ) {
        anySignificantChange = true;
      }
    }

    // Batch state update: one setState for all positions
    if (anySignificantChange) {
      versionRef.current++;
      setVersion(versionRef.current);
    }
  });

  const getOpacity = useCallback((lat: number, lon: number): number => {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    return cacheRef.current.get(key) ?? 1;
  }, []);

  return { getOpacity, version };
}

export default useGlobeOcclusionBatch;

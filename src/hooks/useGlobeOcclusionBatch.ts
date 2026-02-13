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

/**
 * Fade region width around the geometric limb of the globe.
 * Must match useGlobeOcclusion.ts exactly for visual parity.
 */
const FADE_BEFORE = 0.05;
const FADE_AFTER = 0.12;

/**
 * Minimum change in opacity before triggering a React re-render.
 * Prevents excessive re-renders for Html-based components.
 */
const STATE_UPDATE_THRESHOLD = 0.05;

/**
 * Attempt to compute a smoothstep interpolation (Hermite).
 * Maps a value from [edge0, edge1] to [0, 1] with smooth easing.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

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
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const camLen = Math.sqrt(cx * cx + cy * cy + cz * cz);

    // Guard against zero-length (should never happen in practice)
    if (camLen === 0) return;

    const dx = cx / camLen;
    const dy = cy / camLen;
    const dz = cz / camLen;

    // Dynamic limb threshold based on camera distance.
    // For a unit sphere viewed from distance D, the geometric limb
    // (tangent point) has dot(surfaceNormal, cameraDir) = 1/D.
    const limbDot = 1.0 / camLen;
    const visibleThreshold = limbDot + FADE_BEFORE;
    const hiddenThreshold = limbDot - FADE_AFTER;

    let anySignificantChange = false;
    const cache = cacheRef.current;

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];

      // Convert lat/lon to unit surface normal (direction from globe center)
      const phi = (90 - pos.lat) * (Math.PI / 180);
      const theta = (pos.lon + 180) * (Math.PI / 180);

      const nx = -Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);

      // Dot product of surface normal and camera direction
      const dot = nx * dx + ny * dy + nz * dz;

      // Map dot product to opacity — fade across the limb region
      let newOpacity: number;
      if (dot > visibleThreshold) {
        newOpacity = 1.0;
      } else if (dot < hiddenThreshold) {
        newOpacity = 0.0;
      } else {
        newOpacity = smoothstep(hiddenThreshold, visibleThreshold, dot);
      }

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

/**
 * useGlobeOcclusion Hook
 *
 * Computes an opacity multiplier for elements positioned on the 3D globe
 * based on whether they are on the camera-facing (visible) side or the
 * far (occluded) side. Elements on the back of the globe smoothly fade
 * out rather than being hard-clipped.
 *
 * Returns both a ref (for mesh components read inside useFrame) and a
 * state value (for Html components that need React re-renders).
 */

import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * How far before the actual geometric limb to start fading.
 * A small value means fading starts very close to the edge.
 */
const FADE_START_OFFSET = 0.35;

/**
 * Width of the fade zone past the limb.
 * Larger values give a wider, gentler transition.
 */
const FADE_WIDTH = 0.35;

/**
 * Minimum change in opacity before updating React state.
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

export interface GlobeOcclusion {
  /** Ref-based opacity for mesh components (read inside useFrame, no re-renders) */
  opacityRef: React.MutableRefObject<number>;
  /** State-based opacity for Html components (triggers re-render on significant change) */
  opacity: number;
}

/**
 * Compute the occlusion-based opacity for a geographic position on the globe.
 *
 * @param lat - Latitude in decimal degrees
 * @param lon - Longitude in decimal degrees
 * @returns Object with opacityRef (for meshes) and opacity (for Html)
 *
 * @example
 * ```tsx
 * // In a mesh component (read ref inside useFrame)
 * const { opacityRef } = useGlobeOcclusion(lat, lon);
 * useFrame(() => {
 *   materialRef.current.opacity = baseOpacity * opacityRef.current;
 * });
 *
 * // In an Html component (use state value)
 * const { opacity } = useGlobeOcclusion(lat, lon);
 * return <Html style={{ opacity: opacity * baseOpacity }}>...</Html>;
 * ```
 */
export function useGlobeOcclusion(lat: number, lon: number): GlobeOcclusion {
  const opacityRef = useRef(1);
  const lastStateOpacityRef = useRef(1);
  const [opacity, setOpacity] = useState(1);

  useFrame(({ camera }) => {
    // Convert lat/lon to unit surface normal (direction from globe center)
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const nx = -Math.sin(phi) * Math.cos(theta);
    const ny = Math.cos(phi);
    const nz = Math.sin(phi) * Math.sin(theta);

    // Camera direction (normalized camera position)
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const camLen = Math.sqrt(cx * cx + cy * cy + cz * cz);

    // Guard against zero-length (should never happen in practice)
    if (camLen === 0) return;

    const dx = cx / camLen;
    const dy = cy / camLen;
    const dz = cz / camLen;

    // Dot product of surface normal and camera direction
    const dot = nx * dx + ny * dy + nz * dz;

    // Dynamic thresholds based on camera distance.
    // The geometric limb of a sphere of radius R viewed from distance D
    // occurs where dot = R/D. We anchor fade thresholds to this value
    // so occlusion is correct at every zoom level.
    const globeRadius = 1.0;
    const limbDot = globeRadius / camLen;
    const visibleThreshold = limbDot - FADE_START_OFFSET;
    const hiddenThreshold = limbDot - FADE_START_OFFSET - FADE_WIDTH;

    // Map dot product to opacity
    let newOpacity: number;
    if (dot > visibleThreshold) {
      newOpacity = 1.0;
    } else if (dot < hiddenThreshold) {
      newOpacity = 0.0;
    } else {
      newOpacity = smoothstep(hiddenThreshold, visibleThreshold, dot);
    }

    // Always update the ref (no cost, read by useFrame consumers)
    opacityRef.current = newOpacity;

    // Only update React state when change is significant (avoids excessive re-renders)
    // Compare against lastStateOpacityRef (not state) to avoid stale closure issue
    if (
      Math.abs(newOpacity - lastStateOpacityRef.current) >
      STATE_UPDATE_THRESHOLD
    ) {
      lastStateOpacityRef.current = newOpacity;
      setOpacity(newOpacity);
    }
  });

  return { opacityRef, opacity };
}

export default useGlobeOcclusion;

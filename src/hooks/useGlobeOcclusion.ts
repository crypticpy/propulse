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
import { useMapStore } from "@/stores/mapStore";
import {
  createGlobeOcclusionFrame,
  getGlobeOcclusionOpacity,
} from "@/lib/map/globeOcclusion";

/**
 * Minimum change in opacity before updating React state.
 * Prevents excessive re-renders for Html-based components.
 */
const STATE_UPDATE_THRESHOLD = 0.05;

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
    // Read tilt inside the frame callback so the observatory slider updates
    // immediately without subscribing every individual marker to map state.
    const frame = createGlobeOcclusionFrame(
      camera.position,
      useMapStore.getState().rotation.x,
    );
    if (!frame) return;
    const newOpacity = getGlobeOcclusionOpacity(lat, lon, frame);

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

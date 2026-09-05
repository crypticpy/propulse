import { useState, type ReactNode, type MutableRefObject } from "react";
import { useFrame, type RenderCallback } from "@react-three/fiber";
import { MapAnimationContext } from "./hooks/useMapAnimationFrame";

/** One R3F subscription per path/trace collection, independent of object count. */
export function MapAnimationClock({ children }: { children: ReactNode }) {
  const [callbacks] = useState(() => new Set<MutableRefObject<RenderCallback>>());
  useFrame((state, delta, frame) => {
    for (const callback of callbacks) callback.current(state, delta, frame);
  });
  return <MapAnimationContext.Provider value={callbacks}>{children}</MapAnimationContext.Provider>;
}

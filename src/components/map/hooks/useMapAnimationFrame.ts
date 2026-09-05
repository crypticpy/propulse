import { createContext, useContext, useLayoutEffect, useRef, type MutableRefObject } from "react";
import type { RenderCallback } from "@react-three/fiber";

export const MapAnimationContext = createContext<Set<MutableRefObject<RenderCallback>> | null>(null);

/** Register a material update with its owning map animation clock. */
export function useMapAnimationFrame(callback: RenderCallback, enabled = true) {
  const callbacks = useContext(MapAnimationContext);
  const current = useRef(callback);
  useLayoutEffect(() => { current.current = callback; });
  useLayoutEffect(() => {
    if (!callbacks) throw new Error("Map animation clock required");
    if (!enabled) return;
    callbacks.add(current);
    return () => { callbacks.delete(current); };
  }, [callbacks, enabled]);
}

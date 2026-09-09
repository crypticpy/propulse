import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

type PendingRelease = ReturnType<typeof setTimeout>;

const pendingContextLossByCanvas = new WeakMap<HTMLCanvasElement, PendingRelease>();

export interface UseWebGLContextGuardOptions {
  /** Called when the GPU genuinely loses the WebGL context (crash, driver reset, cap eviction). */
  onLost?: () => void;
}

/**
 * Must be used by a component rendered inside an r3f `<Canvas>` so it can
 * reach the renderer via `useThree`.
 *
 * r3f only releases the WebGL context 500ms after unmount
 * (`setTimeout(() => state.gl.forceContextLoss(), 500)` in
 * `unmountComponentAtNode`), so navigating between 3D routes faster than
 * that stacks live contexts toward the browser's ~16-context cap. This hook
 * releases the context on unmount instead of waiting, and distinguishes that
 * self-inflicted loss from a genuine one so callers react only to real
 * GPU/driver failures.
 *
 * There is deliberately no `onRestored`: a caller that unmounts the canvas
 * on loss (the only sensible reaction) removes the listener with it, and a
 * cap-evicted context is never restored anyway. Recovery is a fresh mount.
 */
export function useWebGLContextGuard({
  onLost,
}: UseWebGLContextGuardOptions = {}): void {
  const gl = useThree((state) => state.gl);
  // Read the latest callback without re-running the effect below — its
  // cleanup releases the context, so it must only run on unmount, not
  // whenever a caller passes a new callback reference.
  const onLostRef = useRef(onLost);
  onLostRef.current = onLost;
  // StrictMode runs mount → cleanup → mount synchronously in development. A
  // release fired straight from cleanup would kill a canvas that is about to
  // be reattached, so it is deferred one task and withdrawn if the effect
  // runs again first. A real unmount never re-runs it, so this preserves
  // the ~500ms behavior that R3F normally uses.

  useEffect(() => {
    const canvas = gl.domElement;
    const priorPendingRelease = pendingContextLossByCanvas.get(canvas);
    if (priorPendingRelease !== undefined) {
      clearTimeout(priorPendingRelease);
      pendingContextLossByCanvas.delete(canvas);
    }

    const handleContextLost = (event: Event) => {
      // three.js's own handler already prevents the default; doing it here
      // too keeps restoration possible if listener order ever changes.
      event.preventDefault();
      onLostRef.current?.();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);

    return () => {
      // Removed before the release below, so the loss we cause ourselves
      // never reaches onLost.
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      const pendingRelease = setTimeout(() => {
        pendingContextLossByCanvas.delete(canvas);
        // r3f will call this again later inside its own try/catch; losing an
        // already-lost context is a no-op.
        gl.forceContextLoss?.();
      }, 500);
      pendingContextLossByCanvas.set(canvas, pendingRelease);
    };
  }, [gl]);
}

/**
 * Render this once inside `<Canvas>` to wire up `useWebGLContextGuard`
 * without threading the renderer through component props.
 */
export function WebGLContextGuard(props: UseWebGLContextGuardOptions) {
  useWebGLContextGuard(props);
  return null;
}

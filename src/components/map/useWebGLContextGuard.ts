import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";

type PendingRelease = ReturnType<typeof setTimeout>;

const pendingContextLossByCanvas = new WeakMap<HTMLCanvasElement, PendingRelease>();

/** Release soon after unmount; the WeakMap cancels if the canvas is reattached first. */
const CONTEXT_RELEASE_DELAY_MS = 50;

/**
 * r3f schedules its own `forceContextLoss` 500ms after StrictMode's simulated
 * unmount. Ignore spurious losses until that window passes.
 */
const CONTEXT_LOST_GRACE_MS = 550;

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

  useEffect(() => {
    const canvas = gl.domElement;
    const priorPendingRelease = pendingContextLossByCanvas.get(canvas);
    if (priorPendingRelease !== undefined) {
      clearTimeout(priorPendingRelease);
      pendingContextLossByCanvas.delete(canvas);
    }

    let ignoreLosses = true;
    const graceTimer = setTimeout(() => {
      ignoreLosses = false;
    }, CONTEXT_LOST_GRACE_MS);

    const handleContextLost = (event: Event) => {
      // three.js's own handler already prevents the default; doing it here
      // too keeps restoration possible if listener order ever changes.
      event.preventDefault();
      if (ignoreLosses) return;
      onLostRef.current?.();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);

    return () => {
      clearTimeout(graceTimer);
      // Removed before the release below, so the loss we cause ourselves
      // never reaches onLost.
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      const pendingRelease = setTimeout(() => {
        pendingContextLossByCanvas.delete(canvas);
        // r3f will call this again later inside its own try/catch; losing an
        // already-lost context is a no-op.
        gl.forceContextLoss?.();
      }, CONTEXT_RELEASE_DELAY_MS);
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

/**
 * Map overlay focus-home protocol (#797 / #824 / #848).
 *
 * When an overlay closes, keyboard focus must return to the element the
 * user came from, or fall back to the map surface if that element is gone.
 * Four overlays used to copy this by hand. The subtleties live here:
 *
 * 1. Cancel any pending fallback timer on setup. Under StrictMode the
 *    effect runs setup → cleanup → setup on mount, so the simulated cleanup
 *    schedules a timer while the overlay is still open. Without the cancel
 *    it fires and merely hovering a pin changes keyboard focus in dev.
 * 2. Capture the previously focused element only when it is a real
 *    HTMLElement, not `<body>`, and not already inside this overlay's root
 *    (child effects can focus inner content before this parent setup runs).
 * 3. On cleanup, return immediately unless `document.activeElement` is
 *    `body` or null. If a live element owns focus, the overlay does nothing.
 * 4. Restore to the captured element when it is still connected.
 * 5. Otherwise defer a zero-delay fallback to the map surface, re-checking
 *    `activeElement === body` inside the timeout because state can change
 *    in that gap. Synchronous fallback would run before a sibling overlay's
 *    mount effect, which would then capture the surface as ITS restore target.
 *
 * Cleanup also refuses to restore or fall back unless focus actually entered
 * this overlay (`heldFocus`). Pointer-only close with focus already on
 * `<body>` looks identical to "the overlay held focus and its removal dropped
 * it"; without the flag, hovering a pin and moving away would steal keyboard
 * focus onto the map surface.
 */
import { useEffect, useRef, type RefObject } from "react";
import { useMapSurfaceFocus } from "../MapSurfaceContext";

export function useFocusHome(
  active: boolean,
  rootRef: RefObject<HTMLElement | null>,
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const heldFocusRef = useRef(false);
  const focusMapSurface = useMapSurfaceFocus();

  useEffect(() => {
    if (!active) return;
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const root = rootRef.current;
    const activeElement = document.activeElement;
    previousFocusRef.current =
      activeElement instanceof HTMLElement &&
      activeElement !== document.body &&
      !root?.contains(activeElement)
        ? activeElement
        : null;
    heldFocusRef.current = root?.contains(activeElement) ?? false;
    const handleFocusIn = () => {
      heldFocusRef.current = true;
    };
    root?.addEventListener("focusin", handleFocusIn);
    return () => {
      root?.removeEventListener("focusin", handleFocusIn);
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      const current = document.activeElement;
      if (current && current !== document.body) return;
      if (!heldFocusRef.current) return;
      if (previousFocus?.isConnected) {
        previousFocus.focus();
        return;
      }
      fallbackTimerRef.current = window.setTimeout(() => {
        fallbackTimerRef.current = null;
        if (document.activeElement === document.body) focusMapSurface?.();
      }, 0);
    };
  }, [active, focusMapSurface, rootRef]);
}

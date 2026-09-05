/**
 * useFlatMapGestures Hook
 *
 * Handles multi-touch gestures (pinch-zoom + drag-to-pan) on the 2D flat
 * map canvas using PointerEvents directly (no external gesture library).
 *
 * Gesture modes:
 * - **Single pointer drag**: Calls onPan(deltaX, deltaY) while one pointer
 *   (finger or mouse) is moving on the canvas.
 * - **Pinch zoom**: When two touch/pen pointers are active, computes the
 *   distance ratio between moves and calls
 *   onPinchZoom(scaleDelta, centerX, centerY).
 *
 * Transitions:
 * - When a second touch/pen pointer arrives during a drag, the drag is
 *   cancelled and the hook switches to pinch mode.
 * - When one of two pointers lifts, the remaining pointer re-anchors for
 *   single-pointer drag (no jump).
 *
 * Exposes an `isGesturing` ref that external code (e.g. FlatMapClickHandler)
 * can check to suppress conflicting interactions during gestures, and an
 * `isDragging` ref for cursor styling feedback.
 */

import { useRef, useEffect } from "react";

/** Minimum pointer movement (px) before a single-finger drag starts */
const DRAG_THRESHOLD_PX = 4;

export interface UseFlatMapGesturesOptions {
  /** Ref to the canvas element to attach event listeners to */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Stable viewport coordinates while the retained canvas transforms. */
  coordinateSurfaceRef?: React.RefObject<HTMLElement | null>;
  /** Called during single-pointer drag with pixel deltas */
  onPan: (deltaX: number, deltaY: number) => void;
  /**
   * Called during pinch-zoom with the scale multiplier and the midpoint
   * of the two fingers in canvas-display coordinates.
   */
  onPinchZoom: (scaleDelta: number, centerX: number, centerY: number) => void;
  /** Called only when the gesture transitions between idle and active. */
  onActiveChange?: (active: boolean) => void;
  /** Whether touch gestures are enabled (default: true) */
  enabled?: boolean;
}

export interface UseFlatMapGesturesReturn {
  /**
   * Ref that is `true` while a multi-touch or drag gesture is actively
   * in progress. External handlers can read this to suppress their own
   * pointer processing.
   */
  isGesturing: React.RefObject<boolean>;
  /**
   * Ref that is `true` while the user is actively dragging (mouse or
   * touch). Useful for setting a "grabbing" cursor on the canvas.
   */
  isDragging: React.RefObject<boolean>;
}

/**
 * Compute Euclidean distance between two points.
 */
function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute midpoint between two points.
 */
function midpoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function useFlatMapGestures(
  options: UseFlatMapGesturesOptions,
): UseFlatMapGesturesReturn {
  const { canvasRef, enabled = true } = options;

  // Store callbacks in refs to avoid re-attaching listeners on every render
  const onPanRef = useRef(options.onPan);
  const onPinchZoomRef = useRef(options.onPinchZoom);
  const onActiveChangeRef = useRef(options.onActiveChange);
  const enabledRef = useRef(enabled);

  // Exposed flags for external coordination
  const isGesturing = useRef(false);
  const isDragging = useRef(false);

  // Sync refs every render
  useEffect(() => {
    onPanRef.current = options.onPan;
    onPinchZoomRef.current = options.onPinchZoom;
    onActiveChangeRef.current = options.onActiveChange;
    enabledRef.current = enabled;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    // --- Active pointer tracking ---
    type PointerInfo = { x: number; y: number };
    const pointers = new Map<number, PointerInfo>();

    // Gesture mode state
    type GestureMode = "none" | "pending" | "dragging" | "pinching";
    let mode: GestureMode = "none";
    let reportedActive = false;

    function reportActive(active: boolean): void {
      if (reportedActive === active) return;
      reportedActive = active;
      onActiveChangeRef.current?.(active);
    }

    // Single-pointer drag state
    let dragStartPos: { x: number; y: number } | null = null;
    let lastDragPos: { x: number; y: number } | null = null;

    // Pinch state
    let prevPinchDist: number | null = null;

    /**
     * Get the two active pointer positions as an array.
     * Returns null if there aren't exactly 2 pointers.
     */
    function getTwoPointers(): [PointerInfo, PointerInfo] | null {
      if (pointers.size !== 2) {
        return null;
      }
      const iter = pointers.values();
      const a = iter.next().value;
      const b = iter.next().value;
      if (!a || !b) {
        return null;
      }
      return [a, b];
    }

    /**
     * Convert a PointerEvent's clientX/clientY to canvas-display coordinates
     * (relative to the canvas bounding rect, NOT scaled by DPR).
     */
    function toCanvasCoords(e: PointerEvent): { x: number; y: number } {
      const rect = (
        options.coordinateSurfaceRef?.current ?? canvas!
      ).getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    // --- Event Handlers ---

    function handlePointerDown(e: PointerEvent): void {
      if (!enabledRef.current) {
        return;
      }

      const pos = toCanvasCoords(e);
      pointers.set(e.pointerId, pos);

      // Capture this pointer for reliable move/up tracking
      try {
        canvas!.setPointerCapture(e.pointerId);
      } catch {
        // setPointerCapture can throw if the pointer is already released
      }

      if (pointers.size === 1) {
        // First pointer down: enter pending mode (waiting for drag threshold)
        mode = "pending";
        dragStartPos = pos;
        lastDragPos = pos;
        prevPinchDist = null;
        isGesturing.current = false;
      } else if (pointers.size === 2 && e.pointerType !== "mouse") {
        // Second touch/pen pointer arrived: switch to pinch mode
        // (mice don't produce multi-pointer events, but guard anyway)
        mode = "pinching";
        isGesturing.current = true;
        reportActive(true);
        isDragging.current = false;
        dragStartPos = null;
        lastDragPos = null;

        // Initialize pinch distance
        const pair = getTwoPointers();
        if (pair) {
          prevPinchDist = dist(pair[0], pair[1]);
        }
      }
      // Ignore 3+ pointers — stay in current mode
    }

    function handlePointerMove(e: PointerEvent): void {
      if (!enabledRef.current) {
        return;
      }

      // Only process tracked pointers
      if (!pointers.has(e.pointerId)) {
        return;
      }

      const pos = toCanvasCoords(e);
      pointers.set(e.pointerId, pos);

      if (mode === "pending" && pointers.size === 1 && dragStartPos) {
        // Check if we've moved past the drag threshold
        const d = dist(dragStartPos, pos);
        if (d >= DRAG_THRESHOLD_PX) {
          mode = "dragging";
          isGesturing.current = true;
          reportActive(true);
          isDragging.current = true;
          canvas!.style.cursor = "grabbing";
          // Start drag from current position (no jump)
          lastDragPos = pos;
        }
        return;
      }

      if (mode === "dragging" && pointers.size === 1 && lastDragPos) {
        // Single-finger drag: compute and fire delta
        const dx = pos.x - lastDragPos.x;
        const dy = pos.y - lastDragPos.y;
        lastDragPos = pos;

        if (dx !== 0 || dy !== 0) {
          onPanRef.current(dx, dy);
        }
        return;
      }

      if (mode === "pinching" && pointers.size === 2) {
        const pair = getTwoPointers();
        if (!pair || prevPinchDist === null) {
          return;
        }

        const newDist = dist(pair[0], pair[1]);
        // Guard against zero/tiny distances to avoid NaN/Infinity
        if (prevPinchDist < 1 || newDist < 1) {
          prevPinchDist = newDist;
          return;
        }

        const scaleDelta = newDist / prevPinchDist;
        const center = midpoint(pair[0], pair[1]);

        prevPinchDist = newDist;

        // Only fire if there's a meaningful scale change
        if (Math.abs(scaleDelta - 1) > 0.001) {
          onPinchZoomRef.current(scaleDelta, center.x, center.y);
        }
        return;
      }
    }

    function handlePointerUp(e: PointerEvent): void {
      // Release capture
      try {
        canvas!.releasePointerCapture(e.pointerId);
      } catch {
        // May throw if already released
      }

      pointers.delete(e.pointerId);

      if (pointers.size === 0) {
        // All pointers lifted: reset
        mode = "none";
        isGesturing.current = false;
        isDragging.current = false;
        reportActive(false);
        canvas!.style.cursor = "";
        dragStartPos = null;
        lastDragPos = null;
        prevPinchDist = null;
      } else if (pointers.size === 1 && mode === "pinching") {
        // One finger lifted from a pinch: re-anchor for single-pointer drag
        // (start from current position so there's no jump)
        mode = "dragging";
        isDragging.current = true;
        const remaining = pointers.values().next().value;
        if (remaining) {
          lastDragPos = remaining;
          dragStartPos = remaining;
        }
        prevPinchDist = null;
        // Keep isGesturing true to suppress click handler
      }
    }

    function handlePointerCancel(e: PointerEvent): void {
      // Treat cancel the same as up
      handlePointerUp(e);
    }

    // --- Attach listeners ---
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);

      pointers.clear();
      mode = "none";
      isGesturing.current = false;
      isDragging.current = false;
      reportActive(false);
    };
    // Only re-attach when the canvas ref identity changes.
  }, [canvasRef, options.coordinateSurfaceRef]);

  return { isGesturing, isDragging };
}

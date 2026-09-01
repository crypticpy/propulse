/**
 * FlatMapClickHandler Hook
 *
 * Provides unified click, hover, and press-and-hold detection for the 2D flat map canvas.
 * Implements a gesture state machine (ported from GlobeClickHandler) to distinguish between:
 * - Dragging (pan/zoom) - NO menu
 * - Quick clicks - NO action (prevents accidents)
 * - Press-and-hold - Triggers menu after configurable duration
 * - Double-click - Centers view on the clicked location
 *
 * Converts canvas pointer positions to lat/lon coordinates using equirectangular
 * projection with zoom transform reversal, and provides screen positions for
 * tooltip/flyout positioning.
 *
 * Unlike GlobeClickHandler (which is a React component using React Three Fiber events),
 * this is a custom hook that attaches native PointerEvent listeners to a canvas element.
 */

import { useRef, useEffect } from "react";
import type { FlatMapZoomState } from "@/types/map";

/** Debounce delay for hover events in milliseconds */
const HOVER_DEBOUNCE_MS = 100;

/** Distance threshold to distinguish drag from click (pixels) */
const DRAG_THRESHOLD_PX = 5;

/** Minimum time before hold timer starts (prevents accidental holds) */
const HOLD_START_DELAY_MS = 120;

/** Default hold duration to trigger menu */
const DEFAULT_HOLD_DURATION_MS = 500;

/** Progress update interval during hold */
const HOLD_PROGRESS_INTERVAL_MS = 50;

/** Double-click detection threshold in milliseconds */
const DOUBLE_CLICK_THRESHOLD_MS = 300;

/** Maximum distance (pixels) between clicks to count as double-click */
const DOUBLE_CLICK_DISTANCE_THRESHOLD_PX = 20;

/** Gesture states for the state machine */
type GestureState = "idle" | "potential" | "holding" | "dragging" | "cancelled";

export interface FlatMapClickHandlerOptions {
  /** Ref to the canvas element to attach event listeners to */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Current zoom/pan transform state of the flat map */
  zoom: FlatMapZoomState;
  /** Called when press-and-hold completes on the map surface */
  onLocationClick?: (
    lat: number,
    lon: number,
    screenPos: { x: number; y: number },
  ) => void;
  /** Called when double-clicking on the map surface */
  onDoubleClick?: (
    lat: number,
    lon: number,
    screenPos: { x: number; y: number },
  ) => void;
  /**
   * Gives canvas-rendered overlays first refusal on a quick click. Return true
   * when an overlay consumed the click so it cannot become a map double-click.
   */
  onQuickClick?: (
    screenPos: { x: number; y: number },
    lat: number,
    lon: number,
  ) => boolean;
  /** Called when hovering over the map surface (debounced) */
  onLocationHover?: (
    lat: number,
    lon: number,
    screenPos: { x: number; y: number },
  ) => void;
  /** Called when the pointer leaves the map surface */
  onHoverEnd?: () => void;
  /** Called when hold gesture starts (for visual feedback) */
  onHoldStart?: (
    lat: number,
    lon: number,
    screenPos: { x: number; y: number },
  ) => void;
  /** Called with progress during hold (0-1) for ring animation */
  onHoldProgress?: (progress: number) => void;
  /** Called when hold is cancelled (user moved or released early) */
  onHoldCancel?: () => void;
  /** Hold duration in milliseconds (default: 500) */
  holdDurationMs?: number;
  /** Logical display dimensions of the map (before zoom transform) */
  displaySize: { width: number; height: number };
  /** When true, suppresses all gesture detection (e.g. during multi-touch pinch) */
  isGesturing?: React.RefObject<boolean>;
}

/**
 * Convert a canvas pointer event position to lat/lon coordinates.
 *
 * Reverses the zoom transform (scale + offset) to get logical map coordinates,
 * then converts from equirectangular projection pixel position to geographic
 * coordinates.
 *
 * @param event - The native pointer or mouse event
 * @param canvas - The canvas element for bounding rect calculation
 * @param zoom - Current zoom/pan transform state
 * @param displayWidth - Logical map width in pixels (before zoom)
 * @param displayHeight - Logical map height in pixels (before zoom)
 * @returns Lat/lon coordinates, or null if the pointer is outside the map bounds
 */
function canvasEventToLatLon(
  event: PointerEvent | MouseEvent,
  canvas: HTMLCanvasElement,
  zoom: FlatMapZoomState,
  displayWidth: number,
  displayHeight: number,
): { lat: number; lon: number } | null {
  const rect = canvas.getBoundingClientRect();

  // rect only supplies the canvas origin. The projection spans the logical
  // map box (displayWidth × displayHeight), which in fillContainer mode is
  // larger than the canvas itself — the crop is carried by zoom.offsetX/Y.
  const cssWidth = rect.width;
  const cssHeight = rect.height;

  // Convert screen position to canvas display coordinates (CSS pixels)
  const displayX = event.clientX - rect.left;
  const displayY = event.clientY - rect.top;

  // Reverse the zoom transform to get logical map coordinates (CSS pixels)
  const mapX = (displayX - zoom.offsetX) / zoom.scale;
  const mapY = (displayY - zoom.offsetY) / zoom.scale;

  // Check bounds - pointer is outside the logical map area
  if (mapX < 0 || mapX > displayWidth || mapY < 0 || mapY > displayHeight) {
    return null;
  }

  // Convert to lat/lon using equirectangular projection
  // X axis: 0 -> displayWidth maps to -180 -> +180 longitude
  // Y axis: 0 -> displayHeight maps to +90 -> -90 latitude (top = north)
  const lon = (mapX / displayWidth) * 360 - 180;
  const lat = 90 - (mapY / displayHeight) * 180;

  if (import.meta.env.DEV) {
    console.debug(
      `[ClickDebug] client=(${event.clientX.toFixed(0)},${event.clientY.toFixed(0)}) rect=(${rect.left.toFixed(0)},${rect.top.toFixed(0)},${rect.width.toFixed(0)}x${rect.height.toFixed(0)}) display=(${displayX.toFixed(1)},${displayY.toFixed(1)}) map=(${mapX.toFixed(1)},${mapY.toFixed(1)}) zoom=(s${zoom.scale.toFixed(2)},ox${zoom.offsetX.toFixed(1)},oy${zoom.offsetY.toFixed(1)}) size=(${displayWidth}x${displayHeight}) cssSize=(${cssWidth.toFixed(0)}x${cssHeight.toFixed(0)}) → lat=${lat.toFixed(2)} lon=${lon.toFixed(2)}`,
    );
  }

  return { lat, lon };
}

/**
 * Calculate Euclidean distance between two screen positions.
 */
function getDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Gesture detection hook for the 2D flat map canvas.
 *
 * Attaches native pointer event listeners to the provided canvas element and
 * implements a state machine to classify gestures as drags, holds, clicks,
 * or double-clicks. All callbacks receive geographic coordinates (lat/lon)
 * and screen positions for UI positioning.
 *
 * Gesture States:
 * - idle: No interaction
 * - potential: Pointer down, waiting to determine intent
 * - holding: User is holding, timer running
 * - dragging: User moved beyond threshold, pan controls active
 * - cancelled: Gesture ended without completing hold
 *
 * @param options - Configuration object with canvas ref, zoom state, and callbacks
 */
export function useFlatMapClickHandler(
  options: FlatMapClickHandlerOptions,
): void {
  const {
    canvasRef,
    holdDurationMs = DEFAULT_HOLD_DURATION_MS,
    isGesturing,
  } = options;

  // Store all callback props in refs to avoid re-attaching event listeners
  const onLocationClickRef = useRef(options.onLocationClick);
  const onDoubleClickRef = useRef(options.onDoubleClick);
  const onQuickClickRef = useRef(options.onQuickClick);
  const onLocationHoverRef = useRef(options.onLocationHover);
  const onHoverEndRef = useRef(options.onHoverEnd);
  const onHoldStartRef = useRef(options.onHoldStart);
  const onHoldProgressRef = useRef(options.onHoldProgress);
  const onHoldCancelRef = useRef(options.onHoldCancel);

  // Store zoom and displaySize in refs to avoid stale closures
  const zoomRef = useRef(options.zoom);
  const displaySizeRef = useRef(options.displaySize);
  const holdDurationRef = useRef(holdDurationMs);
  const isGesturingRef = useRef(isGesturing);

  // Sync refs with latest prop values on each render
  useEffect(() => {
    onLocationClickRef.current = options.onLocationClick;
    onDoubleClickRef.current = options.onDoubleClick;
    onQuickClickRef.current = options.onQuickClick;
    onLocationHoverRef.current = options.onLocationHover;
    onHoverEndRef.current = options.onHoverEnd;
    onHoldStartRef.current = options.onHoldStart;
    onHoldProgressRef.current = options.onHoldProgress;
    onHoldCancelRef.current = options.onHoldCancel;
    zoomRef.current = options.zoom;
    displaySizeRef.current = options.displaySize;
    holdDurationRef.current = holdDurationMs;
    isGesturingRef.current = isGesturing;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    // --- Gesture state machine refs (local to this effect) ---
    let gestureState: GestureState = "idle";
    let startPos: { x: number; y: number } | null = null;
    let startTime = 0;
    let targetLocation: {
      lat: number;
      lon: number;
      screenPos: { x: number; y: number };
    } | null = null;

    // Timer handles
    let holdStartTimer: ReturnType<typeof setTimeout> | null = null;
    let holdProgressTimer: ReturnType<typeof setInterval> | null = null;
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    let doubleClickTimer: ReturnType<typeof setTimeout> | null = null;

    // Double-click tracking
    let lastClick: {
      time: number;
      position: { x: number; y: number };
      lat: number;
      lon: number;
    } | null = null;

    // Track whether a pointer is currently down (to scope document listeners)
    let pointerIsDown = false;

    /**
     * Cancel any ongoing hold gesture and clean up timers.
     */
    function cancelHold(): void {
      if (holdStartTimer !== null) {
        clearTimeout(holdStartTimer);
        holdStartTimer = null;
      }
      if (holdProgressTimer !== null) {
        clearInterval(holdProgressTimer);
        holdProgressTimer = null;
      }
      if (gestureState === "holding" || gestureState === "potential") {
        onHoldCancelRef.current?.();
      }
      gestureState = "cancelled";
      targetLocation = null;
    }

    /**
     * Start the hold progress timer after the initial delay has passed.
     */
    function startHoldTimer(): void {
      if (!targetLocation) {
        return;
      }

      const { lat, lon, screenPos } = targetLocation;
      gestureState = "holding";

      // Notify hold started
      onHoldStartRef.current?.(lat, lon, screenPos);

      // Start progress updates
      const holdStartTime = Date.now();
      const duration = holdDurationRef.current;
      holdProgressTimer = setInterval(() => {
        const elapsed = Date.now() - holdStartTime;
        const progress = Math.min(elapsed / duration, 1);
        onHoldProgressRef.current?.(progress);

        // Hold complete
        if (progress >= 1) {
          if (holdProgressTimer !== null) {
            clearInterval(holdProgressTimer);
            holdProgressTimer = null;
          }

          // Completed holds always belong to the map surface. Overlay and grid
          // hit-testing is intentionally reserved for actual quick releases.
          if (targetLocation) {
            onLocationClickRef.current?.(lat, lon, screenPos);
          }

          gestureState = "idle";
          targetLocation = null;
        }
      }, HOLD_PROGRESS_INTERVAL_MS);
    }

    /**
     * Convert a pointer event to lat/lon using current zoom and display size refs.
     */
    function eventToLatLon(
      event: PointerEvent | MouseEvent,
    ): { lat: number; lon: number } | null {
      // canvas is guaranteed non-null by the guard at the top of this effect
      return canvasEventToLatLon(
        event,
        canvas as HTMLCanvasElement,
        zoomRef.current,
        displaySizeRef.current.width,
        displaySizeRef.current.height,
      );
    }

    // --- Event Handlers ---

    function handlePointerDown(event: PointerEvent): void {
      // Suppress click handling during multi-touch gestures (pinch-zoom, etc.)
      if (isGesturingRef.current?.current) {
        return;
      }

      const coords = eventToLatLon(event);
      if (!coords) {
        return;
      }

      pointerIsDown = true;

      // Reset gesture state
      gestureState = "potential";
      startTime = Date.now();

      const screenPos = { x: event.clientX, y: event.clientY };
      startPos = screenPos;

      targetLocation = { lat: coords.lat, lon: coords.lon, screenPos };

      // Start timer to begin hold tracking (after delay)
      holdStartTimer = setTimeout(() => {
        // Only start hold if still in potential state (not dragging)
        if (gestureState === "potential") {
          startHoldTimer();
        }
      }, HOLD_START_DELAY_MS);
    }

    function handlePointerMove(event: PointerEvent | MouseEvent): void {
      // Handle gesture state detection during active gesture
      if (
        startPos &&
        (gestureState === "potential" || gestureState === "holding")
      ) {
        const currentPos = { x: event.clientX, y: event.clientY };
        const distance = getDistance(startPos, currentPos);

        // If moved beyond threshold, transition to dragging
        if (distance > DRAG_THRESHOLD_PX) {
          cancelHold();
          gestureState = "dragging";
        }
      }

      // Debounced hover behavior only when idle (no active gesture)
      if (gestureState !== "idle") {
        return;
      }
      if (!onLocationHoverRef.current) {
        return;
      }

      if (hoverTimer !== null) {
        clearTimeout(hoverTimer);
      }

      hoverTimer = setTimeout(() => {
        const coords = eventToLatLon(event);
        if (!coords) {
          return;
        }

        const screenPos = { x: event.clientX, y: event.clientY };
        onLocationHoverRef.current?.(coords.lat, coords.lon, screenPos);
        hoverTimer = null;
      }, HOVER_DEBOUNCE_MS);
    }

    function handlePointerUp(event: PointerEvent): void {
      pointerIsDown = false;

      // If multi-touch gesture was active, reset state without firing callbacks
      if (isGesturingRef.current?.current) {
        cancelHold();
        gestureState = "idle";
        startPos = null;
        return;
      }

      const state = gestureState;
      const wasInPotentialState = state === "potential";
      const wasQuickRelease = startPos && Date.now() - startTime < 300;

      // If we were holding but not complete, cancel
      if (state === "potential" || state === "holding") {
        cancelHold();
      }

      // Reset state
      gestureState = "idle";

      // Double-click detection: Only process if it was a quick tap (not a hold or drag)
      if (wasInPotentialState && wasQuickRelease) {
        const coords = eventToLatLon(event);
        if (coords) {
          const screenPos = { x: event.clientX, y: event.clientY };
          const { lat, lon } = coords;
          const now = Date.now();

          // Canvas labels cannot own DOM events, so let the map view hit-test
          // them before this gesture is considered a surface double-click.
          if (onQuickClickRef.current?.(screenPos, lat, lon)) {
            if (doubleClickTimer !== null) {
              clearTimeout(doubleClickTimer);
              doubleClickTimer = null;
            }
            lastClick = null;
            startPos = null;
            return;
          }

          // Check if this is a double-click
          if (lastClick) {
            const timeDelta = now - lastClick.time;
            const distance = getDistance(lastClick.position, screenPos);

            if (
              timeDelta < DOUBLE_CLICK_THRESHOLD_MS &&
              distance < DOUBLE_CLICK_DISTANCE_THRESHOLD_PX
            ) {
              // Double-click detected! Cancel any pending single-click action
              if (doubleClickTimer !== null) {
                clearTimeout(doubleClickTimer);
                doubleClickTimer = null;
              }
              // Clear the last click to prevent triple-click issues
              lastClick = null;

              // Fire the double-click callback
              onDoubleClickRef.current?.(lat, lon, screenPos);

              startPos = null;
              return;
            }
          }

          // Not a double-click - record this click for potential double-click detection
          if (doubleClickTimer !== null) {
            clearTimeout(doubleClickTimer);
          }

          lastClick = { time: now, position: screenPos, lat, lon };

          // Set a timer to clear the last click after the threshold passes
          doubleClickTimer = setTimeout(() => {
            lastClick = null;
            doubleClickTimer = null;
          }, DOUBLE_CLICK_THRESHOLD_MS);
        }
      }

      startPos = null;
    }

    function handlePointerLeave(): void {
      // Clear any pending hover timer
      if (hoverTimer !== null) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }

      // Cancel any ongoing hold
      if (gestureState !== "idle" && gestureState !== "cancelled") {
        cancelHold();
      }

      gestureState = "idle";
      startPos = null;
      onHoverEndRef.current?.();
    }

    /**
     * Document-level pointermove handler: only active when pointer is down
     * to track drag gestures that move outside the canvas bounds.
     */
    function handleDocumentPointerMove(event: PointerEvent): void {
      if (!pointerIsDown) {
        return;
      }
      handlePointerMove(event);
    }

    /**
     * Document-level pointerup handler: ensures gesture cleanup even if
     * the pointer is released outside the canvas bounds.
     */
    function handleDocumentPointerUp(event: PointerEvent): void {
      if (!pointerIsDown) {
        return;
      }
      handlePointerUp(event);
    }

    // --- Attach event listeners ---
    // Canvas-level: pointerdown, pointermove (for hover), pointerleave
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);

    // Document-level: pointermove and pointerup for drag tracking outside canvas
    document.addEventListener("pointermove", handleDocumentPointerMove);
    document.addEventListener("pointerup", handleDocumentPointerUp);

    // --- Cleanup ---
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);

      document.removeEventListener("pointermove", handleDocumentPointerMove);
      document.removeEventListener("pointerup", handleDocumentPointerUp);

      // Clean up all timers
      if (holdStartTimer !== null) {
        clearTimeout(holdStartTimer);
      }
      if (holdProgressTimer !== null) {
        clearInterval(holdProgressTimer);
      }
      if (hoverTimer !== null) {
        clearTimeout(hoverTimer);
      }
      if (doubleClickTimer !== null) {
        clearTimeout(doubleClickTimer);
      }
    };
    // Only re-attach when the canvas ref identity changes.
    // All other values are accessed via refs to avoid stale closures.
  }, [canvasRef]);
}

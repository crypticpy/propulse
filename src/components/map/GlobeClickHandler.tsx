/**
 * GlobeClickHandler Component
 *
 * Provides unified click, hover, and press-and-hold detection for the 3D globe surface.
 * Implements a gesture state machine to distinguish between:
 * - Dragging (orbit rotation) - NO menu
 * - Quick clicks - NO action (prevents accidents)
 * - Press-and-hold - Triggers menu after configurable duration
 *
 * Converts 3D intersection points to lat/lon coordinates and provides
 * screen positions for tooltip/flyout positioning.
 */

import { useRef, useCallback, useMemo, useEffect } from "react";
import { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

/** Debounce delay for hover events in milliseconds */
const HOVER_DEBOUNCE_MS = 100;

/** Distance threshold to distinguish drag from click (pixels) */
const DRAG_THRESHOLD_PX = 5;

/** Minimum time before hold timer starts (prevents accidental holds) */
const HOLD_START_DELAY_MS = 200;

/** Default hold duration to trigger menu */
const DEFAULT_HOLD_DURATION_MS = 500;

/** Progress update interval during hold */
const HOLD_PROGRESS_INTERVAL_MS = 50;

/** Double-click detection threshold in milliseconds (Q2) */
const DOUBLE_CLICK_THRESHOLD_MS = 300;

/** Maximum distance (pixels) between clicks to count as double-click (Q2) */
const DOUBLE_CLICK_DISTANCE_THRESHOLD_PX = 20;

/** Gesture states */
type GestureState = "idle" | "potential" | "holding" | "dragging" | "cancelled";

export interface GlobeClickHandlerProps {
  /** Called when press-and-hold completes (replaces simple click) */
  onLocationClick?: (
    lat: number,
    lon: number,
    screenPosition: { x: number; y: number },
  ) => void;
  /** Called when double-clicking on the globe surface (centers view without setting target) */
  onDoubleClick?: (
    lat: number,
    lon: number,
    screenPosition: { x: number; y: number },
  ) => void;
  /** Called when hovering over the globe surface */
  onLocationHover?: (
    lat: number,
    lon: number,
    screenPosition: { x: number; y: number },
  ) => void;
  /** Called when the pointer leaves the globe */
  onHoverEnd?: () => void;
  /** Called when hold gesture starts (for visual feedback) */
  onHoldStart?: (
    lat: number,
    lon: number,
    screenPosition: { x: number; y: number },
  ) => void;
  /** Called with progress during hold (0-1) for ring animation */
  onHoldProgress?: (progress: number) => void;
  /** Called when hold is cancelled (user moved or released early) */
  onHoldCancel?: () => void;
  /** Hold duration in milliseconds (default: 500) */
  holdDurationMs?: number;
  /** Child components (rendered inside the group) */
  children?: React.ReactNode;
  /** Globe radius for hit detection (default: 1) */
  radius?: number;
}

/**
 * Convert 3D point on unit sphere to lat/lon coordinates
 */
function pointToLatLon(point: THREE.Vector3): { lat: number; lon: number } {
  const normalized = point.clone().normalize();
  const lat = Math.asin(normalized.y) * (180 / Math.PI);
  const theta = Math.atan2(normalized.z, -normalized.x);
  let lon = theta * (180 / Math.PI) - 180;
  if (lon < -180) {
    lon += 360;
  }
  return { lat, lon };
}

/**
 * Get screen position from native mouse/pointer event
 */
function getScreenPositionFromEvent(
  event: ThreeEvent<MouseEvent | PointerEvent>,
): { x: number; y: number } {
  const {nativeEvent} = event;
  return {
    x: nativeEvent.clientX,
    y: nativeEvent.clientY,
  };
}

/**
 * Calculate distance between two screen positions
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
 * GlobeClickHandler with gesture state machine
 *
 * Distinguishes between dragging (rotation) and intentional press-and-hold actions.
 * This prevents accidental menu opens while navigating the globe.
 *
 * Gesture States:
 * - idle: No interaction
 * - potential: Pointer down, waiting to determine intent
 * - holding: User is holding, timer running
 * - dragging: User moved beyond threshold, orbit controls active
 * - cancelled: Gesture ended without completing hold
 */
export function GlobeClickHandler({
  onLocationClick,
  onDoubleClick,
  onLocationHover,
  onHoverEnd,
  onHoldStart,
  onHoldProgress,
  onHoldCancel,
  holdDurationMs = DEFAULT_HOLD_DURATION_MS,
  children,
  radius = 1,
}: GlobeClickHandlerProps) {
  // Debounce timer for hover events
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoverRef = useRef<{ lat: number; lon: number } | null>(null);

  // Invisible sphere for hit detection
  const hitSphereRef = useRef<THREE.Mesh>(null);

  // Gesture state machine refs
  const gestureStateRef = useRef<GestureState>("idle");
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const startTimeRef = useRef<number>(0);
  const holdStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const targetLocationRef = useRef<{
    lat: number;
    lon: number;
    screenPos: { x: number; y: number };
  } | null>(null);

  // Double-click detection refs (Q2)
  const lastClickRef = useRef<{
    time: number;
    position: { x: number; y: number };
    lat: number;
    lon: number;
  } | null>(null);
  const doubleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Create sphere geometry for raycasting
  const sphereGeometry = useMemo(() => {
    return new THREE.SphereGeometry(radius, 64, 64);
  }, [radius]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (holdStartTimerRef.current) {
        clearTimeout(holdStartTimerRef.current);
      }
      if (holdProgressTimerRef.current) {
        clearInterval(holdProgressTimerRef.current);
      }
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
      if (doubleClickTimerRef.current) {
        clearTimeout(doubleClickTimerRef.current);
      }
    };
  }, []);

  /**
   * Cancel any ongoing hold gesture
   */
  const cancelHold = useCallback(() => {
    if (holdStartTimerRef.current) {
      clearTimeout(holdStartTimerRef.current);
      holdStartTimerRef.current = null;
    }
    if (holdProgressTimerRef.current) {
      clearInterval(holdProgressTimerRef.current);
      holdProgressTimerRef.current = null;
    }
    if (
      gestureStateRef.current === "holding" ||
      gestureStateRef.current === "potential"
    ) {
      onHoldCancel?.();
    }
    gestureStateRef.current = "cancelled";
    targetLocationRef.current = null;
  }, [onHoldCancel]);

  /**
   * Start the hold timer after delay
   */
  const startHoldTimer = useCallback(() => {
    if (!targetLocationRef.current) {
      return;
    }

    const { lat, lon, screenPos } = targetLocationRef.current;
    gestureStateRef.current = "holding";

    // Notify hold started
    onHoldStart?.(lat, lon, screenPos);

    // Start progress updates
    const holdStartTime = Date.now();
    holdProgressTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartTime;
      const progress = Math.min(elapsed / holdDurationMs, 1);
      onHoldProgress?.(progress);

      // Hold complete
      if (progress >= 1) {
        if (holdProgressTimerRef.current) {
          clearInterval(holdProgressTimerRef.current);
          holdProgressTimerRef.current = null;
        }

        // Fire the location click callback
        if (targetLocationRef.current) {
          onLocationClick?.(lat, lon, screenPos);
        }

        gestureStateRef.current = "idle";
        targetLocationRef.current = null;
      }
    }, HOLD_PROGRESS_INTERVAL_MS);
  }, [holdDurationMs, onHoldStart, onHoldProgress, onLocationClick]);

  /**
   * Handle pointer down - start gesture tracking
   */
  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!event.point) {
        return;
      }

      // Reset gesture state
      gestureStateRef.current = "potential";
      startTimeRef.current = Date.now();

      const screenPos = getScreenPositionFromEvent(event);
      startPosRef.current = screenPos;

      const { lat, lon } = pointToLatLon(event.point);
      targetLocationRef.current = { lat, lon, screenPos };

      // Start timer to begin hold tracking (after delay)
      holdStartTimerRef.current = setTimeout(() => {
        // Only start hold if still in potential state (not dragging)
        if (gestureStateRef.current === "potential") {
          startHoldTimer();
        }
      }, HOLD_START_DELAY_MS);
    },
    [startHoldTimer],
  );

  /**
   * Handle pointer move - detect drag vs continue hold
   */
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      // Handle gesture state detection during active gesture
      if (
        startPosRef.current &&
        (gestureStateRef.current === "potential" ||
          gestureStateRef.current === "holding")
      ) {
        const currentPos = getScreenPositionFromEvent(event);
        const distance = getDistance(startPosRef.current, currentPos);

        // If moved beyond threshold, transition to dragging
        if (distance > DRAG_THRESHOLD_PX) {
          cancelHold();
          gestureStateRef.current = "dragging";
        }
      }

      // Continue with normal hover behavior (debounced)
      if (!onLocationHover) {
        return;
      }

      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }

      hoverTimerRef.current = setTimeout(() => {
        if (!event.point) {
          return;
        }

        const { lat, lon } = pointToLatLon(event.point);
        const screenPos = getScreenPositionFromEvent(event);
        onLocationHover(lat, lon, screenPos);
        lastHoverRef.current = { lat, lon };
        hoverTimerRef.current = null;
      }, HOVER_DEBOUNCE_MS);
    },
    [onLocationHover, cancelHold],
  );

  /**
   * Handle pointer up - end gesture and detect double-clicks (Q2)
   */
  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const state = gestureStateRef.current;
      const wasInPotentialState = state === "potential";
      const wasQuickRelease =
        startPosRef.current && Date.now() - startTimeRef.current < 300;

      // If we were holding but not complete, cancel
      if (state === "potential" || state === "holding") {
        cancelHold();
      }

      // Reset state
      gestureStateRef.current = "idle";

      // Double-click detection (Q2): Only process if it was a quick tap (not a hold or drag)
      if (wasInPotentialState && wasQuickRelease && event.point) {
        const screenPos = getScreenPositionFromEvent(event);
        const { lat, lon } = pointToLatLon(event.point);
        const now = Date.now();
        const lastClick = lastClickRef.current;

        // Check if this is a double-click
        if (lastClick) {
          const timeDelta = now - lastClick.time;
          const distance = getDistance(lastClick.position, screenPos);

          if (
            timeDelta < DOUBLE_CLICK_THRESHOLD_MS &&
            distance < DOUBLE_CLICK_DISTANCE_THRESHOLD_PX
          ) {
            // Double-click detected! Cancel any pending single-click action
            if (doubleClickTimerRef.current) {
              clearTimeout(doubleClickTimerRef.current);
              doubleClickTimerRef.current = null;
            }
            // Clear the last click to prevent triple-click issues
            lastClickRef.current = null;

            // Fire the double-click callback (Q2: center view without target change)
            onDoubleClick?.(lat, lon, screenPos);

            startPosRef.current = null;
            return;
          }
        }

        // Not a double-click - record this click for potential double-click detection
        // Clear any pending single-click timer from previous click
        if (doubleClickTimerRef.current) {
          clearTimeout(doubleClickTimerRef.current);
        }

        lastClickRef.current = { time: now, position: screenPos, lat, lon };

        // Set a timer to clear the last click after the threshold passes
        // This ensures the lastClickRef doesn't stale and cause false double-clicks
        doubleClickTimerRef.current = setTimeout(() => {
          lastClickRef.current = null;
          doubleClickTimerRef.current = null;
        }, DOUBLE_CLICK_THRESHOLD_MS);
      }

      startPosRef.current = null;
    },
    [cancelHold, onDoubleClick],
  );

  /**
   * Handle pointer leaving the globe
   */
  const handlePointerLeave = useCallback(() => {
    // Clear any pending hover timer
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }

    // Cancel any ongoing hold
    if (
      gestureStateRef.current !== "idle" &&
      gestureStateRef.current !== "cancelled"
    ) {
      cancelHold();
    }

    lastHoverRef.current = null;
    gestureStateRef.current = "idle";
    startPosRef.current = null;
    onHoverEnd?.();
  }, [onHoverEnd, cancelHold]);

  return (
    <group>
      {/* Invisible hit detection sphere */}
      <mesh
        ref={hitSphereRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        visible={false}
      >
        <primitive object={sphereGeometry} attach="geometry" />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Child components (actual visible globe, markers, etc.) */}
      {children}
    </group>
  );
}

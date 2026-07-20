/**
 * AnimatedSpotTraces Component
 *
 * Renders animated "missile command" style trace lines on the 3D globe when
 * live spots arrive. Each line grows from the transmitter (spotter) to the
 * receiver (DX station) along a great circle arc, with a glowing head and
 * an integrated landing pulse effect at the destination.
 *
 * Technical approach:
 * - Queue-based staggering: new spots enter a pending queue and are dequeued
 *   one at a time every 2 seconds to avoid visual overload
 * - Each trace travels over 2.5s with quintic ease-out for ultra-smooth decel
 * - The landing ring is blended into the final 15% of travel — the head dot
 *   shrinks while the ring expands, creating a seamless arrival with no jerk
 * - Child <TraceAnimation> components drive their own useFrame loops
 * - Pool capped at maxTraces (default 40) concurrent animations
 */

import React, {
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { resolveSpotLocations } from "./LiveSpotArcs";
import {
  getSpotColor,
  getBandFromFrequency,
  type SpotColorMode,
} from "@/lib/utils/spotColors";
import { getMultiHopArcPoints } from "@/lib/utils/arcHeight";
import { useUIInteractionPrefs } from "@/stores/userStore";
import { getScreenSpaceScale } from "@/lib/map/screenSpaceScale";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// =============================================================================
// TYPES
// =============================================================================

interface AnimatedSpotTracesProps {
  /** User's grid locator for fetching spots */
  grid?: string;
  /** Max concurrent animations (default 20) */
  maxTraces?: number;
}

interface QueuedTrace {
  spotId: string;
  points: [number, number, number][];
  color: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Duration of the traveling phase in seconds (includes integrated landing) */
const TRAVEL_DURATION = 2.5;

/** Normalized progress at which the landing ring begins expanding (0–1) */
const LANDING_BLEND_START = 0.85;

/** How long the trail persists at full opacity after landing (seconds) */
const PERSIST_DURATION = 30.0;

/** Duration of the final fade-out after persist phase (seconds) */
const FADEOUT_DURATION = 3.0;

/** Interval between dequeuing new traces (seconds) */
const DEQUEUE_INTERVAL = 2.0;

/** Globe radius for trace rendering (above LiveSpotArcs at 1.005) */
const TRACE_RADIUS = 1.008;

/** Head sphere radius (inner solid) */
const HEAD_RADIUS = 0.006;

/** Head glow sphere radius (outer transparent) */
const HEAD_GLOW_RADIUS = 0.014;

/** Landing ring start radius */
const LANDING_RING_MIN = 0.005;

/** Landing ring end radius */
const LANDING_RING_MAX = 0.03;

// =============================================================================
// EASING
// =============================================================================

/**
 * Quintic ease-out: fast start, very gradual deceleration into the endpoint.
 * Smoother than cubic — the trace "floats" into its destination rather than
 * snapping. The derivative approaches zero much more gently, which eliminates
 * the perceptual hitch at the travel/landing boundary.
 */
function easeOutQuint(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv * inv * inv;
}

/**
 * Quadratic ease-in for the landing ring expansion — starts slow, accelerates.
 * This makes the ring bloom outward with increasing speed, matching the visual
 * impression of energy dissipating from the impact point.
 */
function easeInQuad(t: number): number {
  return t * t;
}

// =============================================================================
// TraceAnimation — individual animated trace
// =============================================================================

interface TraceAnimationProps {
  /** Unique identifier for this trace (used for memo comparison & onComplete) */
  spotId: string;
  /** Pre-computed 3D points along the great circle path */
  points: [number, number, number][];
  /** CSS hex color for this trace */
  color: string;
  /** Callback when this trace finishes its full lifecycle — receives spotId */
  onComplete: (spotId: string) => void;
}

const TraceAnimation = React.memo(
  function TraceAnimation({
    spotId,
    points,
    color,
    onComplete,
  }: TraceAnimationProps) {
    const startTimeRef = useRef<number | null>(null);
    const phaseRef = useRef<"traveling" | "persist" | "fadeout" | "done">(
      "traveling",
    );
    const completedRef = useRef(false);
    // When true, useFrame skips all work (persist phase uses a timer instead)
    const sleepingRef = useRef(false);

    // Refs for direct THREE.js manipulation — NO React state in the render loop
    const headRef = useRef<THREE.Mesh>(null);
    const headGlowRef = useRef<THREE.Mesh>(null);
    const ringRef = useRef<THREE.Mesh>(null);
    const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineRef = useRef<any>(null);
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Pre-compute endpoint
    const endpoint = useMemo(() => points[points.length - 1], [points]);
    const totalSegments = points.length - 1;
    const currentPointVector = useMemo(() => new THREE.Vector3(), []);
    const endpointVector = useMemo(
      () => new THREE.Vector3(...endpoint),
      [endpoint],
    );

    // Billboard quaternion for the landing ring — face outward from globe center
    const ringQuaternion = useMemo(() => {
      const pos = new THREE.Vector3(...endpoint);
      const quat = new THREE.Quaternion();
      const up = pos.clone().normalize();
      const defaultUp = new THREE.Vector3(0, 0, 1);
      quat.setFromUnitVectors(defaultUp, up);
      return quat;
    }, [endpoint]);

    // Dispose Line2 geometry + material on unmount to prevent GPU memory leaks
    useEffect(() => {
      const line = lineRef.current;
      return () => {
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        if (line) {
          line.geometry?.dispose();
          line.material?.dispose();
        }
      };
    }, []);

    useFrame((state) => {
      // PERF: During persist phase, the trace is static — skip all useFrame work.
      // A setTimeout wakes us up when it's time to start the fadeout phase.
      if (sleepingRef.current) return;

      const clock = state.clock.getElapsedTime();

      // Initialize start time on first frame and hide the line
      if (startTimeRef.current === null) {
        startTimeRef.current = clock;
        if (lineRef.current?.geometry) {
          lineRef.current.geometry.instanceCount = 0;
        }
        return; // skip first frame to avoid 1-frame flash of full line
      }

      const elapsed = clock - startTimeRef.current;

      if (phaseRef.current === "traveling") {
        const rawT = Math.min(elapsed / TRAVEL_DURATION, 1);
        const progress = easeOutQuint(rawT);

        const visibleSegments = Math.max(
          0,
          Math.min(Math.floor(progress * totalSegments), totalSegments),
        );

        if (lineRef.current?.geometry) {
          lineRef.current.geometry.instanceCount = visibleSegments;
        }

        if (
          lineRef.current?.material &&
          "opacity" in lineRef.current.material
        ) {
          lineRef.current.material.opacity = 0.8;
        }

        const pointIndex = Math.min(visibleSegments, totalSegments);
        const currentPoint = points[pointIndex];
        currentPointVector.set(
          currentPoint[0],
          currentPoint[1],
          currentPoint[2],
        );
        const headScreenScale = getScreenSpaceScale(
          state.camera.position.distanceTo(currentPointVector),
        );

        // --- Integrated landing blend ---
        // When the head reaches the final 15% of travel, the landing ring
        // begins expanding while the head simultaneously shrinks and fades.
        // This creates a seamless "arrival" rather than an abrupt phase switch.
        const inLandingBlend = rawT >= LANDING_BLEND_START;
        const blendT = inLandingBlend
          ? (rawT - LANDING_BLEND_START) / (1 - LANDING_BLEND_START)
          : 0;
        const easedBlendT = easeInQuad(blendT);

        // Head dot: visible during travel, shrinks and fades during blend
        if (headRef.current) {
          headRef.current.position.set(
            currentPoint[0],
            currentPoint[1],
            currentPoint[2],
          );
          headRef.current.visible = true;
          // Scale down from 1.0 to 0.0 during blend
          const headScale =
            headScreenScale * (inLandingBlend ? 1 - easedBlendT : 1);
          headRef.current.scale.setScalar(headScale);
        }
        if (headGlowRef.current) {
          headGlowRef.current.position.set(
            currentPoint[0],
            currentPoint[1],
            currentPoint[2],
          );
          headGlowRef.current.visible = true;
          const glowScale =
            headScreenScale * (inLandingBlend ? 1 - easedBlendT : 1);
          headGlowRef.current.scale.setScalar(glowScale);
          // Also fade the glow material opacity
          const glowMat = headGlowRef.current
            .material as THREE.MeshBasicMaterial;
          if (glowMat) {
            glowMat.opacity = 0.25 * (inLandingBlend ? 1 - easedBlendT : 1);
          }
        }

        // Landing ring: starts expanding during the blend portion of travel
        if (inLandingBlend && ringRef.current && ringMaterialRef.current) {
          const ringScreenScale = getScreenSpaceScale(
            state.camera.position.distanceTo(endpointVector),
          );
          if (!ringRef.current.visible) {
            ringRef.current.visible = true;
            ringRef.current.position.set(endpoint[0], endpoint[1], endpoint[2]);
            ringRef.current.quaternion.copy(ringQuaternion);
          }
          const ringScale =
            ringScreenScale *
            ((LANDING_RING_MIN +
              easedBlendT * (LANDING_RING_MAX - LANDING_RING_MIN)) /
              LANDING_RING_MIN);
          ringRef.current.scale.set(ringScale, ringScale, ringScale);
          // Ring fades from 0.7 to 0 as blend completes
          ringMaterialRef.current.opacity = 0.7 * (1 - easedBlendT);
        }

        if (rawT >= 1) {
          // Travel complete — transition directly to persist (no separate landing phase)
          phaseRef.current = "persist";

          if (lineRef.current?.geometry) {
            lineRef.current.geometry.instanceCount = totalSegments;
          }
          if (headRef.current) {
            headRef.current.visible = false;
            headRef.current.scale.setScalar(1); // reset for potential reuse
          }
          if (headGlowRef.current) {
            headGlowRef.current.visible = false;
            headGlowRef.current.scale.setScalar(1);
          }
          if (ringRef.current) ringRef.current.visible = false;

          // PERF: Sleep this useFrame — use a timer to wake up for fadeout
          sleepingRef.current = true;
          persistTimerRef.current = setTimeout(() => {
            sleepingRef.current = false;
            phaseRef.current = "fadeout";
            startTimeRef.current = null; // will be re-initialized on next useFrame
          }, PERSIST_DURATION * 1000);
        }
      } else if (phaseRef.current === "fadeout") {
        // Re-initialize start time after waking from persist sleep
        if (startTimeRef.current === null) {
          startTimeRef.current = clock;
          return;
        }
        const fadeElapsed = clock - startTimeRef.current;
        const rawT = Math.min(fadeElapsed / FADEOUT_DURATION, 1);

        if (
          lineRef.current?.material &&
          "opacity" in lineRef.current.material
        ) {
          lineRef.current.material.opacity = 0.8 * (1 - rawT);
        }

        if (rawT >= 1) {
          phaseRef.current = "done";
          if (lineRef.current?.geometry) {
            lineRef.current.geometry.instanceCount = 0;
          }
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete(spotId);
          }
        }
      }
    });

    if (points.length < 2) return null;

    return (
      <group>
        {/* Trail line — rendered with ALL points; instanceCount controls draw progress */}
        <Line
          ref={lineRef}
          points={points}
          color={color}
          lineWidth={2}
          opacity={0.8}
          transparent
          depthWrite={false}
          depthTest={true}
          renderOrder={GLOBE_LAYER_ORDER.arcs}
        />

        {/* Head — inner solid sphere */}
        <mesh
          ref={headRef}
          visible={false}
          renderOrder={GLOBE_LAYER_ORDER.arcs + 0.1}
        >
          <sphereGeometry args={[HEAD_RADIUS, 8, 8]} />
          <meshBasicMaterial
            color={color}
            depthWrite={false}
            depthTest={true}
          />
        </mesh>

        {/* Head — outer glow sphere */}
        <mesh
          ref={headGlowRef}
          visible={false}
          renderOrder={GLOBE_LAYER_ORDER.arcs + 0.2}
        >
          <sphereGeometry args={[HEAD_GLOW_RADIUS, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.25}
            depthWrite={false}
            depthTest={true}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Landing pulse ring */}
        <mesh
          ref={ringRef}
          visible={false}
          renderOrder={GLOBE_LAYER_ORDER.arcs + 0.3}
        >
          <ringGeometry args={[LANDING_RING_MIN * 0.8, LANDING_RING_MIN, 32]} />
          <meshBasicMaterial
            ref={ringMaterialRef}
            color={color}
            transparent
            opacity={0.7}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={true}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    );
  },
  (prev, next) => prev.spotId === next.spotId && prev.color === next.color,
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AnimatedSpotTraces({
  grid,
  maxTraces = 40,
}: AnimatedSpotTracesProps) {
  const uiPrefs = useUIInteractionPrefs();
  const colorMode: SpotColorMode = uiPrefs.spotColorMode ?? "mode";

  // Fetch live spots
  const { spots } = useLiveSpots({
    grid,
    enabled: true,
    refetchInterval: 60000,
  });

  // Resolve spots to lat/lon positions
  const resolvedSpots = useMemo(() => resolveSpotLocations(spots), [spots]);

  // Track which spot IDs have already been queued
  const seenSpotIds = useRef<Set<string>>(new Set());

  // Pending queue of traces waiting to be animated
  const pendingQueue = useRef<QueuedTrace[]>([]);

  // Active traces currently animating
  const [activeTraces, setActiveTraces] = useState<QueuedTrace[]>([]);

  // Last time we dequeued a trace
  const lastDequeueTime = useRef(0);

  // Compute path points for a resolved spot and queue it
  const computeAndQueue = useCallback(
    (spot: {
      spotterLat: number;
      spotterLon: number;
      dxLat: number;
      dxLon: number;
      id: string;
      mode: string;
      frequency: number;
    }) => {
      // Validate coordinates
      if (
        !Number.isFinite(spot.spotterLat) ||
        !Number.isFinite(spot.spotterLon) ||
        !Number.isFinite(spot.dxLat) ||
        !Number.isFinite(spot.dxLon)
      ) {
        return;
      }

      try {
        // Multi-hop ionospheric skip arcs — bounce count based on distance + band
        const band = getBandFromFrequency(spot.frequency);

        const points3D = getMultiHopArcPoints(
          spot.spotterLat,
          spot.spotterLon,
          spot.dxLat,
          spot.dxLon,
          band,
          TRACE_RADIUS,
        );

        // Validate all points are finite and we have enough for a line
        const allFinite = points3D.every(
          (pt) =>
            Number.isFinite(pt[0]) &&
            Number.isFinite(pt[1]) &&
            Number.isFinite(pt[2]),
        );
        if (!allFinite || points3D.length < 2) return;

        const color = getSpotColor(spot, colorMode);

        pendingQueue.current.push({
          spotId: spot.id,
          points: points3D,
          color,
        });
      } catch {
        // Silently skip spots with invalid paths
      }
    },
    [colorMode],
  );

  // Detect new spots and enqueue them
  useEffect(() => {
    for (const spot of resolvedSpots) {
      if (!seenSpotIds.current.has(spot.id)) {
        seenSpotIds.current.add(spot.id);
        computeAndQueue(spot);
      }
    }

    // Prevent unbounded growth of seenSpotIds — trim to last 500
    if (seenSpotIds.current.size > 500) {
      const entries = Array.from(seenSpotIds.current);
      seenSpotIds.current = new Set(entries.slice(entries.length - 300));
    }
  }, [resolvedSpots, computeAndQueue]);

  // Dequeue traces on a timer driven by useFrame
  useFrame((state) => {
    if (pendingQueue.current.length === 0) return; // nothing to dequeue

    const clock = state.clock.getElapsedTime();
    if (clock - lastDequeueTime.current < DEQUEUE_INTERVAL) return; // too soon

    if (activeTraces.length >= maxTraces) return; // at capacity

    const next = pendingQueue.current.shift();
    if (next) {
      lastDequeueTime.current = clock;
      setActiveTraces((prev) => {
        // Guard against exceeding maxTraces
        if (prev.length >= maxTraces) return prev;
        return [...prev, next];
      });
    }
  });

  // Handle trace completion — remove from active list
  const handleComplete = useCallback((spotId: string) => {
    setActiveTraces((prev) => prev.filter((t) => t.spotId !== spotId));
  }, []);

  return (
    <group name="animated-spot-traces">
      {activeTraces.map((trace) => (
        <TraceAnimation
          key={trace.spotId}
          spotId={trace.spotId}
          points={trace.points}
          color={trace.color}
          onComplete={handleComplete}
        />
      ))}
    </group>
  );
}

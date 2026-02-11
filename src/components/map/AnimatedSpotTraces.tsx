/**
 * AnimatedSpotTraces Component
 *
 * Renders animated "missile command" style trace lines on the 3D globe when
 * live spots arrive. Each line grows from the transmitter (spotter) to the
 * receiver (DX station) along a great circle arc, with a glowing head and
 * a landing pulse effect at the destination.
 *
 * Technical approach:
 * - Queue-based staggering: new spots enter a pending queue and are dequeued
 *   one at a time every 2 seconds to avoid visual overload
 * - Each trace animates over 2 seconds with cubic ease-out progression
 * - A 1-second landing pulse (expanding ring) fires at the DX endpoint
 * - Child <TraceAnimation> components drive their own useFrame loops
 * - Pool capped at maxTraces (default 20) concurrent animations
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
import { getPathPoints } from "@/lib/utils/path";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { resolveSpotLocations } from "./LiveSpotArcs";
import { getSpotColor, type SpotColorMode } from "@/lib/utils/spotColors";
import { useUIInteractionPrefs } from "@/stores/userStore";

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

/** Duration of the traveling phase in seconds */
const TRAVEL_DURATION = 2.0;

/** Duration of the landing pulse phase in seconds */
const LANDING_DURATION = 1.0;

/** How long the trail persists at full opacity after landing (seconds) */
const PERSIST_DURATION = 30.0;

/** Duration of the final fade-out after persist phase (seconds) */
const FADEOUT_DURATION = 3.0;

/** Interval between dequeuing new traces (seconds) */
const DEQUEUE_INTERVAL = 2.0;

/** Globe radius for trace rendering (above LiveSpotArcs at 1.005) */
const TRACE_RADIUS = 1.008;

/** Number of path segments for the great circle arc */
const PATH_SEGMENTS = 40;

/** Head sphere radius (inner solid) */
const HEAD_RADIUS = 0.006;

/** Head glow sphere radius (outer transparent) */
const HEAD_GLOW_RADIUS = 0.014;

/** Landing ring start radius */
const LANDING_RING_MIN = 0.005;

/** Landing ring end radius */
const LANDING_RING_MAX = 0.03;

// =============================================================================
// COORDINATE HELPERS
// =============================================================================

/**
 * Convert geographic lat/lon to 3D cartesian position on a sphere.
 * Uses the same coordinate convention as the rest of the globe scene.
 */
function latLonTo3D(
  lat: number,
  lon: number,
  radius: number = TRACE_RADIUS,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

// =============================================================================
// EASING
// =============================================================================

/** Cubic ease-out: fast start, decelerating finish */
function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
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
    const phaseRef = useRef<
      "traveling" | "landing" | "persist" | "fadeout" | "done"
    >("traveling");
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
      return () => {
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        if (lineRef.current) {
          lineRef.current.geometry?.dispose();
          lineRef.current.material?.dispose();
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
        const progress = easeOutCubic(rawT);

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
        if (headRef.current) {
          headRef.current.position.set(
            currentPoint[0],
            currentPoint[1],
            currentPoint[2],
          );
          headRef.current.visible = true;
        }
        if (headGlowRef.current) {
          headGlowRef.current.position.set(
            currentPoint[0],
            currentPoint[1],
            currentPoint[2],
          );
          headGlowRef.current.visible = true;
        }

        if (rawT >= 1) {
          phaseRef.current = "landing";
          startTimeRef.current = clock;

          if (lineRef.current?.geometry) {
            lineRef.current.geometry.instanceCount = totalSegments;
          }
          if (headRef.current) headRef.current.visible = false;
          if (headGlowRef.current) headGlowRef.current.visible = false;

          if (ringRef.current) {
            ringRef.current.visible = true;
            ringRef.current.position.set(endpoint[0], endpoint[1], endpoint[2]);
            ringRef.current.quaternion.copy(ringQuaternion);
          }
        }
      } else if (phaseRef.current === "landing") {
        const rawT = Math.min(elapsed / LANDING_DURATION, 1);

        if (ringRef.current && ringMaterialRef.current) {
          const scale =
            (LANDING_RING_MIN + rawT * (LANDING_RING_MAX - LANDING_RING_MIN)) /
            LANDING_RING_MIN;
          ringRef.current.scale.set(scale, scale, scale);
          ringMaterialRef.current.opacity = 0.7 * (1 - rawT);
        }

        if (rawT >= 1) {
          // Enter persist phase: line stays visible, useFrame goes to sleep
          phaseRef.current = "persist";
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
        />

        {/* Head — inner solid sphere */}
        <mesh ref={headRef} visible={false}>
          <sphereGeometry args={[HEAD_RADIUS, 8, 8]} />
          <meshBasicMaterial color={color} depthWrite={false} />
        </mesh>

        {/* Head — outer glow sphere */}
        <mesh ref={headGlowRef} visible={false}>
          <sphereGeometry args={[HEAD_GLOW_RADIUS, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.25}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Landing pulse ring */}
        <mesh ref={ringRef} visible={false}>
          <ringGeometry args={[LANDING_RING_MIN * 0.8, LANDING_RING_MIN, 32]} />
          <meshBasicMaterial
            ref={ringMaterialRef}
            color={color}
            transparent
            opacity={0.7}
            side={THREE.DoubleSide}
            depthWrite={false}
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
        const pathPoints = getPathPoints(
          spot.spotterLat,
          spot.spotterLon,
          spot.dxLat,
          spot.dxLon,
          PATH_SEGMENTS,
        );

        const points3D = pathPoints.map((p) => latLonTo3D(p.lat, p.lon)) as [
          number,
          number,
          number,
        ][];

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

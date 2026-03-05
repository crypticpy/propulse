/**
 * Ft8BurstTraces Component
 *
 * Renders animated "burst" traces on the 3D globe for FT8/FT4 decodes.
 * When a new decode cycle arrives (isNewCycle), all traces launch from
 * the operator's QTH to each decoded station along ionospheric skip arcs,
 * with staggered delays for a cascading fan-out effect.
 *
 * Technical approach:
 * - Cycle-synced bursts: when isNewCycle fires, the entire batch of decoded
 *   stations is added to the active pool with staggered launch delays
 * - Per-trace state machine: waiting -> traveling -> persisting -> fading -> done
 * - Persist phase uses setTimeout (no useFrame work) for performance
 * - Pool capped at 50 concurrent traces; oldest evicted when full
 * - SNR-based color coding: green (strong) -> cyan -> amber -> red (weak)
 * - Double landing rings at destination with expanding ripple effect
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
import { getMultiHopArcPoints } from "@/lib/utils/arcHeight";

// =============================================================================
// TYPES
// =============================================================================

export interface Ft8ResolvedTrace {
  /** Unique ID per trace */
  id: string;
  /** Decoded station latitude */
  endLat: number;
  /** Decoded station longitude */
  endLon: number;
  /** Signal-to-noise ratio */
  snr: number;
  /** "FT8" or "FT4" */
  mode: string;
  /** Callsign for tooltip */
  callsign: string;
  /** Stagger delay in ms (index * 50) */
  delay: number;
}

interface Ft8BurstTracesProps {
  /** Decoded stations to visualize -- one trace per decode */
  traces: Ft8ResolvedTrace[];
  /** Operator's QTH latitude */
  qthLat: number;
  /** Operator's QTH longitude */
  qthLon: number;
  /** Current band for ionospheric arc height */
  band: string | null;
  /** Whether a new cycle just started (triggers burst) */
  isNewCycle: boolean;
}

type TracePhase = "waiting" | "traveling" | "persisting" | "fading" | "done";

interface PooledTrace {
  id: string;
  points: [number, number, number][];
  color: string;
  snr: number;
  delay: number;
  addedAt: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Duration of the traveling phase in seconds */
const TRAVEL_DURATION = 1.5;

/** How long the trail persists after landing (seconds) */
const PERSIST_DURATION = 12.0;

/** Duration of the final fade-out (seconds) */
const FADEOUT_DURATION = 2.0;

/** Globe radius for trace rendering (slightly above surface) */
const TRACE_RADIUS = 1.009;

/** Head sphere radius */
const HEAD_RADIUS = 0.004;

/** Head glow sphere radius */
const HEAD_GLOW_RADIUS = 0.01;

/** Inner landing ring base radius */
const LANDING_RING_INNER_MAX = 0.003;

/** Outer landing ring base radius */
const LANDING_RING_OUTER_MAX = 0.006;

/** Landing ring animation duration in seconds */
const LANDING_RING_DURATION = 0.5;

/** Maximum concurrent traces in the pool */
const MAX_POOL_SIZE = 50;

// =============================================================================
// HELPERS
// =============================================================================

function snrToColor(snr: number): string {
  if (snr >= 0) return "#00FF88";
  if (snr >= -10) return "#44DDFF";
  if (snr >= -18) return "#FFD23F";
  return "#FF4444";
}

/** Quintic ease-out: fast start, very gradual deceleration */
function easeOutQuint(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv * inv * inv;
}

// =============================================================================
// BurstTraceAnimation -- individual animated trace with state machine
// =============================================================================

interface BurstTraceAnimationProps {
  traceId: string;
  points: [number, number, number][];
  color: string;
  delay: number;
  onComplete: (traceId: string) => void;
}

const BurstTraceAnimation = React.memo(
  function BurstTraceAnimation({
    traceId,
    points,
    color,
    delay,
    onComplete,
  }: BurstTraceAnimationProps) {
    const startTimeRef = useRef<number | null>(null);
    const phaseRef = useRef<TracePhase>("waiting");
    const completedRef = useRef(false);
    const sleepingRef = useRef(false);
    const delayElapsedRef = useRef(false);

    // THREE.js mesh refs for direct manipulation
    const headRef = useRef<THREE.Mesh>(null);
    const headGlowRef = useRef<THREE.Mesh>(null);
    const innerRingRef = useRef<THREE.Mesh>(null);
    const outerRingRef = useRef<THREE.Mesh>(null);
    const innerRingMatRef = useRef<THREE.MeshBasicMaterial>(null);
    const outerRingMatRef = useRef<THREE.MeshBasicMaterial>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineRef = useRef<any>(null);
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Landing ring phase tracking
    const landingStartRef = useRef<number | null>(null);

    const endpoint = useMemo(() => points[points.length - 1], [points]);
    const totalSegments = points.length - 1;

    // Billboard quaternion for landing rings -- face outward from globe center
    const ringQuaternion = useMemo(() => {
      const pos = new THREE.Vector3(...endpoint);
      const quat = new THREE.Quaternion();
      const up = pos.clone().normalize();
      const defaultUp = new THREE.Vector3(0, 0, 1);
      quat.setFromUnitVectors(defaultUp, up);
      return quat;
    }, [endpoint]);

    // Cleanup on unmount
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
      // During persist phase, skip all useFrame work
      if (sleepingRef.current) return;

      const clock = state.clock.getElapsedTime();

      // Initialize start time on first frame
      if (startTimeRef.current === null) {
        startTimeRef.current = clock;
        // Hide line initially
        if (lineRef.current?.geometry) {
          lineRef.current.geometry.instanceCount = 0;
        }
        return;
      }

      const elapsed = clock - startTimeRef.current;

      // ── WAITING phase: check if stagger delay has elapsed ─────────────
      if (phaseRef.current === "waiting") {
        if (elapsed < delay / 1000) return;
        // Delay elapsed -- transition to traveling
        phaseRef.current = "traveling";
        delayElapsedRef.current = true;
        startTimeRef.current = clock; // Reset start for travel timing
        return;
      }

      // ── TRAVELING phase: animate head along arc ───────────────────────
      if (phaseRef.current === "traveling") {
        const travelElapsed = clock - startTimeRef.current;
        const rawT = Math.min(travelElapsed / TRAVEL_DURATION, 1);
        const progress = easeOutQuint(rawT);

        const visibleSegments = Math.max(
          0,
          Math.min(Math.floor(progress * totalSegments), totalSegments),
        );

        // Update line draw progress
        if (lineRef.current?.geometry) {
          lineRef.current.geometry.instanceCount = visibleSegments;
        }
        if (
          lineRef.current?.material &&
          "opacity" in lineRef.current.material
        ) {
          lineRef.current.material.opacity = 0.8;
        }

        // Position head at current progress point
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

        // Travel complete -- transition to persisting
        if (rawT >= 1) {
          phaseRef.current = "persisting";

          // Show full trail
          if (lineRef.current?.geometry) {
            lineRef.current.geometry.instanceCount = totalSegments;
          }
          // Hide head
          if (headRef.current) headRef.current.visible = false;
          if (headGlowRef.current) headGlowRef.current.visible = false;

          // Start landing ring animation
          landingStartRef.current = clock;

          // Show landing rings at endpoint
          if (innerRingRef.current) {
            innerRingRef.current.visible = true;
            innerRingRef.current.position.set(
              endpoint[0],
              endpoint[1],
              endpoint[2],
            );
            innerRingRef.current.quaternion.copy(ringQuaternion);
            innerRingRef.current.scale.setScalar(0.01);
          }
          if (outerRingRef.current) {
            outerRingRef.current.visible = true;
            outerRingRef.current.position.set(
              endpoint[0],
              endpoint[1],
              endpoint[2],
            );
            outerRingRef.current.quaternion.copy(ringQuaternion);
            outerRingRef.current.scale.setScalar(0.01);
          }
        }
        return;
      }

      // ── PERSISTING phase: animate landing rings, then sleep ───────────
      if (phaseRef.current === "persisting") {
        // Animate landing rings during the first LANDING_RING_DURATION
        if (landingStartRef.current !== null) {
          const ringElapsed = clock - landingStartRef.current;
          const ringT = Math.min(ringElapsed / LANDING_RING_DURATION, 1);

          // Inner ring: grows from ~0 to LANDING_RING_INNER_MAX
          if (innerRingRef.current && innerRingMatRef.current) {
            const scale = ringT * (LANDING_RING_INNER_MAX / 0.001);
            innerRingRef.current.scale.setScalar(Math.max(0.01, scale));
            innerRingMatRef.current.opacity = 0.7 * (1 - ringT);
          }

          // Outer ring: grows from ~0 to LANDING_RING_OUTER_MAX
          if (outerRingRef.current && outerRingMatRef.current) {
            const scale = ringT * (LANDING_RING_OUTER_MAX / 0.001);
            outerRingRef.current.scale.setScalar(Math.max(0.01, scale));
            outerRingMatRef.current.opacity = 0.5 * (1 - ringT);
          }

          if (ringT >= 1) {
            // Ring animation done -- hide rings and go to sleep
            if (innerRingRef.current) innerRingRef.current.visible = false;
            if (outerRingRef.current) outerRingRef.current.visible = false;
            landingStartRef.current = null;

            // PERF: Sleep this useFrame -- timer wakes us for fadeout
            sleepingRef.current = true;
            persistTimerRef.current = setTimeout(() => {
              sleepingRef.current = false;
              phaseRef.current = "fading";
              startTimeRef.current = null; // re-initialized on next frame
            }, PERSIST_DURATION * 1000);
          }
        }
        return;
      }

      // ── FADING phase: fade trail opacity to 0 ────────────────────────
      if (phaseRef.current === "fading") {
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
            onComplete(traceId);
          }
        }
      }
    });

    if (points.length < 2) return null;

    return (
      <group>
        {/* Trail line -- instanceCount controls progressive draw */}
        <Line
          ref={lineRef}
          points={points}
          color={color}
          lineWidth={1.5}
          opacity={0.8}
          transparent
          depthWrite={false}
          depthTest={false}
        />

        {/* Head -- inner solid sphere */}
        <mesh ref={headRef} visible={false}>
          <sphereGeometry args={[HEAD_RADIUS, 8, 8]} />
          <meshBasicMaterial
            color={color}
            depthWrite={false}
            depthTest={false}
          />
        </mesh>

        {/* Head -- outer glow sphere with additive blending */}
        <mesh ref={headGlowRef} visible={false}>
          <sphereGeometry args={[HEAD_GLOW_RADIUS, 8, 8]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.25}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Landing ring -- inner */}
        <mesh ref={innerRingRef} visible={false}>
          <ringGeometry args={[0.0008, 0.001, 32]} />
          <meshBasicMaterial
            ref={innerRingMatRef}
            color={color}
            transparent
            opacity={0.7}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Landing ring -- outer */}
        <mesh ref={outerRingRef} visible={false}>
          <ringGeometry args={[0.0008, 0.001, 32]} />
          <meshBasicMaterial
            ref={outerRingMatRef}
            color={color}
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    );
  },
  (prev, next) => prev.traceId === next.traceId && prev.color === next.color,
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function Ft8BurstTraces({
  traces,
  qthLat,
  qthLon,
  band,
  isNewCycle,
}: Ft8BurstTracesProps) {
  const [activePool, setActivePool] = useState<PooledTrace[]>([]);
  const poolCounterRef = useRef(0);

  // When isNewCycle fires, compute arc points for all traces and add to pool
  useEffect(() => {
    if (!isNewCycle || traces.length === 0) return;

    const newPooled: PooledTrace[] = [];
    const now = Date.now();

    for (const trace of traces) {
      // Validate coordinates
      if (
        !Number.isFinite(trace.endLat) ||
        !Number.isFinite(trace.endLon) ||
        !Number.isFinite(qthLat) ||
        !Number.isFinite(qthLon)
      ) {
        continue;
      }

      try {
        const arcBand = band ?? "20m";
        const points3D = getMultiHopArcPoints(
          qthLat,
          qthLon,
          trace.endLat,
          trace.endLon,
          arcBand,
          TRACE_RADIUS,
        );

        // Validate points
        const allFinite = points3D.every(
          (pt) =>
            Number.isFinite(pt[0]) &&
            Number.isFinite(pt[1]) &&
            Number.isFinite(pt[2]),
        );
        if (!allFinite || points3D.length < 2) continue;

        const color = snrToColor(trace.snr);
        poolCounterRef.current += 1;

        newPooled.push({
          id: `ft8burst-${poolCounterRef.current}-${trace.id}`,
          points: points3D,
          color,
          snr: trace.snr,
          delay: trace.delay,
          addedAt: now,
        });
      } catch {
        // Skip traces with invalid arc computation
      }
    }

    if (newPooled.length === 0) return;

    setActivePool((prev) => {
      const combined = [...prev, ...newPooled];
      // Evict oldest traces if pool exceeds cap
      if (combined.length > MAX_POOL_SIZE) {
        // Sort by addedAt ascending so oldest are first, then slice off extras
        combined.sort((a, b) => a.addedAt - b.addedAt);
        return combined.slice(combined.length - MAX_POOL_SIZE);
      }
      return combined;
    });
  }, [isNewCycle, traces, qthLat, qthLon, band]);

  // Handle trace completion -- remove from pool
  const handleComplete = useCallback((traceId: string) => {
    setActivePool((prev) => prev.filter((t) => t.id !== traceId));
  }, []);

  return (
    <group name="ft8-burst-traces">
      {activePool.map((trace) => (
        <BurstTraceAnimation
          key={trace.id}
          traceId={trace.id}
          points={trace.points}
          color={trace.color}
          delay={trace.delay}
          onComplete={handleComplete}
        />
      ))}
    </group>
  );
}

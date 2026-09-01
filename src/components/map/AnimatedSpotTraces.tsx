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
import {
  resolveSpotLocations,
  type ResolvedSpot,
} from "./LiveSpotArcs";
import { SpotEndpointHitArea } from "./SpotEndpointHitArea";
import {
  getSpotColor,
  getBandFromFrequency,
  type SpotColorMode,
} from "@/lib/utils/spotColors";
import { getMultiHopArcPoints } from "@/lib/utils/arcHeight";
import { useUIInteractionPrefs } from "@/stores/userStore";
import { getScreenSpaceScale } from "@/lib/map/screenSpaceScale";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { useGlobeOcclusionBatch } from "@/hooks/useGlobeOcclusionBatch";
import type { LiveSpot } from "@/types/livespot";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import {
  getTraceEndpointOpacity,
  reconcileTraceFeed,
  type TracePhase,
} from "@/lib/map/spotTraceLifecycle";

// =============================================================================
// TYPES
// =============================================================================

interface AnimatedSpotTracesProps {
  /** User's grid locator for fetching spots */
  grid?: string;
  /** Max concurrent animations (default 20) */
  maxTraces?: number;
  /** Full feed used to distinguish hydration from genuinely new arrivals. */
  feedSpots?: LiveSpot[];
  /** Shared, filtered/capped candidate list. */
  candidateSpots?: LiveSpot[];
  /** Shared coordinate resolution of candidateSpots. */
  resolvedSpots?: ResolvedSpot[];
  /** Whether every requested source has produced a successful baseline. */
  isFeedReady?: boolean;
  /** Changes when the backing query scope changes (for example QTH/source). */
  hydrationKey?: string;
  onSpotHover?: (spot: LiveSpot, screenPos: ScreenAnchor) => void;
  onSpotHoverEnd?: () => void;
  onSpotSelect?: (spot: LiveSpot, screenPos: ScreenAnchor) => void;
}

interface QueuedTrace {
  spotId: string;
  points: [number, number, number][];
  color: string;
  spot: ResolvedSpot;
  sourceSpot: LiveSpot;
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

/** Persistent destination marker radii. */
const DESTINATION_RADIUS = 0.008;
const DESTINATION_GLOW_RADIUS = 0.018;

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
  /** Resolved endpoint and original metadata for a lifetime-matched hit target. */
  spot: ResolvedSpot;
  sourceSpot: LiveSpot;
  occlusionOpacity: number;
  onSpotHover?: (spot: LiveSpot, screenPos: ScreenAnchor) => void;
  onSpotHoverEnd?: () => void;
  onSpotSelect?: (spot: LiveSpot, screenPos: ScreenAnchor) => void;
  /** Callback when this trace finishes its full lifecycle — receives spotId */
  onComplete: (spotId: string) => void;
}

const TraceAnimation = React.memo(
  function TraceAnimation({
    spotId,
    points,
    color,
    spot,
    sourceSpot,
    occlusionOpacity,
    onSpotHover,
    onSpotHoverEnd,
    onSpotSelect,
    onComplete,
  }: TraceAnimationProps) {
    const startTimeRef = useRef<number | null>(null);
    const phaseRef = useRef<TracePhase>("traveling");
    const completedRef = useRef(false);
    // When true, useFrame skips all work (persist phase uses a timer instead)
    const sleepingRef = useRef(false);

    // Refs for direct THREE.js manipulation — NO React state in the render loop
    const headRef = useRef<THREE.Mesh>(null);
    const headGlowRef = useRef<THREE.Mesh>(null);
    const ringRef = useRef<THREE.Mesh>(null);
    const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
    const destinationRef = useRef<THREE.Mesh>(null);
    const destinationGlowRef = useRef<THREE.Mesh>(null);
    const destinationMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
    const destinationGlowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
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
      // The destination stays visible and correctly sized for the entire trace
      // lifetime, including the otherwise-sleeping persist phase.
      const endpointScale = getScreenSpaceScale(
        state.camera.position.distanceTo(endpointVector),
      );
      destinationRef.current?.scale.setScalar(endpointScale);
      destinationGlowRef.current?.scale.setScalar(endpointScale);

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
        const endpointOpacity = getTraceEndpointOpacity("fadeout", rawT);

        if (destinationMaterialRef.current) {
          destinationMaterialRef.current.opacity = endpointOpacity;
        }
        if (destinationGlowMaterialRef.current) {
          destinationGlowMaterialRef.current.opacity =
            0.28 * endpointOpacity;
        }

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

        {/* Persistent destination endpoint — remains visible while the trace
            persists, unlike the short-lived animated head and landing ring. */}
        <mesh
          ref={destinationGlowRef}
          position={endpoint}
          renderOrder={GLOBE_LAYER_ORDER.markers}
        >
          <sphereGeometry args={[DESTINATION_GLOW_RADIUS, 10, 10]} />
          <meshBasicMaterial
            ref={destinationGlowMaterialRef}
            color={color}
            transparent
            opacity={0.28}
            depthWrite={false}
            depthTest={true}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <mesh
          ref={destinationRef}
          position={endpoint}
          renderOrder={GLOBE_LAYER_ORDER.markers + 0.1}
        >
          <sphereGeometry args={[DESTINATION_RADIUS, 10, 10]} />
          <meshBasicMaterial
            ref={destinationMaterialRef}
            color={color}
            transparent
            opacity={1}
            depthWrite={false}
            depthTest={true}
          />
        </mesh>

        {(onSpotHover || onSpotSelect) && (
          <SpotEndpointHitArea
            lat={spot.dxLat}
            lon={spot.dxLon}
            spot={spot}
            occlusionOpacity={occlusionOpacity}
            onHover={onSpotHover}
            onHoverEnd={onSpotHoverEnd}
            onSelect={
              onSpotSelect
                ? (screenPos) => onSpotSelect(sourceSpot, screenPos)
                : undefined
            }
          />
        )}

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
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AnimatedSpotTraces({
  grid,
  maxTraces = 40,
  feedSpots: suppliedFeedSpots,
  candidateSpots: suppliedCandidateSpots,
  resolvedSpots: suppliedResolvedSpots,
  isFeedReady: suppliedIsFeedReady,
  hydrationKey = "standalone",
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
}: AnimatedSpotTracesProps) {
  const uiPrefs = useUIInteractionPrefs();
  const colorMode: SpotColorMode = uiPrefs.spotColorMode ?? "mode";

  // Retain a compatible standalone fallback, but map hosts inject the one
  // shared feed/candidate/resolution pipeline.
  const ownedFeed = useLiveSpots({
    grid,
    enabled: suppliedFeedSpots === undefined,
    refetchInterval: 60000,
  });
  const feedSpots = suppliedFeedSpots ?? ownedFeed.spots;
  const candidateSpots = suppliedCandidateSpots ?? feedSpots;
  const isFeedReady = suppliedIsFeedReady ?? ownedFeed.isFeedReady;
  const resolvedSpots = useMemo(
    () => suppliedResolvedSpots ?? resolveSpotLocations(candidateSpots),
    [candidateSpots, suppliedResolvedSpots],
  );

  // Track which spot IDs have already been queued
  const seenSpotIds = useRef<Set<string>>(new Set());
  const hydratedRef = useRef(false);
  const hydrationKeyRef = useRef(hydrationKey);

  // Pending queue of traces waiting to be animated
  const pendingQueue = useRef<QueuedTrace[]>([]);

  // Active traces currently animating
  const [activeTraces, setActiveTraces] = useState<QueuedTrace[]>([]);

  // Last time we dequeued a trace
  const lastDequeueTime = useRef(0);

  // Compute path points for a resolved spot and queue it
  const computeAndQueue = useCallback(
    (spot: ResolvedSpot, sourceSpot: LiveSpot) => {
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
          spot,
          sourceSpot,
        });
      } catch {
        // Silently skip spots with invalid paths
      }
    },
    [colorMode],
  );

  // Detect new spots and enqueue them
  useEffect(() => {
    if (hydrationKeyRef.current !== hydrationKey) {
      hydrationKeyRef.current = hydrationKey;
      seenSpotIds.current = new Set();
      hydratedRef.current = false;
      pendingQueue.current = [];
      lastDequeueTime.current = 0;
      setActiveTraces([]);
    }

    const eligibleIds = new Set(candidateSpots.map(({ id }) => id));
    const reconciliation = reconcileTraceFeed(
      seenSpotIds.current,
      hydratedRef.current,
      isFeedReady,
      feedSpots.map(({ id }) => id),
      eligibleIds,
    );
    seenSpotIds.current = reconciliation.seenIds;
    hydratedRef.current = reconciliation.hydrated;

    if (reconciliation.newEligibleIds.length > 0) {
      const sourceById = new Map(
        candidateSpots.map((spot) => [spot.id, spot] as const),
      );
      const resolvedById = new Map(
        resolvedSpots.map((spot) => [spot.id, spot] as const),
      );
      for (const id of reconciliation.newEligibleIds) {
        const sourceSpot = sourceById.get(id);
        const resolvedSpot = resolvedById.get(id);
        if (sourceSpot && resolvedSpot) {
          computeAndQueue(resolvedSpot, sourceSpot);
        }
      }
    }

    // Prevent unbounded growth while retaining a generous window beyond the
    // production feed cap, so filter/query churn cannot replay recent IDs.
    if (seenSpotIds.current.size > 2_000) {
      const entries = Array.from(seenSpotIds.current);
      seenSpotIds.current = new Set(entries.slice(entries.length - 1_000));
    }
  }, [
    candidateSpots,
    computeAndQueue,
    feedSpots,
    hydrationKey,
    isFeedReady,
    resolvedSpots,
  ]);

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

  const endpointPositions = useMemo(
    () =>
      activeTraces.map(({ spot }) => ({
        lat: spot.dxLat,
        lon: spot.dxLon,
      })),
    [activeTraces],
  );
  const { getOpacity: getEndpointOcclusionOpacity } =
    useGlobeOcclusionBatch(endpointPositions);

  return (
    <group name="animated-spot-traces">
      {activeTraces.map((trace) => (
        <TraceAnimation
          key={trace.spotId}
          spotId={trace.spotId}
          points={trace.points}
          color={trace.color}
          spot={trace.spot}
          sourceSpot={trace.sourceSpot}
          occlusionOpacity={getEndpointOcclusionOpacity(
            trace.spot.dxLat,
            trace.spot.dxLon,
          )}
          onSpotHover={onSpotHover}
          onSpotHoverEnd={onSpotHoverEnd}
          onSpotSelect={onSpotSelect}
          onComplete={handleComplete}
        />
      ))}
    </group>
  );
}

/**
 * AnimatedSpotTraces — globe adapter for the shared SP-06 motion scheduler.
 *
 * Path identity and direction come from SP-04 descriptors. Timing is visual,
 * not physical radio travel. Unknown direction stays static. Reduced motion and
 * hidden views suppress travel, dashes, pulse and bob without dropping reports.
 */

import React, {
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
} from "react";
import { MapAnimationClock } from "./MapAnimationClock";
import { useMapAnimationFrame } from "./hooks/useMapAnimationFrame";
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
import {
  getArcHeightForBand,
  getArcPointsWithHeight,
  getMultiHopArcPoints,
} from "@/lib/utils/arcHeight";
import { useUIInteractionPrefs } from "@/stores/userStore";
import { getScreenSpaceScale } from "@/lib/map/screenSpaceScale";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { useGlobeOcclusionBatch } from "@/hooks/useGlobeOcclusionBatch";
import type { LiveSpot } from "@/types/livespot";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import type { SpotHoverInteraction } from "@/hooks/useSpotHoverArbitration";
import {
  getTraceEndpointOpacity,
  type TracePhase,
} from "@/lib/map/spotTraceLifecycle";
import { prefersReducedMotion } from "@/lib/utils/a11y";
import { createSpotPreferences } from "@/lib/views/defaults";
import type { PathAppearance, PathDescriptor } from "@/lib/views/spotContracts";
import {
  normalizeLiveSpot,
  pathDescriptorForReport,
} from "@/lib/spots/presentation";
import {
  useSpotMotionScheduler,
  type PathMotionPreferences,
} from "@/lib/spots/motion";
import type { GlobeSpotLayoutResult } from "@/lib/map/globeSpotLayout";
import {
  spotLayoutCandidateId,
  spotLayoutReportId,
} from "@/lib/map/screenSpaceSpotLayout";

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
  /** Shared placement ownership for endpoint visibility and hit targets. */
  layout?: GlobeSpotLayoutResult;
  /** Whether every requested source has produced a successful baseline. */
  isFeedReady?: boolean;
  /** Changes when the backing query scope changes (for example QTH/source). */
  hydrationKey?: string;
  /** SP-04 path descriptors. When omitted, descriptors are derived via pathDescriptorForReport. */
  scenePaths?: PathDescriptor[];
  selectedPathId?: string | null;
  pathPreferences?: PathMotionPreferences;
  viewVisible?: boolean;
  osReducedMotion?: boolean;
  /** Reports whose trace lifecycle is currently mounted in the scene. */
  onActiveTracesChange?: (spots: ResolvedSpot[]) => void;
  onSpotHover?: (
    spot: LiveSpot,
    screenPos: ScreenAnchor,
    interaction: SpotHoverInteraction,
  ) => void;
  onSpotHoverEnd?: (
    spot?: LiveSpot,
    interaction?: SpotHoverInteraction,
  ) => void;
  onSpotSelect?: (spot: LiveSpot, screenPos: ScreenAnchor) => void;
}

interface QueuedTrace {
  spotId: string;
  pathId: string;
  points: [number, number, number][];
  color: string;
  spot: ResolvedSpot;
  sourceSpot: LiveSpot;
  appearance: PathAppearance;
  repeating: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Globe radius for trace rendering (above LiveSpotArcs at 1.005) */
const TRACE_RADIUS = 1.008;

/** Normalized progress at which the landing ring begins expanding (0–1) */
const LANDING_BLEND_START = 0.85;

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
  showSourceEndpoint: boolean;
  showDestinationEndpoint: boolean;
  sourceOcclusionOpacity: number;
  destinationOcclusionOpacity: number;
  onSpotHover?: (
    spot: LiveSpot,
    screenPos: ScreenAnchor,
    interaction: SpotHoverInteraction,
  ) => void;
  onSpotHoverEnd?: (
    spot?: LiveSpot,
    interaction?: SpotHoverInteraction,
  ) => void;
  onSpotSelect?: (spot: LiveSpot, screenPos: ScreenAnchor) => void;
  /** Callback when this trace finishes its full lifecycle — receives spotId */
  onComplete: (spotId: string) => void;
  appearance: PathAppearance;
  repeating: boolean;
}

const TraceAnimation = React.memo(
  function TraceAnimation({
    spotId,
    points,
    color,
    spot,
    sourceSpot,
    showSourceEndpoint,
    showDestinationEndpoint,
    sourceOcclusionOpacity,
    destinationOcclusionOpacity,
    onSpotHover,
    onSpotHoverEnd,
    onSpotSelect,
    onComplete,
    appearance,
    repeating,
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

    useMapAnimationFrame((state) => {
      if (!state.camera?.position) return;
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
      const travelSeconds = appearance.travelSeconds;
      const trailSeconds = appearance.trailSeconds;
      const fadeSeconds = appearance.fadeSeconds;
      const flowing = appearance.style === "flowing-dashes";

      if (flowing) {
        if (lineRef.current?.geometry) {
          lineRef.current.geometry.instanceCount = totalSegments;
        }
        const mat = lineRef.current?.material;
        if (mat && "dashOffset" in mat) {
          mat.dashOffset = -(elapsed / travelSeconds);
        }
        if (headRef.current) headRef.current.visible = false;
        if (headGlowRef.current) headGlowRef.current.visible = false;
        return;
      }

      if (phaseRef.current === "traveling") {
        const rawT = Math.min(elapsed / travelSeconds, 1);
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
        const pulseScale =
          appearance.style === "traveling-pulse"
            ? 1 + 0.18 * Math.sin(rawT * Math.PI)
            : 1;
        const bobScale = appearance.bounceGlow
          ? 1 + 0.02 * Math.sin(progress * Math.PI)
          : 1;

        // --- Integrated landing blend ---
        // When the head reaches the final 15% of travel, the landing ring
        // begins expanding while the head simultaneously shrinks and fades.
        // This creates a seamless "arrival" rather than an abrupt phase switch.
        const inLandingBlend = appearance.arrivalPulse && rawT >= LANDING_BLEND_START;
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
            headScreenScale *
            pulseScale *
            bobScale *
            (inLandingBlend ? 1 - easedBlendT : 1);
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
            headScreenScale *
            pulseScale *
            bobScale *
            (inLandingBlend ? 1 - easedBlendT : 1);
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
            if (repeating) {
              phaseRef.current = "traveling";
              startTimeRef.current = null;
              return;
            }
            phaseRef.current = "fadeout";
            startTimeRef.current = null; // will be re-initialized on next useFrame
          }, trailSeconds * 1000);
        }
      } else if (phaseRef.current === "fadeout") {
        // Re-initialize start time after waking from persist sleep
        if (startTimeRef.current === null) {
          startTimeRef.current = clock;
          return;
        }
        const fadeElapsed = clock - startTimeRef.current;
        const rawT = Math.min(fadeElapsed / fadeSeconds, 1);
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

    const showPath = showSourceEndpoint || showDestinationEndpoint;

    return (
      // Keep the animation lifecycle mounted while an aggregate owns both
      // endpoint surfaces. The trace can complete without leaving an orphan
      // path or a hidden member's pointer target in the scene.
      <group visible={showPath}>
        {/* Trail line — rendered with ALL points; instanceCount controls draw progress */}
        <Line
          ref={lineRef}
          points={points}
          color={color}
          lineWidth={2}
          opacity={0.8}
          transparent
          dashed={appearance.style === "flowing-dashes"}
          dashSize={0.05}
          gapSize={0.04}
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
          visible={showDestinationEndpoint}
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
          visible={showDestinationEndpoint}
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
          <>
            {/* A trace describes a report path, so both the reporting station
                and the heard/contact station must expose the same exact report
                snapshot. Previously only the destination was clickable. */}
            {showSourceEndpoint && (
              <SpotEndpointHitArea
                lat={spot.spotterLat}
                lon={spot.spotterLon}
                spot={spot}
                occlusionOpacity={sourceOcclusionOpacity}
                onHover={onSpotHover}
                onHoverEnd={onSpotHoverEnd}
                onSelect={
                  onSpotSelect
                    ? (screenPos) => onSpotSelect(sourceSpot, screenPos)
                    : undefined
                }
              />
            )}
            {showDestinationEndpoint && (
              <SpotEndpointHitArea
                lat={spot.dxLat}
                lon={spot.dxLon}
                spot={spot}
                occlusionOpacity={destinationOcclusionOpacity}
                onHover={onSpotHover}
                onHoverEnd={onSpotHoverEnd}
                onSelect={
                  onSpotSelect
                    ? (screenPos) => onSpotSelect(sourceSpot, screenPos)
                    : undefined
                }
              />
            )}
          </>
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

export function AnimatedSpotTraces(props: AnimatedSpotTracesProps) {
  return <MapAnimationClock><AnimatedSpotTracesContent {...props} /></MapAnimationClock>;
}

function locationCoordinates(
  location: PathDescriptor["from"]["location"],
): { lat: number; lon: number } | null {
  if (location.kind === "unavailable") return null;
  return location.coordinates;
}

function AnimatedSpotTracesContent({
  grid,
  maxTraces,
  feedSpots: suppliedFeedSpots,
  candidateSpots: suppliedCandidateSpots,
  resolvedSpots: suppliedResolvedSpots,
  layout,
  isFeedReady: suppliedIsFeedReady,
  hydrationKey = "standalone",
  scenePaths,
  selectedPathId = null,
  pathPreferences,
  viewVisible,
  osReducedMotion,
  onActiveTracesChange,
  onSpotHover,
  onSpotHoverEnd,
  onSpotSelect,
}: AnimatedSpotTracesProps) {
  const uiPrefs = useUIInteractionPrefs();
  const colorMode: SpotColorMode = uiPrefs.spotColorMode ?? "mode";
  const { tick, reset } = useSpotMotionScheduler();
  const defaults = useMemo(() => createSpotPreferences().paths, []);
  const preferences = useMemo<PathMotionPreferences>(() => {
    const base = pathPreferences ?? defaults;
    const cap = Math.min(12, maxTraces ?? base.maxActive);
    return { ...base, maxActive: Math.max(1, Math.min(base.maxActive, cap)) };
  }, [defaults, maxTraces, pathPreferences]);

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

  const derived = useMemo(() => {
    const usedIds = new Map<string, string>();
    const byReportId = new Map<string, { source: LiveSpot; resolved: ResolvedSpot }>();
    const observedReportIds: string[] = [];
    const resolvedById = new Map(resolvedSpots.map((spot) => [spot.id, spot] as const));
    for (const spot of feedSpots) {
      const report = normalizeLiveSpot(spot, usedIds);
      if (report) observedReportIds.push(report.id);
    }
    const paths: PathDescriptor[] = scenePaths ? [...scenePaths] : [];
    for (const spot of candidateSpots) {
      const report = normalizeLiveSpot(spot, usedIds);
      if (!report) continue;
      const resolved = resolvedById.get(spot.id);
      if (resolved) byReportId.set(report.id, { source: spot, resolved });
      if (!scenePaths) {
        const descriptor = pathDescriptorForReport(report);
        if (descriptor) paths.push(descriptor);
      }
    }
    return { paths, byReportId, observedReportIds };
  }, [candidateSpots, feedSpots, resolvedSpots, scenePaths]);

  const hydrationKeyRef = useRef(hydrationKey);
  const nowMsRef = useRef(0);
  const [activeTraces, setActiveTraces] = useState<QueuedTrace[]>([]);
  const activeKeyRef = useRef("");
  const tracesByPathRef = useRef(new Map<string, QueuedTrace>());
  const inputRef = useRef({
    derived,
    preferences,
    selectedPathId,
    isFeedReady,
    viewVisible,
    osReducedMotion,
  });
  inputRef.current = {
    derived,
    preferences,
    selectedPathId,
    isFeedReady,
    viewVisible,
    osReducedMotion,
  };

  const buildTrace = useCallback(
    (path: PathDescriptor, appearance: PathAppearance, repeating: boolean): QueuedTrace | null => {
      const match = path.reportIds
        .map((id) => derived.byReportId.get(id))
        .find((item): item is { source: LiveSpot; resolved: ResolvedSpot } => item != null);
      if (!match) return null;
      const from = locationCoordinates(path.from.location);
      const to = locationCoordinates(path.to.location);
      if (!from || !to) return null;
      const band = getBandFromFrequency(match.resolved.frequency);
      const points3D =
        appearance.shape === "ionospheric-hops"
          ? getMultiHopArcPoints(from.lat, from.lon, to.lat, to.lon, band, TRACE_RADIUS)
          : getArcPointsWithHeight(
              from.lat,
              from.lon,
              to.lat,
              to.lon,
              getArcHeightForBand(band),
              TRACE_RADIUS,
            );
      const allFinite = points3D.every(
        (pt) => Number.isFinite(pt[0]) && Number.isFinite(pt[1]) && Number.isFinite(pt[2]),
      );
      if (!allFinite || points3D.length < 2) return null;
      return {
        spotId: match.resolved.id,
        pathId: path.id,
        points: points3D,
        color: getSpotColor(match.resolved, colorMode),
        spot: match.resolved,
        sourceSpot: match.source,
        appearance,
        repeating,
      };
    },
    [colorMode, derived.byReportId],
  );

  const applySnapshot = useCallback((nowMs: number) => {
    const current = inputRef.current;
    const visible = (current.viewVisible ?? true) &&
      !(typeof document !== "undefined" && document.visibilityState === "hidden");
    const snapshot = tick({
      nowMs,
      ready: current.isFeedReady,
      visible,
      osReducedMotion: current.osReducedMotion ?? prefersReducedMotion(),
      paths: current.derived.paths.map((path) => ({
        path,
        selected: current.selectedPathId === path.id,
      })),
      preferences: current.preferences,
      displayedReportIds: current.derived.paths.flatMap((path) => [...path.reportIds]),
      observedReportIds: current.derived.observedReportIds,
    });
    const nextTraces: QueuedTrace[] = [];
    for (const presentation of snapshot.presentations) {
      if (presentation.travelProgress === null) continue;
      const existing = tracesByPathRef.current.get(presentation.pathId);
      if (existing && existing.appearance.shape === presentation.appearance.shape) {
        existing.appearance = presentation.appearance;
        existing.repeating = presentation.repeating;
        nextTraces.push(existing);
        continue;
      }
      const path = current.derived.paths.find((item) => item.id === presentation.pathId);
      if (!path) continue;
      const built = buildTrace(path, presentation.appearance, presentation.repeating);
      if (built) {
        tracesByPathRef.current.set(presentation.pathId, built);
        nextTraces.push(built);
      }
    }
    tracesByPathRef.current = new Map(nextTraces.map((trace) => [trace.pathId, trace]));
    const key = nextTraces.map((trace) => trace.pathId).join("|");
    if (key !== activeKeyRef.current) {
      activeKeyRef.current = key;
      setActiveTraces(nextTraces);
    }
  }, [buildTrace, tick]);

  useEffect(() => {
    onActiveTracesChange?.(activeTraces.map(({ spot }) => spot));
  }, [activeTraces, onActiveTracesChange]);

  useEffect(() => {
    if (hydrationKeyRef.current !== hydrationKey) {
      hydrationKeyRef.current = hydrationKey;
      reset();
      tracesByPathRef.current = new Map();
      activeKeyRef.current = "";
      setActiveTraces([]);
    }
    applySnapshot(nowMsRef.current);
  }, [
    applySnapshot,
    derived,
    hydrationKey,
    isFeedReady,
    preferences,
    reset,
    selectedPathId,
    viewVisible,
    osReducedMotion,
  ]);

  useEffect(() => () => reset(), [reset]);

  useEffect(() => {
    const onVisibility = () => applySnapshot(performance.now());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [applySnapshot]);

  useMapAnimationFrame((state) => {
    nowMsRef.current = state.clock.getElapsedTime() * 1000;
    applySnapshot(nowMsRef.current);
  });

  const handleComplete = useCallback((_spotId: string) => {
    // Scheduler owns mount lifetime. Fade is visual; unmount happens when travelProgress becomes null.
  }, []);

  const endpointPositions = useMemo(
    () =>
      activeTraces.flatMap(({ spot }) => [
        { lat: spot.spotterLat, lon: spot.spotterLon },
        { lat: spot.dxLat, lon: spot.dxLon },
      ]),
    [activeTraces],
  );
  const { getOpacity: getEndpointOcclusionOpacity } =
    useGlobeOcclusionBatch(endpointPositions);
  const placedCandidateIds = useMemo(
    () =>
      layout
        ? new Set(
            layout.placements.map(({ candidate }) => candidate.id),
          )
        : null,
    [layout],
  );

  return (
    <group name="animated-spot-traces">
      {activeTraces.map((trace) => {
        const reportId = spotLayoutReportId(
          trace.sourceSpot.source,
          trace.sourceSpot.id,
        );
        const showSourceEndpoint =
          placedCandidateIds?.has(
            spotLayoutCandidateId(reportId, "spotter"),
          ) ?? true;
        const showDestinationEndpoint =
          placedCandidateIds?.has(spotLayoutCandidateId(reportId, "dx")) ??
          true;
        return (
          <TraceAnimation
            key={trace.spotId}
            spotId={trace.spotId}
            points={trace.points}
            color={trace.color}
            spot={trace.spot}
            sourceSpot={trace.sourceSpot}
            showSourceEndpoint={showSourceEndpoint}
            showDestinationEndpoint={showDestinationEndpoint}
            sourceOcclusionOpacity={getEndpointOcclusionOpacity(
              trace.spot.spotterLat,
              trace.spot.spotterLon,
            )}
            destinationOcclusionOpacity={getEndpointOcclusionOpacity(
              trace.spot.dxLat,
              trace.spot.dxLon,
            )}
            onSpotHover={onSpotHover}
            onSpotHoverEnd={onSpotHoverEnd}
            onSpotSelect={onSpotSelect}
            onComplete={handleComplete}
            appearance={trace.appearance}
            repeating={trace.repeating}
          />
        );
      })}
    </group>
  );
}

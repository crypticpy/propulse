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
import { prefersReducedMotion } from "@/lib/utils/a11y";
import { createSpotPreferences } from "@/lib/views/defaults";
import type { PathAppearance, PathDescriptor } from "@/lib/views/spotContracts";
import {
  normalizeLiveSpot,
  pathDescriptorForReport,
} from "@/lib/spots/presentation";
import {
  motionTraceSignature,
  sampleAppearance,
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
  staticMode: boolean;
  startedAtMs: number | null;
  geometryKey: string;
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
  appearance: PathAppearance;
  repeating: boolean;
  staticMode: boolean;
  startedAtMs: number | null;
}

const TraceAnimation = React.memo(
  function TraceAnimation({
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
    appearance,
    repeating,
    staticMode,
    startedAtMs,
  }: TraceAnimationProps) {
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
        if (line) {
          line.geometry?.dispose();
          line.material?.dispose();
        }
      };
    }, []);

    useMapAnimationFrame((state) => {
      if (!state.camera?.position) return;
      const endpointScale = getScreenSpaceScale(
        state.camera.position.distanceTo(endpointVector),
      );
      destinationRef.current?.scale?.setScalar(endpointScale);
      destinationGlowRef.current?.scale?.setScalar(endpointScale);

      const drawFullPath = (opacity: number) => {
        if (lineRef.current?.geometry) {
          lineRef.current.geometry.instanceCount = totalSegments;
        }
        if (lineRef.current?.material && "opacity" in lineRef.current.material) {
          lineRef.current.material.opacity = opacity;
        }
        if (headRef.current) headRef.current.visible = false;
        if (headGlowRef.current) headGlowRef.current.visible = false;
        if (ringRef.current) ringRef.current.visible = false;
      };

      if (staticMode) {
        drawFullPath(0.8);
        if (destinationMaterialRef.current) destinationMaterialRef.current.opacity = 1;
        if (destinationGlowMaterialRef.current) {
          destinationGlowMaterialRef.current.opacity = 0.28;
        }
        return;
      }

      const nowMs = state.clock.getElapsedTime() * 1000;
      const elapsed = Math.max(0, nowMs - (startedAtMs ?? nowMs));
      const sampled = sampleAppearance(appearance, elapsed, repeating);
      const flowing = appearance.style === "flowing-dashes";

      if (flowing) {
        drawFullPath(0.8);
        const mat = lineRef.current?.material;
        if (mat && "dashOffset" in mat) {
          mat.dashOffset = -sampled.dashOffset;
        }
        return;
      }

      const rawT = sampled.travelProgress;
      if (rawT === null || rawT >= 1) {
        drawFullPath(0.8 * sampled.trailOpacity);
        return;
      }

      const visibleSegments = Math.max(
        0,
        Math.min(Math.floor(rawT * totalSegments), totalSegments),
      );

      if (lineRef.current?.geometry) {
        lineRef.current.geometry.instanceCount = visibleSegments;
      }
      if (lineRef.current?.material && "opacity" in lineRef.current.material) {
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
      const pulseScale = 1 + 0.18 * sampled.pulseStrength;
      const bobScale = 1 + sampled.bobOffset;

      const inLandingBlend = sampled.arrivalPulse && rawT >= LANDING_BLEND_START;
      const blendT = inLandingBlend
        ? (rawT - LANDING_BLEND_START) / (1 - LANDING_BLEND_START)
        : 0;
      const easedBlendT = easeInQuad(blendT);

      if (headRef.current) {
        headRef.current.position.set(
          currentPoint[0],
          currentPoint[1],
          currentPoint[2],
        );
        headRef.current.visible = true;
        const headScale =
          headScreenScale *
          pulseScale *
          bobScale *
          (inLandingBlend ? 1 - easedBlendT : 1);
        headRef.current.scale?.setScalar(headScale);
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
        headGlowRef.current.scale?.setScalar(glowScale);
        const glowMat = headGlowRef.current.material as THREE.MeshBasicMaterial;
        if (glowMat) {
          glowMat.opacity = 0.25 * (inLandingBlend ? 1 - easedBlendT : 1);
        }
      }

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
        ringRef.current.scale?.set(ringScale, ringScale, ringScale);
        ringMaterialRef.current.opacity = 0.7 * (1 - easedBlendT);
      }
    });

    if (points.length < 2) return null;

    const showPath = showSourceEndpoint || showDestinationEndpoint;

    return (
      // Keep the animation lifecycle mounted while an aggregate owns both
      // endpoint surfaces. The trace can complete without leaving an orphan
      // path or a hidden member's pointer target in the scene.
      <group
        visible={showPath}
        name={staticMode ? "spot-trace-static" : "spot-trace-motion"}
      >
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

function traceGeometryKey(
  path: PathDescriptor,
  appearance: PathAppearance,
  frequency: number,
): string {
  const from = locationCoordinates(path.from.location);
  const to = locationCoordinates(path.to.location);
  return [
    appearance.shape,
    from?.lat ?? "",
    from?.lon ?? "",
    to?.lat ?? "",
    to?.lon ?? "",
    frequency,
  ].join(":");
}

function traceDrawingSignature(
  presentation: Parameters<typeof motionTraceSignature>[0],
  color: string,
  spot: ResolvedSpot,
  sourceSpot: LiveSpot,
  geometryKey: string,
): string {
  return [
    motionTraceSignature(presentation),
    geometryKey,
    color,
    spot.frequency,
    spot.spotterLat,
    spot.spotterLon,
    spot.dxLat,
    spot.dxLon,
    spot.mode,
    spot.callsign,
    spot.dxLocApprox ? "1" : "0",
    sourceSpot.id,
    sourceSpot.spotter,
    sourceSpot.dx,
    sourceSpot.comment,
    sourceSpot.frequency ?? "",
    sourceSpot.band ?? "",
  ].join(":");
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
        staticMode: true,
        startedAtMs: null,
        geometryKey: traceGeometryKey(path, appearance, match.resolved.frequency),
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
    const signatures: string[] = [];
    for (const presentation of snapshot.presentations) {
      const path = current.derived.paths.find((item) => item.id === presentation.pathId);
      if (!path) continue;
      const match = path.reportIds
        .map((id) => current.derived.byReportId.get(id))
        .find((item): item is { source: LiveSpot; resolved: ResolvedSpot } => item != null);
      if (!match) continue;
      const staticMode = presentation.travelProgress === null;
      const color = getSpotColor(match.resolved, colorMode);
      const geometryKey = traceGeometryKey(path, presentation.appearance, match.resolved.frequency);
      const existing = tracesByPathRef.current.get(presentation.pathId);
      let next: QueuedTrace | null = null;
      if (existing && existing.geometryKey === geometryKey) {
        next = {
          ...existing,
          color,
          spot: match.resolved,
          sourceSpot: match.source,
          appearance: presentation.appearance,
          repeating: presentation.repeating,
          staticMode,
          startedAtMs: presentation.startedAtMs,
        };
      } else {
        const built = buildTrace(path, presentation.appearance, presentation.repeating);
        if (built) {
          built.staticMode = staticMode;
          built.startedAtMs = presentation.startedAtMs;
          next = built;
        }
      }
      if (!next) continue;
      tracesByPathRef.current.set(presentation.pathId, next);
      nextTraces.push(next);
      signatures.push(
        traceDrawingSignature(presentation, color, match.resolved, match.source, geometryKey),
      );
    }
    tracesByPathRef.current = new Map(nextTraces.map((trace) => [trace.pathId, trace]));
    const key = signatures.join("|");
    if (key !== activeKeyRef.current) {
      activeKeyRef.current = key;
      setActiveTraces(nextTraces);
    }
  }, [buildTrace, colorMode, tick]);

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
    const onVisibility = () => applySnapshot(nowMsRef.current);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [applySnapshot]);

  useMapAnimationFrame((state) => {
    nowMsRef.current = state.clock.getElapsedTime() * 1000;
    applySnapshot(nowMsRef.current);
  });

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
            appearance={trace.appearance}
            repeating={trace.repeating}
            staticMode={trace.staticMode}
            startedAtMs={trace.startedAtMs}
          />
        );
      })}
    </group>
  );
}

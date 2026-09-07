/**
 * RayPathArc Component
 *
 * Renders a multi-hop ionospheric skip path on the 3D globe. Each hop is
 * drawn as a parabolic arc from one ground point to the next, peaking at
 * the reflection height (visually exaggerated 5x for clarity).
 *
 * Inspectable points are built from explicit model descriptors (SP-07).
 * Drawn shell height is decorative and is never reported as modeled height.
 */

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Html, Line } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";
import { MapAnimationClock } from "./MapAnimationClock";
import { useMapAnimationFrame } from "./hooks/useMapAnimationFrame";
import { getPathPoints } from "@/lib/utils/path";
import type { RayTraceResult } from "@/lib/utils/rayTrace";
import { calculateLayerHeights } from "@/lib/utils/ionosphere";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { useGlobeOcclusionBatch } from "@/hooks/useGlobeOcclusionBatch";
import { ReflectionMarker } from "./ReflectionMarker";
import { PathPointHitArea } from "./PathPointHitArea";
import {
  PathPointInspector,
  type PathPointInspectorOpen,
} from "./PathPointInspector";
import {
  IONOSPHERE_LAYER_COLORS,
  heightToRadius,
} from "./IonosphericShells";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import type { PathDescriptor } from "@/lib/views/spotContracts";
import { modelProvenanceSchema } from "@/lib/views/spotContracts";
import type { ScreenAnchor } from "@/lib/map/anchoredOverlay";
import { motionIsSuppressed, type MotionPresentation } from "@/lib/spots/motion";
import {
  APEX_DISPLAY_HEIGHT_BOOST,
  buildPathPointSet,
  computeGroundPoints,
  decorativeShellPlacement,
} from "@/lib/spots/pathPoints";
import { z } from "zod";

type ModelProvenance = z.infer<typeof modelProvenanceSchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Visual exaggeration factor for reflection heights */
const HEIGHT_EXAG = 5;

/** Earth radius in km (must match rayTrace.ts) */
const EARTH_RADIUS_KM = 6371;

/** Base radius for arc start/end (slightly above globe surface) */
const BASE_RADIUS = 1.003;

/** Number of curve segments per hop */
const SEGMENTS_PER_HOP = 20;

/** Animation speed for flowing dashes */
const DASH_ANIMATION_SPEED = 0.4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RayPathArcProps {
  /** Complete ray trace result from traceRayPath() */
  result: RayTraceResult;
  /** Start latitude */
  startLat: number;
  /** Start longitude */
  startLon: number;
  /** End latitude */
  endLat: number;
  /** End longitude */
  endLon: number;
  /** Path mode — short (default) or long */
  pathMode?: "short" | "long";
  /** Visual weight when both short and long path are shown */
  emphasis?: "primary" | "secondary";
  /** When true, render ionosphere-layer-colored bounce highlights */
  showIonosphereHighlights?: boolean;
  /** Display time — needed to compute ionospheric layer heights for highlights */
  displayTime?: Date;
  /** SP-04 path identity when the selected path is a scene descriptor. */
  path?: PathDescriptor | null;
  pathId?: string;
  model?: ModelProvenance | null;
  nowMs?: number;
  /** SP-06 motion snapshot; reduced motion keeps points inspectable. */
  motion?: MotionPresentation | null;
  osReducedMotion?: boolean;
  reduceMotion?: boolean;
  /** Opens existing path analysis. Does not recenter or issue radio commands. */
  onOpenPathAnalysis?: () => void;
  portalTarget?: Element | null;
}

interface BounceHighlightData {
  lat: number;
  lon: number;
  radius: number;
  visualShell: "D" | "E" | "F1" | "F2";
  color: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latLonTo3D(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

/** Map a quality score (0-100) to a color string */
function hopQualityColor(score: number): string {
  if (score >= 80) return "#22c55e"; // green  — excellent
  if (score >= 60) return "#eab308"; // yellow — good
  if (score >= 35) return "#f97316"; // orange — marginal
  return "#ef4444"; // red    — unlikely / impossible
}

/** Detect prefers-reduced-motion */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}

function getLineMaterial(
  line: Line2 | LineSegments2,
): THREE.Material | undefined {
  const material = line.material;
  if (Array.isArray(material)) return material[0];
  return material;
}

function hasDashOffset(
  material: THREE.Material,
): material is THREE.Material & { dashOffset: number } {
  return (
    "dashOffset" in material &&
    typeof (material as { dashOffset?: unknown }).dashOffset === "number"
  );
}

function hasOpacity(
  material: THREE.Material,
): material is THREE.Material & { opacity: number } {
  return typeof (material as { opacity?: unknown }).opacity === "number";
}

function modelFromResult(
  result: RayTraceResult,
  displayTime?: Date,
): ModelProvenance | null {
  const modeledAtMs = displayTime?.getTime();
  if (modeledAtMs === undefined) return null;
  return {
    name: "ITU-R P.533 ray trace",
    version: "propulse-physics",
    modeledAtMs,
    inputsAsOfMs: modeledAtMs,
    explanation: result.summary,
  };
}

function stopTraceEvent(event: ThreeEvent<MouseEvent | PointerEvent>) {
  event.stopPropagation();
}

// ---------------------------------------------------------------------------
// Geometry generation
// ---------------------------------------------------------------------------

/**
 * Generate parabolic arc points for a single hop.
 * The arc starts and ends at BASE_RADIUS and peaks at peakRadius.
 *
 * The reflection height is boosted 15% so the arc visually reaches into
 * the ionospheric shell layer (the shell radii use calculateLayerHeights
 * which produces slightly higher values than estimateHmF2 in rayTrace).
 */
function generateHopPoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  reflectionHeightKm: number,
  segmentsPerHop: number = SEGMENTS_PER_HOP,
): Array<[number, number, number]> {
  // Boost height so arcs visually intersect the ionospheric shells
  const boostedHeight = reflectionHeightKm * APEX_DISPLAY_HEIGHT_BOOST;
  const peakRadius = 1.0 + (boostedHeight / EARTH_RADIUS_KM) * HEIGHT_EXAG;

  const pathPts = getPathPoints(
    startLat,
    startLon,
    endLat,
    endLon,
    segmentsPerHop,
  );

  const points: Array<[number, number, number]> = [];

  for (let i = 0; i < pathPts.length; i++) {
    const t = i / (pathPts.length - 1);
    // Parabolic height profile: peaks at t = 0.5
    const heightFactor = 4 * t * (1 - t);
    const radius = BASE_RADIUS + (peakRadius - BASE_RADIUS) * heightFactor;
    points.push(latLonTo3D(pathPts[i].lat, pathPts[i].lon, radius));
  }

  return points;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Animated dashed line for a single hop */
function AnimatedHopLine({
  points,
  color,
  lineWidth,
  opacity,
  shouldAnimate,
  onTraceClick,
}: {
  points: Array<[number, number, number]>;
  color: string;
  lineWidth: number;
  opacity: number;
  shouldAnimate: boolean;
  onTraceClick?: () => void;
}) {
  const lineRef = useRef<Line2 | LineSegments2 | null>(null);
  const dashOffsetRef = useRef(0);

  useMapAnimationFrame((_, delta) => {
    if (!shouldAnimate || !lineRef.current) return;

    dashOffsetRef.current -= delta * DASH_ANIMATION_SPEED;
    const material = getLineMaterial(lineRef.current);
    if (material && hasDashOffset(material)) {
      material.dashOffset = dashOffsetRef.current;
    }
  }, shouldAnimate);

  if (points.length < 2) return null;

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={lineWidth}
      opacity={opacity}
      transparent
      dashed
      dashSize={0.02}
      gapSize={0.012}
      depthTest={true}
      depthWrite={false}
      renderOrder={GLOBE_LAYER_ORDER.arcs + 0.1}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        stopTraceEvent(event);
        onTraceClick?.();
      }}
      onPointerDown={stopTraceEvent}
      onPointerUp={stopTraceEvent}
      onDoubleClick={stopTraceEvent}
    />
  );
}

/** Static solid line fallback (reduced-motion) */
function StaticHopLine({
  points,
  color,
  lineWidth,
  opacity,
  onTraceClick,
}: {
  points: Array<[number, number, number]>;
  color: string;
  lineWidth: number;
  opacity: number;
  onTraceClick?: () => void;
}) {
  if (points.length < 2) return null;

  return (
    <Line
      points={points}
      color={color}
      lineWidth={lineWidth}
      opacity={opacity}
      transparent
      depthTest={true}
      depthWrite={false}
      renderOrder={GLOBE_LAYER_ORDER.arcs + 0.1}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        stopTraceEvent(event);
        onTraceClick?.();
      }}
      onPointerDown={stopTraceEvent}
      onPointerUp={stopTraceEvent}
      onDoubleClick={stopTraceEvent}
    />
  );
}

/** Subtle glow line rendered behind the main path */
function HopGlowLine({
  points,
  color,
  shouldAnimate,
}: {
  points: Array<[number, number, number]>;
  color: string;
  shouldAnimate: boolean;
}) {
  const lineRef = useRef<Line2 | LineSegments2 | null>(null);

  useMapAnimationFrame(({ clock }) => {
    if (!shouldAnimate || !lineRef.current) return;

    const material = getLineMaterial(lineRef.current);
    if (material && hasOpacity(material)) {
      material.opacity = Math.sin(clock.elapsedTime * 2) * 0.08 + 0.14;
    }
  }, shouldAnimate);

  if (points.length < 2) return null;

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={7}
      opacity={0.14}
      transparent
      depthWrite={false}
      depthTest={true}
      renderOrder={GLOBE_LAYER_ORDER.arcs}
      raycast={() => {}}
    />
  );
}

/**
 * Ionosphere bounce highlight — a pulsing ring at the point where the
 * ray path touches an ionospheric layer. Colored by layer type.
 */
function IonosphereBounceHighlight({
  lat,
  lon,
  radius,
  color,
  shouldAnimate,
}: {
  lat: number;
  lon: number;
  radius: number;
  color: string;
  shouldAnimate: boolean;
}) {
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const coreMtlRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringMtlRef = useRef<THREE.MeshBasicMaterial>(null);

  const position = useMemo(
    () => latLonTo3D(lat, lon, radius),
    [lat, lon, radius],
  );

  // Orient the ring to face outward from the globe center
  const quaternion = useMemo(() => {
    const pos = new THREE.Vector3(...position);
    const up = pos.clone().normalize();
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    return q;
  }, [position]);

  // Pulsing animation
  useMapAnimationFrame(({ clock }) => {
    if (!shouldAnimate) return;
    const t = clock.elapsedTime;
    const pulse = Math.sin(t * 2.5) * 0.35 + 0.65;

    if (coreMtlRef.current) {
      coreMtlRef.current.opacity = pulse * 0.95;
    }
    if (ringMtlRef.current) {
      ringMtlRef.current.opacity = pulse * 0.4;
    }
    if (ringRef.current) {
      const scale = 1.0 + (1 - pulse) * 0.3;
      ringRef.current.scale.setScalar(scale);
    }
  }, shouldAnimate);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return (
    <group>
      {/* Core bright sphere */}
      <mesh
        ref={coreRef}
        position={position}
        renderOrder={GLOBE_LAYER_ORDER.markers}
      >
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial
          ref={coreMtlRef}
          color={color}
          transparent
          opacity={0.9}
          depthWrite={false}
          depthTest={true}
        />
      </mesh>

      {/* Pulsing ring (torus) oriented radially outward */}
      <mesh
        ref={ringRef}
        position={position}
        quaternion={quaternion}
        renderOrder={GLOBE_LAYER_ORDER.markers + 0.1}
      >
        <torusGeometry args={[0.022, 0.003, 12, 32]} />
        <meshBasicMaterial
          ref={ringMtlRef}
          color={color}
          transparent
          opacity={0.4}
          depthWrite={false}
          depthTest={true}
        />
      </mesh>

      {/* Outer glow sphere */}
      <mesh position={position} renderOrder={GLOBE_LAYER_ORDER.markers + 0.2}>
        <sphereGeometry args={[0.028, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          depthWrite={false}
          depthTest={true}
        />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RayPathArc({
  result,
  startLat,
  startLon,
  endLat,
  endLon,
  pathMode = "short",
  emphasis = "primary",
  showIonosphereHighlights = false,
  displayTime,
  path = null,
  pathId,
  model,
  nowMs,
  motion = null,
  osReducedMotion,
  reduceMotion = false,
  onOpenPathAnalysis,
  portalTarget,
}: RayPathArcProps) {
  const mediaReducedMotion = useReducedMotion();
  const reduced = motionIsSuppressed(
    osReducedMotion ?? mediaReducedMotion,
    reduceMotion,
  );
  const shouldAnimate = motion ? motion.travelProgress !== null && !reduced : !reduced;
  const sfi = useCurrentSFI() ?? 100;

  const [open, setOpen] = useState<PathPointInspectorOpen>("closed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<ScreenAnchor | null>(null);

  const numHops = result.hops.length;

  const layerHeights = useMemo(() => {
    if (!showIonosphereHighlights || !displayTime) return null;
    const month = displayTime.getUTCMonth() + 1;
    return calculateLayerHeights(45, month, sfi);
  }, [showIonosphereHighlights, displayTime, sfi]);

  const resolvedModel = useMemo(
    () => path?.model ?? model ?? modelFromResult(result, displayTime),
    [path, model, result, displayTime],
  );
  const resolvedNowMs = nowMs ?? displayTime?.getTime() ?? resolvedModel?.modeledAtMs ?? 0;

  const pointSet = useMemo(
    () =>
      buildPathPointSet({
        pathId: path?.id ?? pathId ?? `ray-${pathMode}`,
        path,
        result,
        model: resolvedModel,
        nowMs: resolvedNowMs,
        startLat,
        startLon,
        endLat,
        endLon,
        pathMode,
        includeShellHighlights: showIonosphereHighlights,
        layerHeights,
      }),
    [
      path,
      pathId,
      pathMode,
      result,
      resolvedModel,
      resolvedNowMs,
      startLat,
      startLon,
      endLat,
      endLon,
      showIonosphereHighlights,
      layerHeights,
    ],
  );

  const occlusionPositions = useMemo(
    () => pointSet.points.map((point) => point.coordinates),
    [pointSet],
  );
  const { getOpacity, version } = useGlobeOcclusionBatch(occlusionPositions);

  const { hopSegments, reflectionMarkers, groundMarkers, bounceHighlights } =
    useMemo(() => {
      if (numHops === 0) {
        return {
          hopSegments: [],
          reflectionMarkers: [],
          groundMarkers: [],
          bounceHighlights: [],
        };
      }

      const groundPts = computeGroundPoints(
        startLat,
        startLon,
        endLat,
        endLon,
        numHops,
        pathMode,
      );

      const segments: Array<{
        points: Array<[number, number, number]>;
        color: string;
        qualityScore: number;
      }> = [];

      const reflections: Array<{
        lat: number;
        lon: number;
        radius: number;
        color: string;
        qualityScore: number;
      }> = [];

      const grounds: Array<{
        lat: number;
        lon: number;
        color: string;
      }> = [];

      const highlights: BounceHighlightData[] = [];

      for (let i = 0; i < numHops; i++) {
        const hop = result.hops[i];
        const from = groundPts[i];
        const to = groundPts[i + 1];

        if (!from || !to) continue;

        const reflectionHeightKm = hop.hmF2;
        const color = hopQualityColor(hop.qualityScore);
        const pts = generateHopPoints(
          from.lat,
          from.lon,
          to.lat,
          to.lon,
          reflectionHeightKm,
        );

        segments.push({
          points: pts,
          color,
          qualityScore: hop.qualityScore,
        });

        const rp = hop.reflectionPoint;
        const boostedHeight = reflectionHeightKm * APEX_DISPLAY_HEIGHT_BOOST;
        const peakRadius =
          1.0 + (boostedHeight / EARTH_RADIUS_KM) * HEIGHT_EXAG;

        reflections.push({
          lat: rp.lat,
          lon: rp.lon,
          radius: peakRadius,
          color,
          qualityScore: hop.qualityScore,
        });

        if (showIonosphereHighlights && layerHeights) {
          const shell = decorativeShellPlacement(
            reflectionHeightKm,
            layerHeights,
          );
          highlights.push({
            lat: rp.lat,
            lon: rp.lon,
            radius: heightToRadius(shell.displayHeightKm),
            visualShell: shell.visualShell,
            color: IONOSPHERE_LAYER_COLORS[shell.visualShell],
          });
        }

        if (i > 0) {
          const prevScore = result.hops[i - 1].qualityScore;
          const worstScore = Math.min(prevScore, hop.qualityScore);
          grounds.push({
            lat: from.lat,
            lon: from.lon,
            color: hopQualityColor(worstScore),
          });
        }
      }

      return {
        hopSegments: segments,
        reflectionMarkers: reflections,
        groundMarkers: grounds,
        bounceHighlights: highlights,
      };
    }, [
      numHops,
      result,
      startLat,
      startLon,
      endLat,
      endLon,
      pathMode,
      showIonosphereHighlights,
      layerHeights,
    ]);

  const handleHover = useCallback((id: string, screenPos: ScreenAnchor) => {
    setHoveredId(id);
    setAnchor(screenPos);
    setOpen((current) => (current === "card" || current === "path" ? current : "hover"));
  }, []);

  const handleHoverEnd = useCallback((id: string) => {
    setHoveredId((current) => (current === id ? null : current));
    setOpen((current) => (current === "hover" ? "closed" : current));
  }, []);

  const handleSelect = useCallback((id: string, screenPos?: ScreenAnchor) => {
    setSelectedId(id);
    if (screenPos) setAnchor(screenPos);
    setOpen("card");
  }, []);

  const handleClose = useCallback(() => {
    setOpen("closed");
    setSelectedId(null);
    setHoveredId(null);
  }, []);

  const handleTraceClick = useCallback(() => {
    setSelectedId(null);
    setOpen("path");
  }, []);

  const handleOpenList = useCallback(() => {
    setOpen((current) => (current === "closed" || current === "hover" ? "path" : current));
  }, []);

  const handleOpenPathAnalysis = useCallback(() => {
    onOpenPathAnalysis?.();
  }, [onOpenPathAnalysis]);

  const overlayHost =
    portalTarget instanceof HTMLElement ? portalTarget : document.body;
  const overlayPortal = { current: overlayHost };

  if (hopSegments.length === 0) {
    return null;
  }

  const lineWidth = emphasis === "secondary" ? 1.8 : 2.5;
  const hopOpacity = emphasis === "secondary" ? 0.6 : 0.85;
  void version;

  return (
    <MapAnimationClock>
    <group name={`ray-path-arc-${pathMode}`}>
      {hopSegments.map((seg, i) => (
        <group key={`hop-${i}`}>
          {shouldAnimate && (
            <HopGlowLine
              points={seg.points}
              color={seg.color}
              shouldAnimate={shouldAnimate}
            />
          )}
          {shouldAnimate ? (
            <AnimatedHopLine
              points={seg.points}
              color={seg.color}
              lineWidth={lineWidth}
              opacity={hopOpacity}
              shouldAnimate={shouldAnimate}
              onTraceClick={handleTraceClick}
            />
          ) : (
            <StaticHopLine
              points={seg.points}
              color={seg.color}
              lineWidth={lineWidth}
              opacity={hopOpacity}
              onTraceClick={handleTraceClick}
            />
          )}
        </group>
      ))}

      {reflectionMarkers.map((m, i) => (
        <ReflectionMarker
          key={`refl-${i}`}
          lat={m.lat}
          lon={m.lon}
          radius={m.radius}
          color={m.color}
          type="reflection"
          qualityScore={m.qualityScore}
          shouldAnimate={shouldAnimate}
        />
      ))}

      {groundMarkers.map((m, i) => (
        <ReflectionMarker
          key={`ground-${i}`}
          lat={m.lat}
          lon={m.lon}
          radius={BASE_RADIUS}
          color={m.color}
          type="ground"
        />
      ))}

      {bounceHighlights.map((bh, i) => (
        <IonosphereBounceHighlight
          key={`bounce-hl-${i}`}
          lat={bh.lat}
          lon={bh.lon}
          radius={bh.radius}
          color={bh.color}
          shouldAnimate={shouldAnimate}
        />
      ))}

      {pointSet.points.map((point) => (
        <PathPointHitArea
          key={point.id}
          pointId={point.id}
          lat={point.coordinates.lat}
          lon={point.coordinates.lon}
          radius={
            point.role === "ground-point"
              ? BASE_RADIUS
              : heightToRadius(point.displayHeightKm)
          }
          occlusionOpacity={getOpacity(
            point.coordinates.lat,
            point.coordinates.lon,
          )}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
          onSelect={handleSelect}
        />
      ))}

      {typeof document !== "undefined" && (
        <Html
          portal={overlayPortal}
          fullscreen
          zIndexRange={[180, 0]}
          style={{ pointerEvents: "none" }}
        >
          <PathPointInspector
            inline
            pointSet={pointSet}
            selectedId={selectedId}
            hoveredId={hoveredId}
            open={open}
            anchor={anchor}
            pathSummary={result.summary}
            portalTarget={portalTarget}
            onSelect={(id) => handleSelect(id)}
            onClose={handleClose}
            onOpenPathAnalysis={
              onOpenPathAnalysis ? handleOpenPathAnalysis : undefined
            }
            onOpenList={handleOpenList}
          />
        </Html>
      )}
    </group>
    </MapAnimationClock>
  );
}


RayPathArc.displayName = "RayPathArc";

export default RayPathArc;

/**
 * RayPathArc Component
 *
 * Renders a multi-hop ionospheric skip path on the 3D globe. Each hop is
 * drawn as a parabolic arc from one ground point to the next, peaking at
 * the reflection height (visually exaggerated 5x for clarity).
 *
 * Features:
 * - Per-hop color coding by quality score (green/yellow/orange/red)
 * - Animated flowing dashes along the path
 * - Reflection markers at ionosphere bounce points
 * - Ground bounce markers between hops
 * - **Ionosphere bounce highlights**: when both ionosphere and rayPath layers
 *   are active, glowing layer-colored markers appear at each bounce point
 *   with a label identifying the ionospheric layer (D/E/F1/F2)
 * - Respects prefers-reduced-motion for accessibility
 */

import { useMemo, useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";
import { getPathPoints, getLongPathPoints } from "@/lib/utils/path";
import type { RayTraceResult } from "@/lib/utils/rayTrace";
import { calculateLayerHeights } from "@/lib/utils/ionosphere";
import { useCurrentSFI } from "@/hooks/useMUFData";
import { ReflectionMarker } from "./ReflectionMarker";
import {
  IONOSPHERE_LAYER_COLORS,
  IONOSPHERE_LAYER_NAMES,
  heightToRadius,
} from "./IonosphericShells";

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

/** D layer height in km (fixed — not computed from ionosphere model) */
const D_LAYER_HEIGHT_KM = 85;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RayPathArcProps {
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
  /** When true, render ionosphere-layer-colored bounce highlights */
  showIonosphereHighlights?: boolean;
  /** Display time — needed to compute ionospheric layer heights for highlights */
  displayTime?: Date;
}

/** Identifies which ionospheric layer a bounce point intersects */
type IonosphereLayer = "D" | "E" | "F1" | "F2";

interface BounceHighlightData {
  lat: number;
  lon: number;
  radius: number;
  layer: IonosphereLayer;
  color: string;
  label: string;
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

/**
 * Determine which ionospheric layer a reflection height is closest to.
 *
 * For HF propagation, the primary reflection layer is almost always F2.
 * However, for higher frequencies with sporadic-E conditions, E-layer
 * bounces are possible. The D layer absorbs rather than reflects.
 *
 * We classify by comparing the ray trace's hmF2 (reflection height) to
 * the calculated ionospheric layer boundaries.
 */
function classifyBounceLayer(
  reflectionHeightKm: number,
  layerHeights: { hmE: number; hmF1: number; hmF2: number },
): IonosphereLayer {
  // Boundaries midway between layer heights
  const eBoundary = (D_LAYER_HEIGHT_KM + layerHeights.hmE) / 2;
  const f1Boundary = (layerHeights.hmE + layerHeights.hmF1) / 2;
  const f2Boundary = (layerHeights.hmF1 + layerHeights.hmF2) / 2;

  if (reflectionHeightKm < eBoundary) return "D";
  if (reflectionHeightKm < f1Boundary) return "E";
  if (reflectionHeightKm < f2Boundary) return "F1";
  return "F2";
}

// ---------------------------------------------------------------------------
// Geometry generation
// ---------------------------------------------------------------------------

/**
 * Compute the evenly-spaced ground points along the great circle.
 * For N hops we need N+1 ground points (including start and end).
 */
function computeGroundPoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  numHops: number,
  pathMode: "short" | "long",
): Array<{ lat: number; lon: number }> {
  // Use a fine-grained set of path points, then sample at hop boundaries
  const totalSegments = numHops * 10;
  const pathPoints =
    pathMode === "long"
      ? getLongPathPoints(startLat, startLon, endLat, endLon, totalSegments)
      : getPathPoints(startLat, startLon, endLat, endLon, totalSegments);

  const groundPts: Array<{ lat: number; lon: number }> = [];

  for (let i = 0; i <= numHops; i++) {
    const fraction = i / numHops;
    const idx = Math.round(fraction * totalSegments);
    const clamped = Math.min(idx, pathPoints.length - 1);
    groundPts.push({
      lat: pathPoints[clamped].lat,
      lon: pathPoints[clamped].lon,
    });
  }

  return groundPts;
}

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
  const boostedHeight = reflectionHeightKm * 1.15;
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
  shouldAnimate,
}: {
  points: Array<[number, number, number]>;
  color: string;
  lineWidth: number;
  shouldAnimate: boolean;
}) {
  const lineRef = useRef<Line2 | LineSegments2 | null>(null);
  const dashOffsetRef = useRef(0);

  useFrame((_, delta) => {
    if (!shouldAnimate || !lineRef.current) return;

    dashOffsetRef.current -= delta * DASH_ANIMATION_SPEED;
    const material = getLineMaterial(lineRef.current);
    if (material && hasDashOffset(material)) {
      material.dashOffset = dashOffsetRef.current;
    }
  });

  if (points.length < 2) return null;

  return (
    <Line
      ref={lineRef}
      points={points}
      color={color}
      lineWidth={lineWidth}
      opacity={0.85}
      transparent
      dashed
      dashSize={0.02}
      gapSize={0.012}
    />
  );
}

/** Static solid line fallback (reduced-motion) */
function StaticHopLine({
  points,
  color,
  lineWidth,
}: {
  points: Array<[number, number, number]>;
  color: string;
  lineWidth: number;
}) {
  if (points.length < 2) return null;

  return (
    <Line
      points={points}
      color={color}
      lineWidth={lineWidth}
      opacity={0.85}
      transparent
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

  useFrame(({ clock }) => {
    if (!shouldAnimate || !lineRef.current) return;

    const material = getLineMaterial(lineRef.current);
    if (material && hasOpacity(material)) {
      material.opacity = Math.sin(clock.elapsedTime * 2) * 0.08 + 0.14;
    }
  });

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
  useFrame(({ clock }) => {
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
  });

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return (
    <group>
      {/* Core bright sphere */}
      <mesh ref={coreRef} position={position}>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial
          ref={coreMtlRef}
          color={color}
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </mesh>

      {/* Pulsing ring (torus) oriented radially outward */}
      <mesh ref={ringRef} position={position} quaternion={quaternion}>
        <torusGeometry args={[0.022, 0.003, 12, 32]} />
        <meshBasicMaterial
          ref={ringMtlRef}
          color={color}
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </mesh>

      {/* Outer glow sphere */}
      <mesh position={position}>
        <sphereGeometry args={[0.028, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          depthWrite={false}
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
  showIonosphereHighlights = false,
  displayTime,
}: RayPathArcProps) {
  const reducedMotion = useReducedMotion();
  const shouldAnimate = !reducedMotion;
  const sfi = useCurrentSFI() ?? 100;

  const numHops = result.hops.length;

  // Compute ionospheric layer heights for bounce classification
  const layerHeights = useMemo(() => {
    if (!showIonosphereHighlights || !displayTime) return null;
    const month = displayTime.getUTCMonth() + 1;
    return calculateLayerHeights(45, month, sfi);
  }, [showIonosphereHighlights, displayTime, sfi]);

  // Compute all geometry in a single memo
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

      // Ground points along the great circle (N+1 points for N hops)
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

        // Generate parabolic arc for this hop
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

        // Reflection marker at the apex (midpoint of hop, at peak height)
        const rp = hop.reflectionPoint;
        const boostedHeight = reflectionHeightKm * 1.15;
        const peakRadius =
          1.0 + (boostedHeight / EARTH_RADIUS_KM) * HEIGHT_EXAG;

        reflections.push({
          lat: rp.lat,
          lon: rp.lon,
          radius: peakRadius,
          color,
          qualityScore: hop.qualityScore,
        });

        // Ionosphere bounce highlight (only when ionosphere layer is also active)
        if (showIonosphereHighlights && layerHeights) {
          const layer = classifyBounceLayer(reflectionHeightKm, layerHeights);
          const layerColor = IONOSPHERE_LAYER_COLORS[layer];
          const layerLabel = IONOSPHERE_LAYER_NAMES[layer];

          // Place the highlight at the actual ionospheric shell radius for
          // the classified layer — this way it sits right on the shell
          let shellHeightKm: number;
          switch (layer) {
            case "D":
              shellHeightKm = D_LAYER_HEIGHT_KM;
              break;
            case "E":
              shellHeightKm = layerHeights.hmE;
              break;
            case "F1":
              shellHeightKm = layerHeights.hmF1;
              break;
            case "F2":
              shellHeightKm = layerHeights.hmF2;
              break;
          }
          const highlightRadius = heightToRadius(shellHeightKm);

          highlights.push({
            lat: rp.lat,
            lon: rp.lon,
            radius: highlightRadius,
            layer,
            color: layerColor,
            label: layerLabel,
          });
        }

        // Ground bounce marker between hops (not at start or end)
        if (i > 0) {
          // Use the boundary color as the average of adjacent hop colors
          // For simplicity, use the worse of the two adjacent hop scores
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

  if (hopSegments.length === 0) {
    return null;
  }

  return (
    <group name="ray-path-arc">
      {/* Render each hop as an arc */}
      {hopSegments.map((seg, i) => (
        <group key={`hop-${i}`}>
          {/* Background glow */}
          {shouldAnimate && (
            <HopGlowLine
              points={seg.points}
              color={seg.color}
              shouldAnimate={shouldAnimate}
            />
          )}

          {/* Main arc line */}
          {shouldAnimate ? (
            <AnimatedHopLine
              points={seg.points}
              color={seg.color}
              lineWidth={2.5}
              shouldAnimate={shouldAnimate}
            />
          ) : (
            <StaticHopLine
              points={seg.points}
              color={seg.color}
              lineWidth={2.5}
            />
          )}
        </group>
      ))}

      {/* Ionospheric reflection markers (at hop apex) */}
      {reflectionMarkers.map((m, i) => (
        <ReflectionMarker
          key={`refl-${i}`}
          lat={m.lat}
          lon={m.lon}
          radius={m.radius}
          color={m.color}
          type="reflection"
          qualityScore={m.qualityScore}
        />
      ))}

      {/* Ground bounce markers (between hops) */}
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

      {/* Ionosphere bounce highlights — layer-colored pulsing markers on the shell */}
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
    </group>
  );
}

RayPathArc.displayName = "RayPathArc";

export default RayPathArc;

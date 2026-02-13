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
 * - Respects prefers-reduced-motion for accessibility
 */

import { useMemo, useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { getPathPoints, getLongPathPoints } from "@/lib/utils/path";
import type { RayTraceResult } from "@/lib/utils/rayTrace";
import { ReflectionMarker } from "./ReflectionMarker";

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
 */
function generateHopPoints(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  reflectionHeightKm: number,
  segmentsPerHop: number = SEGMENTS_PER_HOP,
): Array<[number, number, number]> {
  const peakRadius = 1.0 + (reflectionHeightKm / EARTH_RADIUS_KM) * HEIGHT_EXAG;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null);
  const dashOffsetRef = useRef(0);

  useFrame((_, delta) => {
    if (!shouldAnimate || !lineRef.current) return;

    dashOffsetRef.current -= delta * DASH_ANIMATION_SPEED;
    const material = lineRef.current.material as THREE.LineDashedMaterial;
    if (material && "dashOffset" in material) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef = useRef<any>(null);

  useFrame(({ clock }) => {
    if (!shouldAnimate || !lineRef.current) return;

    const material = lineRef.current.material as THREE.Material;
    if (material && "opacity" in material) {
      const pulse = Math.sin(clock.elapsedTime * 2) * 0.08 + 0.14;
      (material as { opacity: number }).opacity = pulse;
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
}: RayPathArcProps) {
  const reducedMotion = useReducedMotion();
  const shouldAnimate = !reducedMotion;

  const numHops = result.hops.length;

  // Compute all geometry in a single memo
  const { hopSegments, reflectionMarkers, groundMarkers } = useMemo(() => {
    if (numHops === 0) {
      return { hopSegments: [], reflectionMarkers: [], groundMarkers: [] };
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
      const peakRadius =
        1.0 + (reflectionHeightKm / EARTH_RADIUS_KM) * HEIGHT_EXAG;

      reflections.push({
        lat: rp.lat,
        lon: rp.lon,
        radius: peakRadius,
        color,
        qualityScore: hop.qualityScore,
      });

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
    };
  }, [numHops, result, startLat, startLon, endLat, endLon, pathMode]);

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
    </group>
  );
}

RayPathArc.displayName = "RayPathArc";

export default RayPathArc;

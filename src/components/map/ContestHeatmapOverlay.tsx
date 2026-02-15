/**
 * ContestHeatmapOverlay Component
 *
 * Renders contest propagation path arcs on the PropSphere globe using
 * React Three Fiber. During active contests, high-density propagation
 * paths are visualized as colored great circle arcs.
 *
 * Arc color intensity: green (low density) -> yellow -> red (high density)
 * Arc width (tube radius) proportional to confidence.
 * Max 100 arcs rendered for performance.
 *
 * @module components/map/ContestHeatmapOverlay
 */

import { useMemo } from "react";
import * as THREE from "three";

import type { PropagationPath } from "@/lib/contest/contestPropIntel";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Arc altitude above the globe surface */
const ARC_ALTITUDE = 1.005;

/** Number of points per arc for smooth curves */
const ARC_SEGMENTS = 32;

/** Maximum paths to render for performance */
const MAX_PATHS = 100;

/** Minimum tube radius */
const MIN_TUBE_RADIUS = 0.0015;

/** Maximum tube radius */
const MAX_TUBE_RADIUS = 0.005;

// ─── Props ──────────────────────────────────────────────────────────────────

interface ContestHeatmapOverlayProps {
  /** High-confidence propagation paths from contest density analysis */
  paths: PropagationPath[];
  /** Overall overlay opacity (0-1) */
  opacity?: number;
  /** Whether the overlay is visible */
  visible?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a 2-char Maidenhead grid square to its center lat/lon.
 *
 * 2-char Maidenhead: first char (A-R) = 20-deg lon bands from -180,
 * second char (A-R) = 10-deg lat bands from -90.
 */
function gridToLatLon(grid: string): { lat: number; lon: number } | null {
  if (!grid || grid.length < 2) return null;

  const lonChar = grid.charCodeAt(0) - 65; // 'A' = 0
  const latChar = grid.charCodeAt(1) - 65;

  // Validate ranges (A-R = 0-17)
  if (lonChar < 0 || lonChar > 17 || latChar < 0 || latChar > 17) return null;

  // Each lon field = 20 deg, each lat field = 10 deg
  // Center of the field = base + half-width
  const lon = lonChar * 20 - 180 + 10;
  const lat = latChar * 10 - 90 + 5;

  return { lat, lon };
}

/**
 * Convert lat/lon to 3D position on the globe sphere.
 * Uses the same coordinate system as MUFOverlay and AuroraOverlay.
 */
function latLonTo3D(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Generate great circle arc points between two lat/lon positions.
 * Uses spherical linear interpolation (slerp) for proper great circle path.
 */
function greatCirclePoints(
  start: { lat: number; lon: number },
  end: { lat: number; lon: number },
  segments: number,
): THREE.Vector3[] {
  const startVec = latLonTo3D(start.lat, start.lon, ARC_ALTITUDE);
  const endVec = latLonTo3D(end.lat, end.lon, ARC_ALTITUDE);

  // Calculate the angular distance between points
  const angle = startVec.angleTo(endVec);

  // Arc height proportional to angular distance (longer arcs go higher)
  const arcHeight = Math.sin(angle / 2) * 0.15;

  const points: THREE.Vector3[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;

    // Spherical linear interpolation
    const point = new THREE.Vector3().lerpVectors(startVec, endVec, t);
    point.normalize();

    // Raise the arc above the globe surface using a parabolic profile
    const heightFactor = 1 + arcHeight * Math.sin(t * Math.PI);
    point.multiplyScalar(ARC_ALTITUDE * heightFactor);

    points.push(point);
  }

  return points;
}

/**
 * Map a path's count to a color on the green -> yellow -> red gradient.
 * Low density = green, medium = yellow, high = red.
 */
function densityColor(count: number, maxCount: number): THREE.Color {
  // Normalize count to 0-1 range
  const t = Math.min(count / Math.max(maxCount * 0.5, 1), 1.0);

  if (t < 0.5) {
    // Green to Yellow
    const s = t / 0.5;
    return new THREE.Color(s, 1.0, 0.0);
  } else {
    // Yellow to Red
    const s = (t - 0.5) / 0.5;
    return new THREE.Color(1.0, 1.0 - s, 0.0);
  }
}

// ─── Arc Geometry Builder ───────────────────────────────────────────────────

interface ArcData {
  curve: THREE.CatmullRomCurve3;
  color: THREE.Color;
  tubeRadius: number;
}

/**
 * Build arc data for all paths. Returns geometry-ready arc specifications.
 */
function buildArcs(paths: PropagationPath[]): ArcData[] {
  // Take top paths by count
  const topPaths = paths.slice(0, MAX_PATHS);
  if (topPaths.length === 0) return [];

  const maxCount = topPaths[0].count; // Already sorted descending

  const arcs: ArcData[] = [];

  for (const path of topPaths) {
    const startCoord = gridToLatLon(path.txGrid);
    const endCoord = gridToLatLon(path.rxGrid);

    if (!startCoord || !endCoord) continue;

    const arcPoints = greatCirclePoints(startCoord, endCoord, ARC_SEGMENTS);
    const curve = new THREE.CatmullRomCurve3(arcPoints);

    const color = densityColor(path.count, maxCount);

    // Tube radius proportional to confidence
    const tubeRadius =
      MIN_TUBE_RADIUS + (MAX_TUBE_RADIUS - MIN_TUBE_RADIUS) * path.confidence;

    arcs.push({ curve, color, tubeRadius });
  }

  return arcs;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ContestHeatmapOverlay({
  paths,
  opacity = 0.7,
  visible = true,
}: ContestHeatmapOverlayProps) {
  // Build arc geometries and materials
  const arcs = useMemo(() => buildArcs(paths), [paths]);

  // Create tube geometries and materials for each arc
  const arcMeshes = useMemo(() => {
    return arcs.map((arc, index) => {
      const geometry = new THREE.TubeGeometry(
        arc.curve,
        ARC_SEGMENTS,
        arc.tubeRadius,
        6, // radial segments
        false, // closed
      );

      const material = new THREE.MeshBasicMaterial({
        color: arc.color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      return { geometry, material, key: `contest-arc-${index}` };
    });
  }, [arcs, opacity]);

  if (!visible || arcMeshes.length === 0) {
    return null;
  }

  return (
    <group name="contest-heatmap-overlay">
      {arcMeshes.map((arc) => (
        <mesh key={arc.key} geometry={arc.geometry} material={arc.material} />
      ))}
    </group>
  );
}

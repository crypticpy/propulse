/**
 * Ft8DecodeLayer3D -- React Three Fiber layer for FT8 enriched decode visualization
 *
 * Renders decoded FT8/FT4 stations on the 3D globe as instanced mesh markers
 * with great-circle arcs from the operator's position to CQ stations.
 *
 * Marker coloring by decode type:
 *   - Green:          CQ stations
 *   - Cyan:           Regular QSO
 *   - Orange/pulsing: Needed entity (isNeeded)
 *   - Red:            Calling me (isCallingMe)
 *   - Dim gray:       Duplicate
 *
 * Markers fade over time (default 5 minutes) based on decode timestamp.
 * Uses instanced meshes for performance -- a single draw call for all markers.
 */

import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Ft8EnrichedDecode } from "@/lib/ft8/ft8EnrichedDecode";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface Ft8DecodeLayer3DProps {
  decodes: Ft8EnrichedDecode[];
  myLat?: number;
  myLon?: number;
  showArcs?: boolean;
  showLabels?: boolean;
  /** Maximum age in ms before markers fully fade (default 5 minutes) */
  ageMaxMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Globe surface radius -- slightly above the earth mesh to avoid z-fighting */
const SURFACE_RADIUS = 1.006;

/** Arc endpoint radius -- above surface for visual separation */
const ARC_RADIUS = 1.008;

/** Maximum number of markers to render */
const MAX_MARKERS = 300;

/** Maximum number of arcs to render (CQ stations only) */
const MAX_ARCS = 80;

/** Points per great-circle arc segment */
const ARC_SEGMENTS = 48;

/** Maximum arc elevation above globe surface */
const MAX_ARC_HEIGHT = 0.25;

/** Minimum arc elevation for short paths */
const MIN_ARC_HEIGHT = 0.02;

/** Default age max in milliseconds (5 minutes) */
const DEFAULT_AGE_MAX_MS = 5 * 60 * 1000;

/** Marker base scale */
const MARKER_BASE_SCALE = 0.005;

/** Pulsing animation speed for needed entities (radians per second) */
const PULSE_SPEED = 4.0;

/** Minimum pulse scale factor */
const PULSE_MIN = 0.7;

/** Pulse amplitude */
const PULSE_AMPLITUDE = 0.5;

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const COLOR_CQ = new THREE.Color("#00ff88"); // Green
const COLOR_QSO = new THREE.Color("#22d3ee"); // Cyan
const COLOR_NEEDED = new THREE.Color("#f59e0b"); // Orange
const COLOR_CALLING_ME = new THREE.Color("#ef4444"); // Red
const COLOR_DUPE = new THREE.Color("#6b7280"); // Dim gray

// Temp objects for instanced mesh updates (avoid allocation per frame)
const _tempObject = new THREE.Object3D();
const _tempColor = new THREE.Color();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to a Vector3 on the globe surface.
 * Uses the same coordinate system as GlobeView: phi from north pole,
 * theta from antimeridian.
 */
function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Determine the display color for a decode based on operational flags.
 */
function getDecodeColor(decode: Ft8EnrichedDecode): THREE.Color {
  if (decode.isCallingMe) return COLOR_CALLING_ME;
  if (decode.isNeeded) return COLOR_NEEDED;
  if (decode.isDupe) return COLOR_DUPE;
  if (decode.isCQ) return COLOR_CQ;
  return COLOR_QSO;
}

/**
 * Compute a scale multiplier based on SNR. Higher SNR = slightly larger marker.
 * SNR range: roughly -24 to +20. We normalize to 0.6..1.4 range.
 */
function snrScale(snr: number): number {
  const normalized = Math.max(0, Math.min(1, (snr + 24) / 44));
  return 0.6 + normalized * 0.8;
}

/**
 * Compute age-based opacity. Returns 0..1 where 1 is newest, 0 is expired.
 */
function ageOpacity(decodeTime: number, now: number, maxAgeMs: number): number {
  // decodeTime is ms-since-midnight-UTC from WsjtxDecode
  const nowMsSinceMidnight = getMsSinceMidnight(now);
  let age = nowMsSinceMidnight - decodeTime;
  // Handle day rollover
  if (age < 0) age += 24 * 60 * 60 * 1000;
  if (age > maxAgeMs) return 0;
  return 1 - age / maxAgeMs;
}

/**
 * Get ms since midnight UTC for a Date.now() timestamp.
 */
function getMsSinceMidnight(timestamp: number): number {
  const d = new Date(timestamp);
  return (
    d.getUTCHours() * 3_600_000 +
    d.getUTCMinutes() * 60_000 +
    d.getUTCSeconds() * 1_000 +
    d.getUTCMilliseconds()
  );
}

/**
 * Haversine angular distance in radians between two lat/lon points.
 */
function angularDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Generate great-circle arc points between two lat/lon positions,
 * elevated above the globe proportional to distance.
 */
function generateGreatCircleArc(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  segments: number,
): THREE.Vector3[] {
  const start = latLonToVec3(startLat, startLon, ARC_RADIUS);
  const end = latLonToVec3(endLat, endLon, ARC_RADIUS);
  const dist = angularDistance(startLat, startLon, endLat, endLon);
  // Arc height proportional to angular distance (0..pi maps to MIN..MAX)
  const normalizedDist = Math.min(dist / Math.PI, 1);
  const height =
    MIN_ARC_HEIGHT + normalizedDist * (MAX_ARC_HEIGHT - MIN_ARC_HEIGHT);

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Spherical linear interpolation between start and end
    const sinD = Math.sin(dist);
    let pt: THREE.Vector3;
    if (sinD < 1e-6) {
      // Degenerate case: same point
      pt = start.clone();
    } else {
      const a = Math.sin((1 - t) * dist) / sinD;
      const b = Math.sin(t * dist) / sinD;
      pt = new THREE.Vector3(
        a * start.x + b * end.x,
        a * start.y + b * end.y,
        a * start.z + b * end.z,
      );
    }
    // Elevate: parabolic arc above surface
    const elevation = 1 + height * 4 * t * (1 - t);
    const onSurface = pt.clone().normalize().multiplyScalar(ARC_RADIUS);
    pt = onSurface.multiplyScalar(elevation);
    points.push(pt);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Filtered decode type (with valid lat/lon)
// ---------------------------------------------------------------------------

interface ValidDecode {
  decode: Ft8EnrichedDecode;
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Ft8DecodeLayer3D = React.memo(function Ft8DecodeLayer3D({
  decodes,
  myLat,
  myLon,
  showArcs = true,
  showLabels: _showLabels = false,
  ageMaxMs = DEFAULT_AGE_MAX_MS,
}: Ft8DecodeLayer3DProps) {
  const instancedRef = useRef<THREE.InstancedMesh>(null);
  const arcLineRef = useRef<THREE.LineSegments>(null);
  const arcGeoRef = useRef<THREE.BufferGeometry | null>(null);

  // ── Filter to decodes with valid coordinates ────────────────────────────
  const validDecodes = useMemo((): ValidDecode[] => {
    const result: ValidDecode[] = [];
    for (const d of decodes) {
      if (
        d.lat != null &&
        d.lon != null &&
        Number.isFinite(d.lat) &&
        Number.isFinite(d.lon)
      ) {
        result.push({ decode: d, lat: d.lat, lon: d.lon });
      }
    }
    // Cap for performance
    return result.slice(0, MAX_MARKERS);
  }, [decodes]);

  // ── Stable geometry & material (created once) ──────────────────────────
  const markerGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);

  const markerMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  const arcMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  // ── Build arc geometry when CQ decodes or operator position change ─────
  useEffect(() => {
    if (!showArcs || myLat == null || myLon == null) {
      // Clear arcs
      if (arcGeoRef.current) {
        arcGeoRef.current.setAttribute(
          "position",
          new THREE.Float32BufferAttribute([], 3),
        );
        arcGeoRef.current.setAttribute(
          "color",
          new THREE.Float32BufferAttribute([], 3),
        );
      }
      return;
    }

    // Filter to CQ-only decodes for arcs
    const cqDecodes = validDecodes
      .filter((vd) => vd.decode.isCQ)
      .slice(0, MAX_ARCS);

    if (cqDecodes.length === 0) {
      if (arcGeoRef.current) {
        arcGeoRef.current.setAttribute(
          "position",
          new THREE.Float32BufferAttribute([], 3),
        );
        arcGeoRef.current.setAttribute(
          "color",
          new THREE.Float32BufferAttribute([], 3),
        );
      }
      return;
    }

    const positions: number[] = [];
    const colors: number[] = [];
    const now = Date.now();

    for (const vd of cqDecodes) {
      const opacity = ageOpacity(vd.decode.time, now, ageMaxMs);
      if (opacity <= 0) continue;

      const points = generateGreatCircleArc(
        myLat,
        myLon,
        vd.lat,
        vd.lon,
        ARC_SEGMENTS,
      );

      const color = getDecodeColor(vd.decode);
      const r = color.r * opacity;
      const g = color.g * opacity;
      const b = color.b * opacity;

      // LineSegments topology: pairs of vertices
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        positions.push(p0.x, p0.y, p0.z);
        positions.push(p1.x, p1.y, p1.z);
        colors.push(r, g, b);
        colors.push(r, g, b);
      }
    }

    if (!arcGeoRef.current) {
      arcGeoRef.current = new THREE.BufferGeometry();
    }

    arcGeoRef.current.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    arcGeoRef.current.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );
    arcGeoRef.current.computeBoundingSphere();

    if (arcLineRef.current) {
      arcLineRef.current.geometry = arcGeoRef.current;
    }
  }, [validDecodes, myLat, myLon, showArcs, ageMaxMs]);

  // ── Per-frame update: position + color + scale of instanced markers ────
  useFrame((state) => {
    const mesh = instancedRef.current;
    if (!mesh || validDecodes.length === 0) return;

    const now = Date.now();
    const clock = state.clock.getElapsedTime();

    for (let i = 0; i < validDecodes.length; i++) {
      const { decode, lat, lon } = validDecodes[i];
      const opacity = ageOpacity(decode.time, now, ageMaxMs);

      if (opacity <= 0) {
        // Hide this instance by scaling to zero
        _tempObject.scale.setScalar(0);
        _tempObject.updateMatrix();
        mesh.setMatrixAt(i, _tempObject.matrix);
        mesh.setColorAt(i, _tempColor.set(0, 0, 0));
        continue;
      }

      // Position on globe
      const pos = latLonToVec3(lat, lon, SURFACE_RADIUS);
      _tempObject.position.copy(pos);

      // Scale based on SNR
      let scale = MARKER_BASE_SCALE * snrScale(decode.snr);

      // Pulsing for needed entities
      if (decode.isNeeded && !decode.isDupe) {
        const pulse =
          PULSE_MIN +
          PULSE_AMPLITUDE * (0.5 + 0.5 * Math.sin(clock * PULSE_SPEED));
        scale *= pulse;
      }

      // Calling-me markers are slightly larger for visibility
      if (decode.isCallingMe) {
        scale *= 1.4;
      }

      _tempObject.scale.setScalar(scale);
      _tempObject.updateMatrix();
      mesh.setMatrixAt(i, _tempObject.matrix);

      // Color with age-based fade
      const baseColor = getDecodeColor(decode);
      _tempColor.set(
        baseColor.r * opacity,
        baseColor.g * opacity,
        baseColor.b * opacity,
      );
      mesh.setColorAt(i, _tempColor);
    }

    // Hide any remaining instances beyond validDecodes.length
    for (let i = validDecodes.length; i < MAX_MARKERS; i++) {
      _tempObject.scale.setScalar(0);
      _tempObject.updateMatrix();
      mesh.setMatrixAt(i, _tempObject.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      arcGeoRef.current?.dispose();
      arcGeoRef.current = null;
      markerGeometry.dispose();
      markerMaterial.dispose();
      arcMaterial.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Early return for empty data ─────────────────────────────────────────
  if (validDecodes.length === 0) return null;

  return (
    <group name="ft8-decode-layer-3d">
      {/* Instanced markers -- single draw call for all decode stations */}
      <instancedMesh
        ref={instancedRef}
        args={[markerGeometry, markerMaterial, MAX_MARKERS]}
        frustumCulled={false}
      />

      {/* Great-circle arcs from operator to CQ stations */}
      {showArcs && myLat != null && myLon != null && (
        <lineSegments
          ref={arcLineRef}
          material={arcMaterial}
          frustumCulled={false}
        />
      )}
    </group>
  );
});

export default Ft8DecodeLayer3D;

/**
 * WSPROverlay3D
 *
 * Renders WSPR (Weak Signal Propagation Reporter) spot arcs on the 3D globe.
 * Each arc connects a transmitter to a receiver, colored by amateur band
 * and with brightness/thickness proportional to SNR.
 *
 * Uses QuadraticBezierCurve3 for arc shape with additive blending for a
 * glowing effect. Performance-limited to ~100 arcs using LineSegments.
 *
 * Accepts all data as props -- no direct hook imports.
 */

import React, { useMemo } from "react";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WSPRSpot {
  txCallsign: string;
  txGrid: string;
  rxCallsign: string;
  rxGrid: string;
  txLat: number;
  txLon: number;
  rxLat: number;
  rxLon: number;
  frequencyMHz: number;
  snr: number;
  distanceKm: number;
}

interface WSPROverlay3DProps {
  spots: WSPRSpot[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Globe surface radius for arc endpoints */
const SURFACE_RADIUS = 1.008;

/** Maximum arcs to render for performance */
const MAX_ARCS = 100;

/** Points per arc curve for smoothness */
const ARC_SEGMENTS = 32;

/** Minimum arc height (as fraction of globe radius) for short paths */
const MIN_ARC_HEIGHT = 0.03;

/** Maximum arc height for antipodal paths */
const MAX_ARC_HEIGHT = 0.35;

/** SNR range for normalization */
const SNR_MIN = -30;
const SNR_MAX = 20;

// ---------------------------------------------------------------------------
// Band color mapping
// ---------------------------------------------------------------------------

/**
 * Color map by band based on frequency in MHz.
 */
function getBandColor(freqMHz: number): THREE.Color {
  if (freqMHz < 2.5) return new THREE.Color("#8b0000"); // 160m dark red
  if (freqMHz < 5.0) return new THREE.Color("#cc2222"); // 80m red
  if (freqMHz < 8.5) return new THREE.Color("#ff6600"); // 40m orange
  if (freqMHz < 12.0) return new THREE.Color("#ddcc00"); // 30m yellow
  if (freqMHz < 16.0) return new THREE.Color("#22cc44"); // 20m green
  if (freqMHz < 20.0) return new THREE.Color("#00cccc"); // 17m cyan
  if (freqMHz < 23.0) return new THREE.Color("#2266ff"); // 15m blue
  if (freqMHz < 26.0) return new THREE.Color("#4400cc"); // 12m indigo
  return new THREE.Color("#9922cc"); // 10m purple
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to a 3D position on the globe.
 */
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** Clamp a number */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Normalize SNR to a 0-1 range for opacity/brightness.
 */
function normalizeSNR(snr: number): number {
  return clamp((snr - SNR_MIN) / (SNR_MAX - SNR_MIN), 0.2, 1.0);
}

/**
 * Calculate arc height based on distance.
 * Longer paths get higher arcs.
 */
function arcHeight(distanceKm: number): number {
  // Normalize distance: 0 = same spot, 1 = half circumference (~20000 km)
  const normalized = clamp(distanceKm / 20000, 0, 1);
  return MIN_ARC_HEIGHT + normalized * (MAX_ARC_HEIGHT - MIN_ARC_HEIGHT);
}

/**
 * Generate points for a quadratic bezier arc between two globe positions.
 * The midpoint is elevated above the globe surface proportional to distance.
 */
function generateArcPoints(
  txLat: number,
  txLon: number,
  rxLat: number,
  rxLon: number,
  distanceKm: number,
): THREE.Vector3[] {
  const start = latLonToVector3(txLat, txLon, SURFACE_RADIUS);
  const end = latLonToVector3(rxLat, rxLon, SURFACE_RADIUS);

  // Midpoint on the surface between TX and RX
  const mid = start.clone().add(end).multiplyScalar(0.5);

  // Elevate the midpoint above the surface
  const height = arcHeight(distanceKm);
  const midNormalized = mid.clone().normalize();
  const midElevated = midNormalized.multiplyScalar(SURFACE_RADIUS + height);

  // Create quadratic bezier
  const curve = new THREE.QuadraticBezierCurve3(start, midElevated, end);
  return curve.getPoints(ARC_SEGMENTS);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const WSPROverlay3D = React.memo(function WSPROverlay3D({
  spots,
}: WSPROverlay3DProps) {
  // Build merged LineSegments geometry: all arcs in one draw call with per-vertex colors
  const { geometry, material } = useMemo(() => {
    if (!spots || spots.length === 0) {
      return { geometry: null, material: null };
    }

    // Limit to MAX_ARCS, preferring highest SNR
    const sorted = [...spots].sort((a, b) => b.snr - a.snr);
    const limited = sorted.slice(0, MAX_ARCS);

    // Collect all line segment positions and colors
    const positions: number[] = [];
    const colors: number[] = [];

    for (const spot of limited) {
      const points = generateArcPoints(
        spot.txLat,
        spot.txLon,
        spot.rxLat,
        spot.rxLon,
        spot.distanceKm,
      );

      const color = getBandColor(spot.frequencyMHz);
      const brightness = normalizeSNR(spot.snr);

      // Modulate color by brightness
      const r = color.r * brightness;
      const g = color.g * brightness;
      const b = color.b * brightness;

      // LineSegments topology: pairs of vertices form segments
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];

        positions.push(p0.x, p0.y, p0.z);
        positions.push(p1.x, p1.y, p1.z);

        colors.push(r, g, b);
        colors.push(r, g, b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [spots]);

  if (!spots || spots.length === 0 || !geometry || !material) return null;

  return (
    <group name="wspr-overlay">
      <lineSegments geometry={geometry} material={material} />
    </group>
  );
});

export default WSPROverlay3D;

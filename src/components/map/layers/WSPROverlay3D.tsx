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

import React, { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useActiveBand } from "@/hooks/useActiveBandMode";
import { bandFromFreqMHz } from "@/lib/utils/bandFromFreq";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WSPRSpot {
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
 * Band color ladder by upper frequency bound (MHz), lowest band first.
 * Exported so LayerLegend (src/lib/map/layerLegends.ts) can render a legend
 * that can never drift out of sync with the actual arc colors.
 */
export const WSPR_BAND_COLORS: ReadonlyArray<{
  maxMHz: number;
  label: string;
  color: string;
}> = [
  { maxMHz: 2.5, label: "160m", color: "#8b0000" }, // dark red
  { maxMHz: 5.0, label: "80m", color: "#cc2222" }, // red
  { maxMHz: 8.5, label: "40m", color: "#ff6600" }, // orange
  { maxMHz: 12.0, label: "30m", color: "#ddcc00" }, // yellow
  { maxMHz: 16.0, label: "20m", color: "#22cc44" }, // green
  { maxMHz: 20.0, label: "17m", color: "#00cccc" }, // cyan
  { maxMHz: 23.0, label: "15m", color: "#2266ff" }, // blue
  { maxMHz: 26.0, label: "12m", color: "#4400cc" }, // indigo
  { maxMHz: Infinity, label: "10m", color: "#9922cc" }, // purple
];

/**
 * Color map by band based on frequency in MHz.
 */
function getBandColor(freqMHz: number): THREE.Color {
  const entry =
    WSPR_BAND_COLORS.find((band) => freqMHz < band.maxMHz) ??
    WSPR_BAND_COLORS[WSPR_BAND_COLORS.length - 1];
  return new THREE.Color(entry.color);
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
  const lineRef = useRef<THREE.LineSegments>(null);
  const geoRef = useRef<THREE.BufferGeometry | null>(null);

  // Active band for highlighting matching arcs
  const activeBand = useActiveBand();

  // Stable material — created once, never recreated
  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
      }),
    [],
  );

  // Build geometry imperatively via useEffect so R3F always picks up changes
  useEffect(() => {
    if (!spots || spots.length === 0) {
      // Clear existing geometry
      if (lineRef.current && geoRef.current) {
        geoRef.current.setAttribute(
          "position",
          new THREE.Float32BufferAttribute([], 3),
        );
        geoRef.current.setAttribute(
          "color",
          new THREE.Float32BufferAttribute([], 3),
        );
        geoRef.current.attributes.position.needsUpdate = true;
        geoRef.current.attributes.color.needsUpdate = true;
      }
      return;
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

      // Dim arcs that don't match the active band (full opacity vs 0.3)
      const spotBand = bandFromFreqMHz(spot.frequencyMHz);
      const bandMatch = spotBand === activeBand;
      const bandScale = bandMatch ? 1.0 : 0.3;

      // Modulate color by brightness and band match
      const r = color.r * brightness * bandScale;
      const g = color.g * brightness * bandScale;
      const b = color.b * brightness * bandScale;

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

    // Create or update geometry
    if (!geoRef.current) {
      geoRef.current = new THREE.BufferGeometry();
    }

    geoRef.current.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geoRef.current.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );

    // Recompute bounding sphere for frustum culling
    geoRef.current.computeBoundingSphere();

    // Attach to lineSegments if not yet attached
    if (lineRef.current) {
      lineRef.current.geometry = geoRef.current;
    }
  }, [spots, activeBand]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      geoRef.current?.dispose();
      geoRef.current = null;
      material.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!spots || spots.length === 0) return null;

  return (
    <group name="wspr-overlay">
      <lineSegments
        ref={lineRef}
        material={material}
        frustumCulled={false}
        renderOrder={GLOBE_LAYER_ORDER.arcs}
      />
    </group>
  );
});

export default WSPROverlay3D;

/**
 * NVISOverlay3D
 *
 * Renders a semi-transparent dome on the 3D globe representing NVIS
 * (Near-Vertical Incidence Skywave) coverage centered on the operator's QTH.
 *
 * The dome radius is proportional to the calculated NVIS coverage radius,
 * and the color/opacity varies with signal quality (excellent/good/marginal/none).
 * Band labels are shown at the dome edge using drei Html overlays.
 *
 * Accepts all data as props -- no direct hook imports.
 */

import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NVISOverlay3DProps {
  /** Operator QTH center */
  center: { lat: number; lon: number };
  /** NVIS coverage radius in km (typically ~300 km) */
  radiusKm: number;
  /** Usable amateur bands (e.g. ["40m", "60m", "80m"]) */
  usableBands: string[];
  /** Quality assessment from NVIS calculation */
  quality: "excellent" | "good" | "marginal" | "none";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Earth mean radius in km */
const EARTH_RADIUS_KM = 6371;

/** Globe unit-sphere radius for surface placement */
const SURFACE_RADIUS = 1.008;

/** Quality -> dome color mapping */
const QUALITY_COLORS: Record<NVISOverlay3DProps["quality"], string> = {
  excellent: "#00ffff", // Bright cyan
  good: "#00cccc", // Cyan
  marginal: "#008888", // Teal
  none: "#555555", // Gray (hidden, but just in case)
};

/** Quality -> opacity range for pulsing [min, max] */
const QUALITY_OPACITY: Record<NVISOverlay3DProps["quality"], [number, number]> =
  {
    excellent: [0.18, 0.38],
    good: [0.15, 0.35],
    marginal: [0.1, 0.25],
    none: [0, 0],
  };

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

/**
 * Get the "up" direction at a given lat/lon (surface normal).
 */
function getUpDirection(lat: number, lon: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize();
}

/**
 * Convert a km radius to globe units.
 * Adds a visibility floor so the dome is readable on the globe.
 */
function kmToGlobeRadius(km: number): number {
  // Strict conversion: radiusKm / EARTH_RADIUS_KM
  const strict = km / EARTH_RADIUS_KM;
  // Scale up for visibility: minimum 0.05, capped at 0.12
  return Math.max(0.05, Math.min(0.12, strict * 1.5));
}

/**
 * Get a point on the globe surface at a bearing and angular distance from center.
 * Used for placing band labels at the dome edge.
 */
function pointAtBearing(
  lat: number,
  lon: number,
  bearingDeg: number,
  angularDistRad: number,
): { lat: number; lon: number } {
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const brng = (bearingDeg * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistRad) +
      Math.cos(lat1) * Math.sin(angularDistRad) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angularDistRad) * Math.cos(lat1),
      Math.cos(angularDistRad) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (lon2 * 180) / Math.PI,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NVISOverlay3D = React.memo(function NVISOverlay3D({
  center,
  radiusKm,
  usableBands,
  quality,
}: NVISOverlay3DProps) {
  const domeMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringMaterialRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  // Early-out: no NVIS possible
  if (quality === "none" || radiusKm <= 0) return null;

  const color = QUALITY_COLORS[quality];
  const [opacityMin, opacityMax] = QUALITY_OPACITY[quality];

  // Dome geometry: hemisphere shell
  const domeRadius = kmToGlobeRadius(radiusKm);

  // Position and rotation to place dome at center lat/lon
  const { position, quaternion } = useMemo(() => {
    const pos = latLonToVector3(center.lat, center.lon, SURFACE_RADIUS);
    const up = getUpDirection(center.lat, center.lon);
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    return { position: pos, quaternion: q };
  }, [center.lat, center.lon]);

  // Shared dome geometry -- hemisphere (top half of sphere)
  const domeGeometry = useMemo(() => {
    return new THREE.SphereGeometry(
      domeRadius,
      32, // widthSegments
      16, // heightSegments
      0, // phiStart
      Math.PI * 2, // phiLength (full rotation)
      0, // thetaStart (top)
      Math.PI / 2, // thetaLength (hemisphere only)
    );
  }, [domeRadius]);

  // Concentric ring geometries for edge fade effect (3 rings)
  const ringGeometries = useMemo(() => {
    return [0.6, 0.8, 0.95].map(
      (fraction) =>
        new THREE.RingGeometry(
          domeRadius * fraction - 0.001,
          domeRadius * fraction + 0.001,
          48,
        ),
    );
  }, [domeRadius]);

  // Band label positions: spaced around the dome edge
  const bandLabelData = useMemo(() => {
    // Show up to 3 band labels, evenly spaced around the edge
    const bands = usableBands.slice(0, 3);
    const angularDist = radiusKm / EARTH_RADIUS_KM;

    return bands.map((band, i) => {
      const bearing = (360 / bands.length) * i - 90; // Start at north-ish
      const edgePoint = pointAtBearing(
        center.lat,
        center.lon,
        bearing,
        angularDist,
      );
      const pos = latLonToVector3(
        edgePoint.lat,
        edgePoint.lon,
        SURFACE_RADIUS + domeRadius * 0.6,
      );
      return { band, position: pos };
    });
  }, [usableBands, radiusKm, center.lat, center.lon, domeRadius]);

  // Single animation loop: pulse dome and ring opacity
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse =
      opacityMin + (opacityMax - opacityMin) * (0.5 + 0.5 * Math.sin(t * 1.5));

    if (domeMaterialRef.current) {
      domeMaterialRef.current.opacity = pulse;
    }

    for (let i = 0; i < ringMaterialRefs.current.length; i++) {
      const mat = ringMaterialRefs.current[i];
      if (mat) {
        // Rings fade out toward the edge
        const ringFade = [0.8, 0.5, 0.3][i] ?? 0.3;
        mat.opacity = pulse * ringFade;
      }
    }
  });

  return (
    <group>
      {/* NVIS dome hemisphere */}
      <mesh position={position} quaternion={quaternion}>
        <primitive object={domeGeometry} attach="geometry" />
        <meshBasicMaterial
          ref={domeMaterialRef}
          color={color}
          transparent
          opacity={opacityMin}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Concentric rings on the surface for coverage visualization */}
      {ringGeometries.map((geo, i) => {
        // Orient rings flat on the surface at center
        const ringQ = new THREE.Quaternion();
        const up = getUpDirection(center.lat, center.lon);
        ringQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);

        return (
          <mesh
            key={i}
            position={latLonToVector3(
              center.lat,
              center.lon,
              SURFACE_RADIUS + 0.001,
            )}
            quaternion={ringQ}
          >
            <primitive object={geo} attach="geometry" />
            <meshBasicMaterial
              ref={(el: THREE.MeshBasicMaterial | null) => {
                ringMaterialRefs.current[i] = el;
              }}
              color={color}
              transparent
              opacity={opacityMin * 0.5}
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        );
      })}

      {/* Band labels at dome edge */}
      {bandLabelData.map(({ band, position: pos }) => (
        <Html
          key={band}
          position={pos}
          center
          zIndexRange={[1, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            className="px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(0, 20, 30, 0.85)",
              color,
              border: `1px solid ${color}60`,
              boxShadow: `0 0 6px ${color}40`,
            }}
          >
            {band}
          </div>
        </Html>
      ))}
    </group>
  );
});

export default NVISOverlay3D;

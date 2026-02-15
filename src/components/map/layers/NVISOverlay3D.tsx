/**
 * NVISOverlay3D
 *
 * Renders a semi-transparent dome on the 3D globe representing NVIS
 * (Near-Vertical Incidence Skywave) coverage centered on the operator's QTH.
 *
 * The dome radius is proportional to the calculated NVIS coverage radius,
 * and the color/opacity varies with signal quality (excellent/good/marginal/none).
 * Band labels are clickable and show detailed info popups using drei Html.
 *
 * Features:
 * - Clickable band tags with info popups (quality, foF2, coverage, best times)
 * - Gradient dome (transparent center to opaque edge)
 * - Animated radar-ping ripple effect
 * - Distance-marked concentric rings
 * - User-adjustable opacity via mapStore
 *
 * Accepts all data as props -- no direct hook imports except mapStore for opacity.
 */

import React, { useRef, useMemo, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useActiveBand } from "@/hooks/useActiveBandMode";
import { useMapStore } from "@/stores/mapStore";

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
  /** Estimated F2 critical frequency (foF2) in MHz */
  criticalFreqMHz?: number;
  /** Maximum usable frequency for vertical incidence in MHz */
  maxUsableFreqMHz?: number;
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

/** Quality -> label */
const QUALITY_LABELS: Record<NVISOverlay3DProps["quality"], string> = {
  excellent: "Excellent",
  good: "Good",
  marginal: "Marginal",
  none: "None",
};

/** Band metadata for info popups */
const NVIS_BAND_INFO: Record<
  string,
  {
    freqRange: string;
    centerMHz: number;
    bestTimes: string;
    notes: string;
  }
> = {
  "160m": {
    freqRange: "1.800 - 2.000 MHz",
    centerMHz: 1.9,
    bestTimes: "Night (local sunset to sunrise)",
    notes:
      "Highest D-layer absorption during day. Best for nighttime NVIS when foF2 is low.",
  },
  "80m": {
    freqRange: "3.500 - 4.000 MHz",
    centerMHz: 3.75,
    bestTimes: "Evening through early morning",
    notes:
      "Primary NVIS band for emergency/ARES nets. Reliable in moderate solar conditions.",
  },
  "60m": {
    freqRange: "5.330 - 5.405 MHz",
    centerMHz: 5.37,
    bestTimes: "Late afternoon through morning",
    notes:
      "Channelized band (5 channels). Excellent for NVIS with balanced absorption.",
  },
  "40m": {
    freqRange: "7.000 - 7.300 MHz",
    centerMHz: 7.15,
    bestTimes: "Daytime (requires higher foF2 > 7.5 MHz)",
    notes:
      "Best daytime NVIS band during moderate-to-high solar activity. Widest bandwidth.",
  },
};

/** Distance ring fractions and their labels (miles) */
const RING_CONFIG = [
  { fraction: 0.33, labelMi: "100 mi", labelKm: "~160 km" },
  { fraction: 0.66, labelMi: "200 mi", labelKm: "~320 km" },
  { fraction: 0.95, labelMi: "300 mi", labelKm: "~480 km" },
];

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
  const strict = km / EARTH_RADIUS_KM;
  return Math.max(0.05, Math.min(0.12, strict * 1.5));
}

/**
 * Get a point on the globe surface at a bearing and angular distance from center.
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

/**
 * Create a hemisphere geometry with a radial gradient opacity.
 * Center vertices are more transparent; edge vertices are more opaque.
 * Uses vertex colors with alpha channel via custom BufferAttribute.
 */
function createGradientDomeGeometry(radius: number): THREE.SphereGeometry {
  const geo = new THREE.SphereGeometry(
    radius,
    32, // widthSegments
    16, // heightSegments
    0, // phiStart
    Math.PI * 2, // phiLength
    0, // thetaStart (top = center of dome)
    Math.PI / 2, // thetaLength (hemisphere)
  );

  // Add alpha attribute based on angular distance from pole (center of dome)
  // The dome's pole (theta=0) is the center; equator (theta=PI/2) is the edge
  const pos = geo.attributes.position;
  const alphas = new Float32Array(pos.count);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    // y is the "up" axis of the hemisphere (1 at pole, 0 at equator)
    // Normalize y to [0, 1] where 1 = center (top), 0 = edge (equator)
    const normalizedY = Math.max(0, y / radius);

    // Gradient: center (normalizedY=1) -> 0.15 alpha, edge (normalizedY=0) -> 1.0 alpha
    const alpha = 0.15 + (1.0 - normalizedY) * 0.85;

    // Also consider lateral position for additional edge emphasis
    const lateralDist = Math.sqrt(x * x + z * z) / radius;
    const edgeBoost = Math.pow(lateralDist, 2) * 0.3;

    alphas[i] = Math.min(1.0, alpha + edgeBoost);
  }

  geo.setAttribute("alpha", new THREE.BufferAttribute(alphas, 1));
  return geo;
}

// ---------------------------------------------------------------------------
// Band Info Popup
// ---------------------------------------------------------------------------

interface BandInfoPopupProps {
  band: string;
  quality: NVISOverlay3DProps["quality"];
  criticalFreqMHz: number;
  maxUsableFreqMHz: number;
  radiusKm: number;
  onClose: () => void;
}

function BandInfoPopup({
  band,
  quality,
  criticalFreqMHz,
  maxUsableFreqMHz,
  radiusKm,
  onClose,
}: BandInfoPopupProps) {
  const info = NVIS_BAND_INFO[band];
  if (!info) return null;

  const qualityColor = QUALITY_COLORS[quality];
  const isUsable = info.centerMHz < criticalFreqMHz * 0.95;

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md px-3 py-2.5 text-[10px] font-mono"
      style={{
        backgroundColor: "rgba(8, 8, 24, 0.96)",
        border: `1px solid ${qualityColor}50`,
        boxShadow: `0 0 16px ${qualityColor}30, 0 4px 12px rgba(0,0,0,0.6)`,
        minWidth: "220px",
        maxWidth: "260px",
        color: "#e0e0e8",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[13px] font-bold tracking-wider"
          style={{ color: qualityColor }}
        >
          {band} NVIS
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="text-[10px] px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
          style={{ color: "#888" }}
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {/* Frequency range */}
      <div className="flex items-center gap-1.5">
        <span style={{ color: "#888" }}>Freq:</span>
        <span style={{ color: "#ccc" }}>{info.freqRange}</span>
      </div>

      {/* NVIS status for this band */}
      <div className="flex items-center gap-1.5">
        <span style={{ color: "#888" }}>Status:</span>
        <span
          className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase"
          style={{
            backgroundColor: isUsable
              ? `${qualityColor}20`
              : "rgba(255,80,80,0.15)",
            color: isUsable ? qualityColor : "#ff5555",
            border: `1px solid ${isUsable ? qualityColor : "#ff5555"}40`,
          }}
        >
          {isUsable ? QUALITY_LABELS[quality] : "Unavailable"}
        </span>
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />

      {/* foF2 */}
      <div className="flex items-center gap-1.5">
        <span style={{ color: "#888" }}>foF2:</span>
        <span style={{ color: "#ccc" }}>{criticalFreqMHz.toFixed(2)} MHz</span>
      </div>

      {/* MUF (90) */}
      <div className="flex items-center gap-1.5">
        <span style={{ color: "#888" }}>MUF(90):</span>
        <span style={{ color: "#ccc" }}>{maxUsableFreqMHz.toFixed(2)} MHz</span>
      </div>

      {/* Coverage radius */}
      <div className="flex items-center gap-1.5">
        <span style={{ color: "#888" }}>Coverage:</span>
        <span style={{ color: "#ccc" }}>
          ~{radiusKm} km ({Math.round(radiusKm * 0.621)} mi)
        </span>
      </div>

      {/* Best times */}
      <div className="flex items-start gap-1.5">
        <span style={{ color: "#888", whiteSpace: "nowrap" }}>Best:</span>
        <span style={{ color: "#aaa", lineHeight: "1.4" }}>
          {info.bestTimes}
        </span>
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }} />

      {/* Band notes */}
      <div className="text-[9px] leading-relaxed" style={{ color: "#888" }}>
        {info.notes}
      </div>

      {/* NVIS explainer */}
      <div
        className="text-[8px] leading-relaxed mt-0.5 pt-1"
        style={{ color: "#666", borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        NVIS bounces signals off the ionosphere at near-vertical angles for
        reliable regional coverage within ~300 miles. No skip zone.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ripple Ring Component (radar-ping effect)
// ---------------------------------------------------------------------------

interface RippleRingProps {
  centerPosition: THREE.Vector3;
  quaternion: THREE.Quaternion;
  maxRadius: number;
  color: string;
}

function RippleRing({
  centerPosition,
  quaternion,
  maxRadius,
  color,
}: RippleRingProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Create a thin ring geometry that will be scaled
  const ringGeo = useMemo(() => {
    return new THREE.RingGeometry(0.98, 1.0, 64);
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    // Cycle every 4 seconds; ring expands from 0 to maxRadius
    const cycle = (t % 4.0) / 4.0;
    const scale = cycle * maxRadius;
    const opacity = (1.0 - cycle) * 0.4;

    if (ringRef.current) {
      ringRef.current.scale.set(scale, scale, 1);
    }
    if (materialRef.current) {
      materialRef.current.opacity = Math.max(0, opacity);
    }
  });

  return (
    <mesh
      ref={ringRef}
      position={centerPosition}
      quaternion={quaternion}
      renderOrder={2}
    >
      <primitive object={ringGeo} attach="geometry" />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NVISOverlay3D = React.memo(function NVISOverlay3D({
  center,
  radiusKm,
  usableBands,
  quality,
  criticalFreqMHz = 0,
  maxUsableFreqMHz = 0,
}: NVISOverlay3DProps) {
  const domeMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringMaterialRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const hasCoverage = quality !== "none" && radiusKm > 0;

  // Selected band for info popup
  const [selectedBand, setSelectedBand] = useState<string | null>(null);

  // User-controlled opacity from mapStore
  const nvisOpacity = useMapStore((s) => s.nvisOpacity);

  // Check if the operator's active band supports NVIS
  const activeBand = useActiveBand();
  const activeBandSupportsNVIS = usableBands.includes(activeBand);

  // When active band supports NVIS, boost opacity; otherwise dim slightly
  const opacityScale = activeBandSupportsNVIS ? 1.3 : 0.6;
  const color = activeBandSupportsNVIS ? QUALITY_COLORS[quality] : "#556677";

  // Base opacity is driven by user's nvisOpacity setting
  const baseOpacityMin = nvisOpacity * 0.5;
  const baseOpacityMax = nvisOpacity;
  const opacityMin = Math.min(1, baseOpacityMin * opacityScale);
  const opacityMax = Math.min(1, baseOpacityMax * opacityScale);

  // Dome geometry: hemisphere shell with gradient
  const domeRadius = kmToGlobeRadius(radiusKm);

  // Position and rotation to place dome at center lat/lon
  const { position, quaternion } = useMemo(() => {
    const pos = latLonToVector3(center.lat, center.lon, SURFACE_RADIUS);
    const up = getUpDirection(center.lat, center.lon);
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    return { position: pos, quaternion: q };
  }, [center.lat, center.lon]);

  // Ring quaternion (flat on surface)
  const ringQuaternion = useMemo(() => {
    const q = new THREE.Quaternion();
    const up = getUpDirection(center.lat, center.lon);
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    return q;
  }, [center.lat, center.lon]);

  // Ring center position (slightly above surface)
  const ringCenterPosition = useMemo(() => {
    return latLonToVector3(center.lat, center.lon, SURFACE_RADIUS + 0.001);
  }, [center.lat, center.lon]);

  // Gradient dome geometry
  const domeGeometry = useMemo(() => {
    return createGradientDomeGeometry(domeRadius);
  }, [domeRadius]);

  // Concentric ring geometries with distance markers
  const ringGeometries = useMemo(() => {
    return RING_CONFIG.map(({ fraction }) => ({
      geo: new THREE.RingGeometry(
        domeRadius * fraction - 0.0015,
        domeRadius * fraction + 0.0015,
        64,
      ),
      fraction,
    }));
  }, [domeRadius]);

  // Distance label positions (at the south edge of each ring for visibility)
  const distanceLabelData = useMemo(() => {
    const angularDist = radiusKm / EARTH_RADIUS_KM;
    return RING_CONFIG.map(({ fraction, labelMi }) => {
      const bearing = 180; // Place labels at south edge
      const edgePoint = pointAtBearing(
        center.lat,
        center.lon,
        bearing,
        angularDist * fraction,
      );
      const pos = latLonToVector3(
        edgePoint.lat,
        edgePoint.lon,
        SURFACE_RADIUS + 0.003,
      );
      return { label: labelMi, position: pos };
    });
  }, [radiusKm, center.lat, center.lon]);

  // Band label positions: spaced around the dome edge
  const bandLabelData = useMemo(() => {
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

  // Toggle band info popup
  const handleBandClick = useCallback((band: string) => {
    setSelectedBand((prev) => (prev === band ? null : band));
  }, []);

  const handlePopupClose = useCallback(() => {
    setSelectedBand(null);
  }, []);

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
        // Rings get brighter toward the edge (opposite of old behavior)
        const ringBrightness = [0.4, 0.6, 0.9][i] ?? 0.5;
        mat.opacity = pulse * ringBrightness * 1.5;
      }
    }
  });

  // Early-out: no NVIS possible
  if (!hasCoverage) return null;

  return (
    <group>
      {/* NVIS dome hemisphere with gradient */}
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

      {/* Concentric distance rings on the surface */}
      {ringGeometries.map(({ geo, fraction }, i) => (
        <mesh
          key={`ring-${i}`}
          position={ringCenterPosition}
          quaternion={ringQuaternion}
        >
          <primitive object={geo} attach="geometry" />
          <meshBasicMaterial
            ref={(el: THREE.MeshBasicMaterial | null) => {
              ringMaterialRefs.current[i] = el;
            }}
            color={color}
            transparent
            opacity={opacityMin * fraction}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Radar-ping ripple effect */}
      <RippleRing
        centerPosition={ringCenterPosition}
        quaternion={ringQuaternion}
        maxRadius={domeRadius}
        color={color}
      />

      {/* Distance labels at ring edges */}
      {distanceLabelData.map(({ label, position: pos }) => (
        <Html
          key={label}
          position={pos}
          center
          zIndexRange={[1, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            className="px-1 py-0.5 rounded text-[8px] font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(0, 15, 20, 0.7)",
              color: `${color}99`,
              border: `1px solid ${color}30`,
              letterSpacing: "0.5px",
            }}
          >
            {label}
          </div>
        </Html>
      ))}

      {/* Band labels at dome edge -- clickable for info popup */}
      {bandLabelData.map(({ band, position: pos }) => {
        const isActive = band === activeBand;
        const isSelected = band === selectedBand;
        const labelColor = isActive ? "#00ffff" : color;

        return (
          <Html
            key={band}
            position={pos}
            center
            zIndexRange={isSelected ? [10, 5] : [1, 0]}
            style={{ pointerEvents: "auto" }}
          >
            <div className="flex flex-col items-center gap-0">
              {/* Band tag (clickable) */}
              <div
                className="px-2 py-0.5 rounded text-[10px] font-mono whitespace-nowrap cursor-pointer select-none transition-all duration-150"
                style={{
                  backgroundColor: isActive
                    ? "rgba(0, 40, 50, 0.95)"
                    : isSelected
                      ? "rgba(0, 30, 40, 0.95)"
                      : "rgba(0, 20, 30, 0.85)",
                  color: labelColor,
                  border: `1px solid ${isActive || isSelected ? `${labelColor}aa` : `${labelColor}60`}`,
                  boxShadow:
                    isActive || isSelected
                      ? `0 0 12px ${labelColor}80`
                      : `0 0 6px ${labelColor}40`,
                  fontWeight: isActive ? 700 : 500,
                  transform: isSelected ? "scale(1.1)" : "scale(1)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleBandClick(band);
                }}
                title={`Click for ${band} NVIS info`}
              >
                {band}
                <span
                  className="ml-1 text-[7px]"
                  style={{ color: `${labelColor}88`, verticalAlign: "super" }}
                >
                  i
                </span>
              </div>

              {/* Info popup when selected */}
              {isSelected && (
                <div className="mt-1">
                  <BandInfoPopup
                    band={band}
                    quality={quality}
                    criticalFreqMHz={criticalFreqMHz}
                    maxUsableFreqMHz={maxUsableFreqMHz}
                    radiusKm={radiusKm}
                    onClose={handlePopupClose}
                  />
                </div>
              )}
            </div>
          </Html>
        );
      })}
    </group>
  );
});

export default NVISOverlay3D;

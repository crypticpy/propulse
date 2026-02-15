/**
 * BeaconNetworkOverlay3D
 *
 * Renders the 18 NCDXF/IARU International Beacon Network stations on the
 * 3D globe as diamond-shaped markers. The currently transmitting beacon is
 * highlighted with a pulsing green/white glow and shows its active frequency
 * in the label. All other beacons display a steady golden yellow marker.
 *
 * Features:
 * - Globe occlusion: inactive beacons hidden when behind the globe,
 *   active beacons show through at reduced opacity so users can always
 *   spot the currently transmitting beacon.
 * - Click interaction: click a beacon to see detailed info (callsign,
 *   location, coordinates, band, schedule, status). Click again to dismiss.
 * - Inactive opacity control: beaconInactiveOpacity from mapStore lets
 *   users dim or hide inactive beacons.
 *
 * Accepts all data as props -- no direct data hook imports.
 */

import React, { useRef, useMemo, useState, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useActiveFrequency } from "@/hooks/useActiveBandMode";
import { useGlobeOcclusionBatch } from "@/hooks/useGlobeOcclusionBatch";
import { useMapStore } from "@/stores/mapStore";
import {
  getSecondsUntilNextTransmission,
  formatBeaconFrequency,
  BEACON_FREQUENCIES,
} from "@/lib/data/beaconNetwork";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BeaconData {
  /** Beacon callsign (e.g. "4U1UN") */
  callsign: string;
  /** Human-readable location */
  location: string;
  /** Latitude in decimal degrees */
  lat: number;
  /** Longitude in decimal degrees */
  lon: number;
  /** Position in the 3-minute rotation (0-17) */
  slotIndex: number;
  /** Whether this beacon is currently transmitting */
  isTransmitting: boolean;
  /** Current band in kHz if transmitting, null otherwise */
  currentBandKHz: number | null;
}

interface BeaconNetworkOverlay3DProps {
  /** All 18 beacon stations with current state */
  beacons: BeaconData[];
  /** Index of the currently transmitting beacon (primary band) */
  currentBeaconIndex: number;
  /** Active frequency in MHz for display (optional -- falls back to useActiveFrequency) */
  activeFrequencyMHz?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Marker diamond size (radius of octahedron) */
const MARKER_SIZE = 0.008;

/** Surface placement radius to avoid z-fighting */
const SURFACE_RADIUS = 1.012;

/** Steady-state golden yellow for inactive beacons */
const BEACON_COLOR_INACTIVE = "#f0c040";

/** Active beacon base color: bright green */
const BEACON_COLOR_ACTIVE = "#00ff88";

/** Active glow color: white-green */
const BEACON_GLOW_COLOR = "#aaffcc";

/** Opacity for active beacon when occluded behind the globe */
const ACTIVE_OCCLUDED_OPACITY = 0.3;

/** Minimum occlusion opacity floor for active beacons (always partially visible) */
const ACTIVE_MIN_OPACITY = 0.25;

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
 * Format seconds as "Xm Ys" for schedule display.
 */
function formatSecondsAgo(seconds: number): string {
  if (seconds <= 0) return "NOW";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Beacon Info Popup
// ---------------------------------------------------------------------------

interface BeaconInfoPopupProps {
  beacon: BeaconData;
  occlusionOpacity: number;
}

function BeaconInfoPopup({ beacon, occlusionOpacity }: BeaconInfoPopupProps) {
  const nextTx = getSecondsUntilNextTransmission(beacon.callsign);

  return (
    <Html
      position={[0, MARKER_SIZE * 6, 0]}
      center
      zIndexRange={[10, 5]}
      style={{
        pointerEvents: "auto",
        opacity: Math.max(occlusionOpacity, ACTIVE_MIN_OPACITY),
      }}
    >
      <div
        className="flex flex-col gap-1 rounded-md px-3 py-2 text-[10px] font-mono"
        style={{
          backgroundColor: "rgba(8, 8, 24, 0.94)",
          border: `1px solid ${beacon.isTransmitting ? BEACON_COLOR_ACTIVE : BEACON_COLOR_INACTIVE}60`,
          boxShadow: beacon.isTransmitting
            ? `0 0 12px ${BEACON_COLOR_ACTIVE}40`
            : `0 0 8px rgba(0,0,0,0.5)`,
          minWidth: "180px",
          color: "#e0e0e8",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: callsign + status */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[12px] font-bold tracking-wider"
            style={{
              color: beacon.isTransmitting
                ? BEACON_COLOR_ACTIVE
                : BEACON_COLOR_INACTIVE,
            }}
          >
            {beacon.callsign}
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase"
            style={{
              backgroundColor: beacon.isTransmitting
                ? `${BEACON_COLOR_ACTIVE}20`
                : "rgba(255,255,255,0.08)",
              color: beacon.isTransmitting ? BEACON_COLOR_ACTIVE : "#888",
              border: `1px solid ${beacon.isTransmitting ? BEACON_COLOR_ACTIVE : "#555"}40`,
            }}
          >
            {beacon.isTransmitting ? "ON AIR" : "IDLE"}
          </span>
        </div>

        {/* Location */}
        <div className="text-[9px]" style={{ color: "#aaa" }}>
          {beacon.location}
        </div>

        {/* Coordinates */}
        <div className="text-[9px]" style={{ color: "#777" }}>
          {beacon.lat.toFixed(2)}&deg;{beacon.lat >= 0 ? "N" : "S"},{" "}
          {Math.abs(beacon.lon).toFixed(2)}&deg;{beacon.lon >= 0 ? "E" : "W"}
        </div>

        {/* Divider */}
        <div
          className="my-0.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        />

        {/* Current band if transmitting */}
        {beacon.isTransmitting && beacon.currentBandKHz && (
          <div className="flex items-center gap-1.5">
            <span style={{ color: "#888" }}>Band:</span>
            <span style={{ color: BEACON_COLOR_ACTIVE, fontWeight: 600 }}>
              {formatBeaconFrequency(beacon.currentBandKHz)}
            </span>
          </div>
        )}

        {/* Schedule info */}
        <div className="flex items-center gap-1.5">
          <span style={{ color: "#888" }}>
            {beacon.isTransmitting ? "Next cycle:" : "Next TX:"}
          </span>
          <span style={{ color: "#ccc" }}>
            {nextTx !== null ? formatSecondsAgo(nextTx) : "--"}
          </span>
        </div>

        {/* Frequencies */}
        <div className="flex items-center gap-1.5">
          <span style={{ color: "#888" }}>Bands:</span>
          <span style={{ color: "#999" }}>
            {BEACON_FREQUENCIES.map((f) => `${(f / 1000).toFixed(1)}`).join(
              ", ",
            )}{" "}
            MHz
          </span>
        </div>

        {/* Slot index */}
        <div className="flex items-center gap-1.5">
          <span style={{ color: "#888" }}>Slot:</span>
          <span style={{ color: "#999" }}>#{beacon.slotIndex} of 18</span>
        </div>
      </div>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Individual Beacon Marker
// ---------------------------------------------------------------------------

interface BeaconMarkerProps {
  beacon: BeaconData;
  position: THREE.Vector3;
  isActive: boolean;
  occlusionOpacity: number;
  inactiveOpacity: number;
  isSelected: boolean;
  onSelect: (callsign: string) => void;
  activeFrequencyMHz: number;
  diamondGeo: THREE.OctahedronGeometry;
  activeGlowGeo: THREE.OctahedronGeometry;
}

function BeaconMarker({
  beacon,
  position,
  isActive,
  occlusionOpacity,
  inactiveOpacity,
  isSelected,
  onSelect,
  activeFrequencyMHz,
  diamondGeo,
  activeGlowGeo,
}: BeaconMarkerProps) {
  const markerRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  // Compute effective opacity:
  // - Active beacons: always visible, but reduced when behind globe
  // - Inactive beacons: fully respect occlusion and user's inactiveOpacity setting
  const effectiveOpacityRef = useRef(1);

  useFrame(({ clock }) => {
    let baseOpacity: number;
    if (isActive) {
      // Active beacon: always partially visible, even when occluded
      baseOpacity = Math.max(occlusionOpacity, ACTIVE_OCCLUDED_OPACITY);
    } else {
      // Inactive beacon: fully respect occlusion, scaled by user opacity preference
      baseOpacity = occlusionOpacity * inactiveOpacity;
    }
    effectiveOpacityRef.current = baseOpacity;

    // Pulse animation for active beacon
    const t = clock.getElapsedTime();
    const pulse = isActive ? 1.0 + 0.25 * Math.sin(t * 4) : 1.0;

    if (markerRef.current) {
      markerRef.current.scale.setScalar(pulse);
    }

    if (materialRef.current) {
      materialRef.current.opacity = isActive ? baseOpacity : baseOpacity * 0.8;
    }

    if (glowRef.current && glowMatRef.current) {
      const glowPulse = 0.15 + 0.2 * Math.sin(t * 4);
      glowMatRef.current.opacity = glowPulse * baseOpacity;
      glowRef.current.scale.setScalar(pulse * 1.1);
    }
  });

  const handleClick = useCallback(
    (e: THREE.Event) => {
      if ("stopPropagation" in e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      onSelect(beacon.callsign);
    },
    [beacon.callsign, onSelect],
  );

  // Determine label visibility: hide labels for very occluded inactive beacons
  const labelOpacity = isActive
    ? Math.max(occlusionOpacity, ACTIVE_MIN_OPACITY)
    : occlusionOpacity * inactiveOpacity;

  return (
    <group position={position}>
      {/* Diamond marker */}
      <mesh
        ref={markerRef}
        geometry={diamondGeo}
        onClick={handleClick}
        renderOrder={isActive ? 3 : 1}
      >
        <meshBasicMaterial
          ref={materialRef}
          color={isActive ? BEACON_COLOR_ACTIVE : BEACON_COLOR_INACTIVE}
          transparent
          opacity={isActive ? 1 : 0.8}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Active beacon glow */}
      {isActive && (
        <mesh ref={glowRef} geometry={activeGlowGeo} renderOrder={0}>
          <meshBasicMaterial
            ref={glowMatRef}
            color={BEACON_GLOW_COLOR}
            transparent
            opacity={0.2}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {/* Callsign label (+ frequency for active beacon) */}
      <Html
        position={[0, MARKER_SIZE * 3, 0]}
        center
        zIndexRange={[1, 0]}
        style={{
          pointerEvents: "none",
          transition: "opacity 0.2s ease",
          opacity: labelOpacity,
        }}
      >
        <div className="flex flex-col items-center gap-0">
          <div
            className="px-1.5 py-0.5 rounded text-[9px] font-mono whitespace-nowrap"
            style={{
              backgroundColor: "rgba(10, 10, 26, 0.88)",
              color: isActive ? BEACON_COLOR_ACTIVE : BEACON_COLOR_INACTIVE,
              border: `1px solid ${isActive ? BEACON_COLOR_ACTIVE : BEACON_COLOR_INACTIVE}50`,
              boxShadow: isActive ? `0 0 8px ${BEACON_COLOR_ACTIVE}60` : "none",
              fontWeight: isActive ? 700 : 400,
              cursor: "pointer",
            }}
          >
            {beacon.callsign}
            {isActive && (
              <span style={{ marginLeft: 4, fontSize: "8px" }}>
                {activeFrequencyMHz.toFixed(3)}
              </span>
            )}
          </div>
        </div>
      </Html>

      {/* Info popup when selected */}
      {isSelected && (
        <BeaconInfoPopup beacon={beacon} occlusionOpacity={occlusionOpacity} />
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const BeaconNetworkOverlay3D = React.memo(
  function BeaconNetworkOverlay3D({
    beacons,
    currentBeaconIndex: _currentBeaconIndex,
    activeFrequencyMHz: activeFrequencyMHzProp,
  }: BeaconNetworkOverlay3DProps) {
    // Fall back to the operating store frequency (Hz -> MHz) when prop is not provided
    const storeFrequencyHz = useActiveFrequency();
    const activeFrequencyMHz =
      activeFrequencyMHzProp ?? storeFrequencyHz / 1_000_000;

    // Selected beacon for info popup
    const [selectedCallsign, setSelectedCallsign] = useState<string | null>(
      null,
    );

    // User-controlled inactive beacon opacity from mapStore
    const inactiveOpacity = useMapStore((s) => s.beaconInactiveOpacity);

    const hasBeacons = beacons.length > 0;

    // Pre-compute positions for all beacons
    const beaconPositions = useMemo(() => {
      return beacons.map((b) => latLonToVector3(b.lat, b.lon, SURFACE_RADIUS));
    }, [beacons]);

    // Batch occlusion for all beacon positions
    const occlusionPositions = useMemo(
      () => beacons.map((b) => ({ lat: b.lat, lon: b.lon })),
      [beacons],
    );
    const { getOpacity, version: _occlusionVersion } =
      useGlobeOcclusionBatch(occlusionPositions);

    // Shared geometries -- reused across all beacon markers
    const diamondGeo = useMemo(
      () => new THREE.OctahedronGeometry(MARKER_SIZE, 0),
      [],
    );
    const activeGlowGeo = useMemo(
      () => new THREE.OctahedronGeometry(MARKER_SIZE * 1.8, 0),
      [],
    );

    // Toggle selection on click; dismiss when clicking the same beacon
    const handleSelect = useCallback((callsign: string) => {
      setSelectedCallsign((prev) => (prev === callsign ? null : callsign));
    }, []);

    // Early-out: nothing to render
    if (!hasBeacons) return null;

    return (
      <group>
        {beacons.map((beacon, i) => {
          const pos = beaconPositions[i];
          const isActive = beacon.isTransmitting;
          const occlusionOpacity = getOpacity(beacon.lat, beacon.lon);

          return (
            <BeaconMarker
              key={beacon.callsign}
              beacon={beacon}
              position={pos}
              isActive={isActive}
              occlusionOpacity={occlusionOpacity}
              inactiveOpacity={inactiveOpacity}
              isSelected={selectedCallsign === beacon.callsign}
              onSelect={handleSelect}
              activeFrequencyMHz={activeFrequencyMHz}
              diamondGeo={diamondGeo}
              activeGlowGeo={activeGlowGeo}
            />
          );
        })}
      </group>
    );
  },
);

export default BeaconNetworkOverlay3D;

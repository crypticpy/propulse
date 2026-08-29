/**
 * TimeStationsOverlay3D
 *
 * Renders the standard time & frequency broadcast stations (WWV, WWVH, CHU,
 * RWM, BPM, YVTO, HLA) on the 3D globe as small marker cubes (parity item
 * G20). These are fixed, continuously transmitting HF beacons with known
 * schedules -- hearing one is an instant propagation check toward its
 * region.
 *
 * Modeled on BeaconNetworkOverlay3D:
 * - Globe occlusion via useGlobeOcclusionBatch so far-side stations fade out.
 * - Always-on callsign + frequency label, mirroring the beacon label.
 * - Click a marker to open a detail popup (name, operator, coordinates,
 *   frequencies, notes), mirroring the beacon info popup. Click again to
 *   dismiss.
 *
 * Unlike the beacon network, these stations have no rotation schedule --
 * this is a purely static layer with no timers or per-frame animation
 * beyond the shared occlusion calculation.
 */

import React, { useMemo, useState, useCallback } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useGlobeOcclusionBatch } from "@/hooks/useGlobeOcclusionBatch";
import { TIME_STATIONS, type TimeStation } from "@/lib/data/timeStations";
import { GLOBE_LAYER_ORDER } from "@/lib/map/globeRenderOrder";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Marker cube half-extent-ish size */
const MARKER_SIZE = 0.007;

/** Surface placement radius to avoid z-fighting */
const SURFACE_RADIUS = 1.012;

/** Marker color -- cosmic cyan, distinct from beacon gold/green */
const MARKER_COLOR = "#44ddff";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert lat/lon to a 3D position on the globe.
 * Mirrors BeaconNetworkOverlay3D's latLonToVector3.
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

/** Format frequencies as "2.5/5/10/15/20/25 MHz" */
function formatFrequencies(frequenciesMHz: number[]): string {
  return `${frequenciesMHz.join("/")} MHz`;
}

// ---------------------------------------------------------------------------
// Station Info Popup
// ---------------------------------------------------------------------------

interface StationInfoPopupProps {
  station: TimeStation;
  occlusionOpacity: number;
}

function StationInfoPopup({ station, occlusionOpacity }: StationInfoPopupProps) {
  return (
    <Html
      position={[0, MARKER_SIZE * 6, 0]}
      center
      zIndexRange={[10, 5]}
      style={{
        pointerEvents: "auto",
        opacity: Math.max(occlusionOpacity, 0.25),
      }}
    >
      <div
        className="flex flex-col gap-1 rounded-md px-3 py-2 text-[10px] font-mono"
        style={{
          backgroundColor: "rgba(8, 8, 24, 0.94)",
          border: `1px solid ${MARKER_COLOR}60`,
          boxShadow: `0 0 8px rgba(0,0,0,0.5)`,
          minWidth: "180px",
          color: "#e0e0e8",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[12px] font-bold tracking-wider"
            style={{ color: MARKER_COLOR }}
          >
            {station.callsign}
          </span>
        </div>

        <div className="text-[9px]" style={{ color: "#aaa" }}>
          {station.name}
        </div>

        <div className="text-[9px]" style={{ color: "#777" }}>
          {station.lat.toFixed(2)}&deg;{station.lat >= 0 ? "N" : "S"},{" "}
          {Math.abs(station.lon).toFixed(2)}&deg;
          {station.lon >= 0 ? "E" : "W"}
        </div>

        <div
          className="my-0.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
        />

        <div className="flex items-center gap-1.5">
          <span style={{ color: "#888" }}>Operator:</span>
          <span style={{ color: "#ccc" }}>{station.operator}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span style={{ color: "#888" }}>Frequencies:</span>
          <span style={{ color: MARKER_COLOR, fontWeight: 600 }}>
            {formatFrequencies(station.frequenciesMHz)}
          </span>
        </div>

        {station.notes && (
          <div className="text-[9px]" style={{ color: "#999" }}>
            {station.notes}
          </div>
        )}
      </div>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Individual Station Marker
// ---------------------------------------------------------------------------

interface StationMarkerProps {
  station: TimeStation;
  position: THREE.Vector3;
  occlusionOpacity: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  markerGeo: THREE.BoxGeometry;
}

function StationMarker({
  station,
  position,
  occlusionOpacity,
  isSelected,
  onSelect,
  markerGeo,
}: StationMarkerProps) {
  const handleClick = useCallback(
    (e: THREE.Event) => {
      if ("stopPropagation" in e && typeof e.stopPropagation === "function") {
        e.stopPropagation();
      }
      onSelect(station.id);
    },
    [station.id, onSelect],
  );

  return (
    <group position={position}>
      {/* Cube marker */}
      <mesh
        geometry={markerGeo}
        onClick={handleClick}
        renderOrder={GLOBE_LAYER_ORDER.markers + 0.1}
      >
        <meshBasicMaterial
          color={MARKER_COLOR}
          transparent
          opacity={occlusionOpacity * 0.85}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Callsign + frequency label, always on */}
      <Html
        position={[0, MARKER_SIZE * 3, 0]}
        center
        zIndexRange={[1, 0]}
        style={{
          pointerEvents: "none",
          transition: "opacity 0.2s ease",
          opacity: occlusionOpacity,
        }}
      >
        <div
          className="px-1.5 py-0.5 rounded text-[9px] font-mono whitespace-nowrap"
          style={{
            backgroundColor: "rgba(10, 10, 26, 0.88)",
            color: MARKER_COLOR,
            border: `1px solid ${MARKER_COLOR}50`,
            cursor: "pointer",
          }}
        >
          {station.callsign}
          <span style={{ marginLeft: 4, fontSize: "8px", color: "#aad" }}>
            {formatFrequencies(station.frequenciesMHz)}
          </span>
        </div>
      </Html>

      {isSelected && (
        <StationInfoPopup
          station={station}
          occlusionOpacity={occlusionOpacity}
        />
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TimeStationsOverlay3D = React.memo(
  function TimeStationsOverlay3D() {
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const positions = useMemo(
      () =>
        TIME_STATIONS.map((s) =>
          latLonToVector3(s.lat, s.lon, SURFACE_RADIUS),
        ),
      [],
    );

    const occlusionPositions = useMemo(
      () => TIME_STATIONS.map((s) => ({ lat: s.lat, lon: s.lon })),
      [],
    );
    const { getOpacity, version: _occlusionVersion } =
      useGlobeOcclusionBatch(occlusionPositions);

    const markerGeo = useMemo(
      () => new THREE.BoxGeometry(MARKER_SIZE, MARKER_SIZE, MARKER_SIZE),
      [],
    );

    const handleSelect = useCallback((id: string) => {
      setSelectedId((prev) => (prev === id ? null : id));
    }, []);

    return (
      <group>
        {TIME_STATIONS.map((station, i) => (
          <StationMarker
            key={station.id}
            station={station}
            position={positions[i]}
            occlusionOpacity={getOpacity(station.lat, station.lon)}
            isSelected={selectedId === station.id}
            onSelect={handleSelect}
            markerGeo={markerGeo}
          />
        ))}
      </group>
    );
  },
);

export default TimeStationsOverlay3D;

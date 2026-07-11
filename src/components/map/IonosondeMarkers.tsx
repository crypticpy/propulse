/**
 * IonosondeMarkers Component
 *
 * Displays ionosonde station locations on the 3D globe with color-coded
 * markers based on current foF2 values. Each marker shows real-time
 * ionospheric measurements from the global ionosonde network.
 *
 * Features:
 * - Color-coded by foF2 value (red=poor to blue=excellent)
 * - Hover tooltips with station details
 * - Data freshness indicators
 * - Pulsing animation for fresh data
 */

import { useMemo, useState } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useIonosondeData } from "@/hooks/useIonosondeData";
import { getFoF2Color, getDataFreshness } from "@/lib/api/ionosonde";
import type { IonosondeReading } from "@/lib/api/ionosonde";

interface IonosondeMarkersProps {
  /** Whether to show the markers layer */
  visible?: boolean;
  /** Globe radius (default 1.0) */
  globeRadius?: number;
}

/**
 * Convert lat/lon to 3D position on globe surface
 */
function latLonToPosition(
  lat: number,
  lon: number,
  radius: number,
): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Individual station marker component
 */
function StationMarker({
  station,
  globeRadius,
}: {
  station: IonosondeReading;
  globeRadius: number;
}) {
  const [hovered, setHovered] = useState(false);

  const position = useMemo(
    () => latLonToPosition(station.lat, station.lon, globeRadius + 0.005),
    [station.lat, station.lon, globeRadius],
  );

  const color = useMemo(() => getFoF2Color(station.foF2), [station.foF2]);
  const freshness = useMemo(
    () => getDataFreshness(station.timestamp),
    [station.timestamp],
  );

  // Marker size based on confidence
  const markerSize = 0.008 + (station.confidence / 100) * 0.004;

  return (
    <group position={position}>
      {/* Main marker sphere */}
      <mesh
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[markerSize, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={freshness === "old" ? 0.5 : 0.9}
        />
      </mesh>

      {/* Outer glow ring for fresh data */}
      {freshness === "fresh" && (
        <mesh>
          <ringGeometry args={[markerSize * 1.2, markerSize * 1.6, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Tooltip on hover */}
      {hovered && (
        <Html
          distanceFactor={3}
          style={{
            pointerEvents: "none",
            transform: "translate(-50%, -120%)",
          }}
        >
          <div
            className="rounded-lg border border-space-700 bg-space-900/95 px-3 py-2 shadow-lg backdrop-blur-sm"
            style={{ minWidth: "160px" }}
          >
            <div className="mb-1 text-sm font-medium text-white">
              {station.name}
            </div>
            <div className="space-y-0.5 text-xs">
              <div className="flex justify-between">
                <span className="text-space-400">foF2:</span>
                <span className="font-mono text-signal-green">
                  {station.foF2.toFixed(1)} MHz
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-space-400">MUF(3000):</span>
                <span className="font-mono text-cosmic-cyan">
                  {station.muf3000.toFixed(1)} MHz
                </span>
              </div>
              {station.hmF2 && (
                <div className="flex justify-between">
                  <span className="text-space-400">hmF2:</span>
                  <span className="font-mono text-space-300">
                    {station.hmF2.toFixed(0)} km
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-space-400">Confidence:</span>
                <span
                  className={`font-mono ${
                    station.confidence >= 80
                      ? "text-signal-green"
                      : station.confidence >= 50
                        ? "text-solar-gold"
                        : "text-alert-red"
                  }`}
                >
                  {station.confidence.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-space-700 pt-1">
                <span className="text-space-400">Status:</span>
                <span
                  className={`text-xs ${
                    freshness === "fresh"
                      ? "text-signal-green"
                      : freshness === "stale"
                        ? "text-solar-gold"
                        : "text-space-500"
                  }`}
                >
                  {freshness === "fresh"
                    ? "Live"
                    : freshness === "stale"
                      ? "Recent"
                      : "Outdated"}
                </span>
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * IonosondeMarkers component
 *
 * Renders all ionosonde station markers on the globe
 */
export function IonosondeMarkers({
  visible = true,
  globeRadius = 1.0,
}: IonosondeMarkersProps) {
  const { stations, isLoading } = useIonosondeData();

  // Don't render if not visible or loading
  if (!visible || isLoading || !stations.length) {
    return null;
  }

  return (
    <group name="ionosonde-markers">
      {stations.map((station) => (
        <StationMarker
          key={station.id}
          station={station}
          globeRadius={globeRadius}
        />
      ))}
    </group>
  );
}

/**
 * IonosondeMarkers legend component for UI overlay
 */
export function IonosondeLegend({ visible = true }: { visible?: boolean }) {
  const { stations, lastUpdate, source, isFetching } = useIonosondeData();

  if (!visible) return null;

  const legendItems = [
    { label: "< 3 MHz", color: "#ef4444", description: "Poor" },
    { label: "3-5 MHz", color: "#f97316", description: "Fair" },
    { label: "5-7 MHz", color: "#eab308", description: "Moderate" },
    { label: "7-10 MHz", color: "#22c55e", description: "Good" },
    { label: "> 10 MHz", color: "#3b82f6", description: "Excellent" },
  ];

  return (
    <div className="rounded-lg border border-space-700 bg-space-900/90 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-white">Ionosondes</span>
        {isFetching && (
          <span className="text-xs text-cosmic-cyan">Updating...</span>
        )}
      </div>

      <div className="space-y-1.5">
        {legendItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-space-300">
              {item.label} ({item.description})
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 border-t border-space-700 pt-2">
        <div className="flex items-center justify-between text-xs text-space-400">
          <span>{stations.length} stations</span>
          {lastUpdate && (
            <span>
              {lastUpdate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        {source && (
          <div className="mt-0.5 text-xs text-space-500">Source: {source}</div>
        )}
      </div>
    </div>
  );
}

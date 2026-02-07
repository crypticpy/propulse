/**
 * MobileMap Component
 *
 * Standalone mobile map view that renders FlatMapView (2D canvas)
 * instead of GlobeView to avoid loading the 887 KB Three.js vendor chunk.
 * Lazy-loaded at the route level for proper code splitting.
 */

import { useState, useMemo } from "react";
import { FlatMapView } from "@/components/map/FlatMapView";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import {
  calculateBandConditions,
  calculateGreatCircleDistance,
} from "@/lib/utils/bands";
import type { BandStatus } from "@/types/solar";

type MobileMapTab = "bands" | "spots" | "path";

/** Color for band condition labels */
function getConditionColor(condition: string): string {
  switch (condition) {
    case "Excellent":
      return "#00ff88";
    case "Good":
      return "#44dd66";
    case "Fair":
      return "#ffaa00";
    case "Poor":
      return "#ff4455";
    default:
      return "#6b7280";
  }
}

export function MobileMap() {
  const [activeTab, setActiveTab] = useState<MobileMapTab>("bands");
  const [showPanel, setShowPanel] = useState(false);

  // Map store
  const target = useMapStore((s) => s.target);
  const timeOffset = useMapStore((s) => s.timeOffset);
  const absoluteTime = useMapStore((s) => s.absoluteTime);

  // User store
  const station = useUserStore((s) => s.station);

  // Display time (matches PropSphere logic)
  const displayTime = useMemo(() => {
    if (absoluteTime) return new Date(absoluteTime);
    const now = new Date();
    now.setHours(now.getHours() + timeOffset);
    return now;
  }, [timeOffset, absoluteTime]);

  // Solar data for band conditions
  const { data: kIndexData } = useKIndex();
  const { data: fluxData } = useSolarFlux();

  const currentKp = kIndexData?.[kIndexData.length - 1]?.kp_index ?? null;
  const currentFlux = fluxData?.[fluxData.length - 1]?.flux ?? null;

  // Live spots
  const { spots, isLoading: spotsLoading } = useLiveSpots({
    grid: station?.grid,
    enabled: true,
  });

  // Band conditions
  const bandConditions = useMemo<BandStatus[]>(() => {
    if (currentKp === null || currentFlux === null) return [];
    return calculateBandConditions(currentKp, currentFlux);
  }, [currentKp, currentFlux]);

  // Path info
  const pathInfo = useMemo(() => {
    if (!station || !target) return null;
    const distance = calculateGreatCircleDistance(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
    );
    // Calculate bearing
    const lat1 = (station.lat * Math.PI) / 180;
    const lat2 = (target.lat * Math.PI) / 180;
    const dLon = ((target.lon - station.lon) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

    return { distance: Math.round(distance), bearing: Math.round(bearing) };
  }, [station, target]);

  // HF bands only (filter out VHF)
  const hfBands = bandConditions.filter(
    (b) => !b.name.includes("6m") && !b.name.includes("2m"),
  );

  // Spot counts by band
  const spotsByBand = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const spot of spots) {
      const band = spot.band || "unknown";
      counts[band] = (counts[band] || 0) + 1;
    }
    return counts;
  }, [spots]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Map fills available space */}
      <div className="flex-1 relative min-h-0">
        <FlatMapView displayTime={displayTime} />
      </div>

      {/* Toggle panel handle */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="absolute bottom-14 left-0 right-0 z-10 bg-deep-space/90 border-t border-white/10 py-2 flex justify-center"
      >
        <div className="w-10 h-1 bg-gray-600 rounded-full" />
      </button>

      {/* Panel overlay when open */}
      {showPanel && (
        <div className="absolute bottom-0 left-0 right-0 z-20 h-[40vh] bg-deep-space/95 backdrop-blur-md border-t border-white/10 rounded-t-2xl flex flex-col">
          {/* Close handle */}
          <button
            onClick={() => setShowPanel(false)}
            className="flex justify-center pt-2 pb-1"
          >
            <div className="w-10 h-1 bg-gray-500 rounded-full" />
          </button>

          {/* Tab bar */}
          <div className="flex border-b border-white/10">
            {(["bands", "spots", "path"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium capitalize ${
                  activeTab === tab
                    ? "text-plasma-orange border-b-2 border-plasma-orange"
                    : "text-gray-500"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content - scrollable */}
          <div className="flex-1 overflow-y-auto p-3 overscroll-contain">
            {/* Bands tab */}
            {activeTab === "bands" && (
              <div className="space-y-1.5">
                {hfBands.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">
                    Waiting for solar data...
                  </p>
                ) : (
                  hfBands.map((band) => {
                    // Determine which condition to show based on rough UTC time
                    const hour = new Date().getUTCHours();
                    const isDaytime = hour >= 6 && hour < 18;
                    const condition = isDaytime
                      ? band.dayCondition
                      : band.nightCondition;

                    return (
                      <div
                        key={band.name}
                        className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm text-white font-bold w-10">
                            {band.name}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {band.freq}
                          </span>
                        </div>
                        <span
                          className="text-xs font-medium"
                          style={{ color: getConditionColor(condition) }}
                        >
                          {condition}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Spots tab */}
            {activeTab === "spots" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {spotsLoading ? "Loading..." : `${spots.length} spots`}
                  </span>
                </div>
                {Object.entries(spotsByBand)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([band, count]) => (
                    <div
                      key={band}
                      className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2"
                    >
                      <span className="font-mono text-xs text-white">
                        {band}
                      </span>
                      <span className="text-xs text-gray-400">
                        {count} spot{count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                {spots.length === 0 && !spotsLoading && (
                  <p className="text-xs text-gray-500 text-center py-4">
                    No spots available
                  </p>
                )}
                {/* Recent spots list */}
                {spots.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                      Recent
                    </div>
                    {spots.slice(0, 8).map((spot, i) => (
                      <div
                        key={`${spot.dx}-${i}`}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="font-mono text-signal-green">
                          {spot.dx}
                        </span>
                        <span className="text-gray-500">
                          {spot.band || spot.frequency?.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Path tab */}
            {activeTab === "path" && (
              <div className="space-y-3">
                {!target ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-gray-500">
                      No target selected. Tap a location on the map to set a
                      target.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Target</span>
                        <span className="font-mono text-sm text-signal-green">
                          {target.grid || target.name || "Custom"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Position</span>
                        <span className="font-mono text-xs text-gray-300">
                          {target.lat.toFixed(2)}, {target.lon.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {pathInfo && (
                      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            Distance
                          </span>
                          <span className="font-mono text-sm text-white">
                            {pathInfo.distance.toLocaleString()} km
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Bearing</span>
                          <span className="font-mono text-sm text-white">
                            {pathInfo.bearing}°
                          </span>
                        </div>
                      </div>
                    )}
                    {station && (
                      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            Your QTH
                          </span>
                          <span className="font-mono text-xs text-gray-300">
                            {station.grid}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useApplySolarMapHandoff } from "@/hooks/useSolarHandoff";
import { useStationCastContext } from "@/hooks/useStationCastContext";
/**
 * MobileMap Component
 *
 * Mobile map view with globe (default) and flat view toggle.
 * GlobeView is lazy-loaded so the ~887 KB Three.js vendor chunk
 * only downloads when the globe is rendered (cached thereafter).
 * Lazy-loaded at the route level for proper code splitting.
 */

import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { FlatMapView } from "@/components/map/FlatMapView";
import { ActivationDetailPanel } from "@/components/map/ActivationDetailPanel";
import { ObservatoryTiltSlider } from "@/components/map/ObservatoryTiltSlider";
import { MAP_PAGE_CHROME_Z } from "@/lib/map/globeRenderOrder";
import { ReachMapControl } from "@/components/map/ReachMapControl";
import { BoundViewHost } from "@/components/views/BoundViewHost";
import { useMapStore } from "@/stores/mapStore";
import { useBoundVisualTarget } from "@/hooks/useBoundMapSelection";
import { useUserStore } from "@/stores/userStore";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useReachMapSurface } from "@/hooks/useReachMapSurface";
import { propagationModelVisible } from "@/lib/propagation/modelClient";
import {
  calculateBandConditions,
  calculateGreatCircleDistance,
} from "@/lib/utils/bands";
import type { BandStatus } from "@/types/solar";
import type { UserStation } from "@/types/user";

const GlobeView = lazy(() =>
  import("@/components/map/GlobeView").then((m) => ({ default: m.GlobeView })),
);

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

function GlobeLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center bg-void-black h-full">
      <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  );
}

/**
 * Path tab content. Rendered inside <BoundViewHost>, so it can read the
 * scoped view runtime's bound target instead of the parent's stale copy —
 * MobileMap itself sits above the provider and cannot.
 */
export function MobileMapPathTab({ station }: { station: UserStation | null }) {
  const mapTarget = useMapStore((s) => s.target);
  const target = useBoundVisualTarget(mapTarget);

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

  if (!target) {
    return (
      <div className="space-y-3">
        <div className="text-center py-6">
          <p className="text-xs text-su-muted">
            No target selected. Tap a location on the map to set a target.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-su-line/10 border border-su-line/40 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-su-muted">Target</span>
          <span className="font-mono text-sm text-signal-green">
            {target.grid || target.name || "Custom"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-su-muted">Position</span>
          <span className="font-mono text-xs text-su-muted">
            {target.lat.toFixed(2)}, {target.lon.toFixed(2)}
          </span>
        </div>
      </div>
      {pathInfo && (
        <div className="bg-su-line/10 border border-su-line/40 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-su-muted">Distance</span>
            <span className="font-mono text-sm text-su-text">
              {pathInfo.distance.toLocaleString()} km
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-su-muted">Bearing</span>
            <span className="font-mono text-sm text-su-text">
              {pathInfo.bearing}°
            </span>
          </div>
        </div>
      )}
      {station && (
        <div className="bg-su-line/10 border border-su-line/40 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-su-muted">Your QTH</span>
            <span className="font-mono text-xs text-su-muted">
              {station.grid}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function MobileMap() {
  useApplySolarMapHandoff();
  const [activeTab, setActiveTab] = useState<MobileMapTab>("bands");
  const [showPanel, setShowPanel] = useState(false);
  const [reachMapEnabled, setReachMapEnabled] = useState(false);
  const [reachMapBand, setReachMapBand] = useState("20m");
  const [reachMapPersonalized, setReachMapPersonalized] = useState(true);

  // Map store
  const viewMode = useMapStore((s) => s.viewMode);
  const setViewMode = useMapStore((s) => s.setViewMode);
  const timeOffset = useMapStore((s) => s.timeOffset);
  const absoluteTime = useMapStore((s) => s.absoluteTime);

  // Landscape hint state
  const [hintDismissed, setHintDismissed] = useState(
    () => localStorage.getItem("propulse:landscape-hint-dismissed") === "1",
  );
  const [isPortrait, setIsPortrait] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(orientation: portrait)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const handler = (e: MediaQueryListEvent) => setIsPortrait(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (hintDismissed || !isPortrait) return;
    const id = setTimeout(() => setHintDismissed(true), 8000);
    return () => clearTimeout(id);
  }, [hintDismissed, isPortrait]);

  const isTouch =
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;
  const showLandscapeHint =
    isTouch && isPortrait && !hintDismissed && viewMode === "globe";

  // User store
  const baseStation = useUserStore((s) => s.station);
  const stationContext = useStationCastContext();
  const station = useMemo(() => baseStation && stationContext.location ? { ...baseStation, ...stationContext.location } : baseStation, [baseStation, stationContext.location]);

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
  const reachMapState = useReachMapSurface({
    enabled: reachMapEnabled,
    renderOverlay: reachMapEnabled,
    personalized: reachMapPersonalized,
    band: reachMapBand,
    validTime: displayTime,
    timeOffsetHours: absoluteTime ? null : timeOffset,
    weather: {
      kp: currentKp ?? undefined,
      f107: currentFlux ?? undefined,
    },
  });

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
    <BoundViewHost slot="normal">
    <div className="flex flex-col h-full relative">
      {/* Map fills available space. `isolate` bounds the map's overlay portal
          (11000) here so it cannot outrank the bottom panel (z-20), the tab
          bar (z-50) or a modal on the page (#930). */}
      <div data-map-stack-root className="flex-1 relative min-h-0 isolate">
        {viewMode === "globe" ? (
          <Suspense fallback={<GlobeLoadingFallback />}>
            <GlobeView displayTime={displayTime} />
          </Suspense>
        ) : (
          <FlatMapView displayTime={displayTime} fillContainer />
        )}

        {/* View toggle (globe / flat) */}
        <div
          className="absolute top-3 left-3 flex gap-1"
          style={{ zIndex: MAP_PAGE_CHROME_Z.interactiveChrome }}
        >
          {(["globe", "flat"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-2 py-1 rounded text-xs font-medium backdrop-blur-md transition-all capitalize ${
                viewMode === mode
                  ? "bg-plasma-orange text-su-on-accent"
                  : "bg-su-input/50 text-su-muted hover:text-su-text"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {propagationModelVisible && (
          <ReachMapControl
            floating
            enabled={reachMapEnabled}
            band={reachMapBand}
            personalized={reachMapState.personalized}
            onEnabledChange={setReachMapEnabled}
            onBandChange={setReachMapBand}
            onPersonalizedChange={setReachMapPersonalized}
            state={reachMapState}
          />
        )}

        {/* Landscape orientation hint */}
        {showLandscapeHint && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 bg-su-panel/90 backdrop-blur-md border border-su-line/40 rounded-lg px-3 py-1.5 flex items-center gap-2 animate-in fade-in duration-300"
            style={{ zIndex: MAP_PAGE_CHROME_Z.interactiveChrome }}
          >
            <svg
              className="w-4 h-4 text-cosmic-cyan flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                transform="rotate(-45 12 12)"
              />
            </svg>
            <span className="text-[11px] text-su-muted whitespace-nowrap">
              Rotate for a wider view
            </span>
            <button
              type="button"
              onClick={() => {
                setHintDismissed(true);
                localStorage.setItem("propulse:landscape-hint-dismissed", "1");
              }}
              className="text-su-muted hover:text-su-text ml-1"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {/* Tilt slider for globe view */}
        {viewMode === "globe" && (
          <ObservatoryTiltSlider
            visible
            className="absolute bottom-2 right-2"
          />
        )}
      </div>

      {/* Toggle panel handle */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="absolute bottom-14 left-0 right-0 z-10 bg-deep-space/90 border-t border-su-line/40 py-2 flex justify-center"
      >
        <div className="w-10 h-1 bg-su-line rounded-full" />
      </button>

      {/* Panel overlay when open */}
      {showPanel && (
        <div className="absolute bottom-0 left-0 right-0 z-20 h-[40vh] bg-deep-space/95 backdrop-blur-md border-t border-su-line/40 rounded-t-2xl flex flex-col">
          {/* Close handle */}
          <button
            onClick={() => setShowPanel(false)}
            className="flex justify-center pt-2 pb-1"
          >
            <div className="w-10 h-1 bg-su-line rounded-full" />
          </button>

          {/* Tab bar */}
          <div className="flex border-b border-su-line/40">
            {(["bands", "spots", "path"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 text-xs font-medium capitalize ${
                  activeTab === tab
                    ? "text-plasma-orange border-b-2 border-plasma-orange"
                    : "text-su-muted"
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
                  <p className="text-xs text-su-muted text-center py-4">
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
                        className="flex items-center justify-between bg-su-line/10 border border-su-line/40 rounded-lg px-3 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm text-su-text font-bold w-10">
                            {band.name}
                          </span>
                          <span className="text-[10px] text-su-muted">
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
                  <span className="text-xs text-su-muted">
                    {spotsLoading ? "Loading..." : `${spots.length} spots`}
                  </span>
                </div>
                {Object.entries(spotsByBand)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 10)
                  .map(([band, count]) => (
                    <div
                      key={band}
                      className="flex items-center justify-between bg-su-line/10 border border-su-line/40 rounded-lg px-3 py-2"
                    >
                      <span className="font-mono text-xs text-su-text">
                        {band}
                      </span>
                      <span className="text-xs text-su-muted">
                        {count} spot{count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                {spots.length === 0 && !spotsLoading && (
                  <p className="text-xs text-su-muted text-center py-4">
                    No spots available
                  </p>
                )}
                {/* Recent spots list */}
                {spots.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-[10px] text-su-muted uppercase tracking-wider mb-1">
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
                        <span className="text-su-muted">
                          {spot.band || spot.frequency?.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Path tab */}
            {activeTab === "path" && <MobileMapPathTab station={station} />}
          </div>
        </div>
      )}

      {/* Mobile reuses the shared map renderers, so it owns the same portal
          dialog as desktop PropSphere for activation-label selections. */}
      <ActivationDetailPanel />
    </div>
    </BoundViewHost>
  );
}

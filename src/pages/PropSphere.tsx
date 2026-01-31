/**
 * PropSphere Page
 *
 * Interactive map visualization for radio propagation analysis.
 * Features 3D globe and 2D flat map views with terminator,
 * greyline, and path analysis tools.
 */

import { useCallback, useMemo, useState } from "react";
import { addHours } from "date-fns";
import {
  GlobeView,
  FlatMapView,
  AzimuthalView,
  ViewModeToggle,
  TimeControl,
  PathAnalysis,
  PropagationForecast,
  QuickTargets,
  MUFLegend,
  FullscreenPropSphere,
  RecommendationsPanel,
} from "@/components/map";
import { DXSpotList } from "@/components/dx/DXSpotList";
import { Card } from "@/components/ui/Card";
import { useMapStore, LAYER_PRESETS, type PresetName } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";

/**
 * Convert decimal degrees to Maidenhead grid locator
 */
function latLonToGrid(lat: number, lon: number): string {
  // Normalize longitude to 0-360 and latitude to 0-180
  const normalizedLon = lon + 180;
  const normalizedLat = lat + 90;

  // First pair (field): A-R
  const field1 = String.fromCharCode(65 + Math.floor(normalizedLon / 20));
  const field2 = String.fromCharCode(65 + Math.floor(normalizedLat / 10));

  // Second pair (square): 0-9
  const square1 = Math.floor((normalizedLon % 20) / 2);
  const square2 = Math.floor(normalizedLat % 10);

  // Third pair (subsquare): a-x
  const subsquare1 = String.fromCharCode(
    97 + Math.floor((normalizedLon % 2) * 12),
  );
  const subsquare2 = String.fromCharCode(
    97 + Math.floor((normalizedLat % 1) * 24),
  );

  return `${field1}${field2}${square1}${square2}${subsquare1}${subsquare2}`;
}

// Preset display configuration
const PRESET_CONFIG: Record<
  PresetName,
  { label: string; description: string }
> = {
  "dx-hunter": { label: "DX Hunter", description: "Full visibility for DX" },
  contest: { label: "Contest", description: "Quick day/night reference" },
  vhf: { label: "VHF", description: "Terminator + Aurora for VHF ops" },
  emergency: { label: "Emergency", description: "All layers active" },
};

export function PropSphere() {
  const {
    viewMode,
    timeOffset,
    target,
    setTarget,
    layers,
    toggleLayer,
    activePreset,
    applyPreset,
    isFullscreen,
    setFullscreen,
  } = useMapStore();
  const { station } = useUserStore();
  const [isDXSpotListExpanded, setIsDXSpotListExpanded] = useState(false);

  // Calculate display time with offset
  const displayTime = useMemo(() => {
    return addHours(new Date(), timeOffset);
  }, [timeOffset]);

  // Handle location selection
  const handleLocationClick = useCallback(
    (lat: number, lon: number) => {
      const grid = latLonToGrid(lat, lon);
      setTarget({
        lat,
        lon,
        grid,
        name: grid,
      });
    },
    [setTarget],
  );

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-orbitron font-bold text-white">
              PropSphere
            </h1>
            <p className="text-sm text-gray-500">
              Interactive propagation map • Click to set target location
            </p>
          </div>
          <ViewModeToggle />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map View (2/3 width on large screens) */}
          <div className="lg:col-span-2">
            <Card className="p-0 overflow-hidden relative">
              {/* Expand button */}
              <button
                onClick={() => setFullscreen(true)}
                className="absolute top-3 right-3 z-10 p-2 bg-black/60 backdrop-blur-sm
                  border border-white/20 rounded-lg hover:bg-white/10 hover:border-white/30
                  transition-all text-gray-400 hover:text-white"
                aria-label="Enter fullscreen"
                title="Enter fullscreen mode"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              </button>
              <div className="h-[500px] md:h-[600px]">
                {viewMode === "globe" && (
                  <GlobeView
                    displayTime={displayTime}
                    onLocationClick={handleLocationClick}
                  />
                )}
                {viewMode === "flat" && (
                  <FlatMapView
                    displayTime={displayTime}
                    onLocationClick={handleLocationClick}
                  />
                )}
                {viewMode === "azimuthal" && (
                  <AzimuthalView
                    displayTime={displayTime}
                    onLocationClick={handleLocationClick}
                  />
                )}
              </div>
            </Card>

            {/* Layer toggles and legend below map */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-4">
              {/* MUF Legend (shown when MUF layer is active) */}
              {layers.muf && <MUFLegend className="w-full mb-2" />}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-2">
              {/* Manual layer toggles */}
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.terminator}
                    onChange={() => toggleLayer("terminator")}
                    className="w-4 h-4 rounded bg-white/10 border-white/20
                      text-plasma-orange focus:ring-plasma-orange"
                  />
                  <span className="text-sm text-gray-400">Terminator</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.greyline}
                    onChange={() => toggleLayer("greyline")}
                    className="w-4 h-4 rounded bg-white/10 border-white/20
                      text-caution-amber focus:ring-caution-amber"
                  />
                  <span className="text-sm text-gray-400">Greyline</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.aurora}
                    onChange={() => toggleLayer("aurora")}
                    className="w-4 h-4 rounded bg-white/10 border-white/20
                      text-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-400">Aurora</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.muf}
                    onChange={() => toggleLayer("muf")}
                    className="w-4 h-4 rounded bg-white/10 border-white/20
                      text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-400">MUF</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={layers.spots}
                    onChange={() => toggleLayer("spots")}
                    className="w-4 h-4 rounded bg-white/10 border-white/20
                      text-cyan-400 focus:ring-cyan-400"
                  />
                  <span className="text-sm text-gray-400">Live Spots</span>
                </label>
              </div>

              {/* Divider */}
              <div className="hidden sm:block w-px h-5 bg-white/10" />

              {/* Layer presets */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 mr-1">Presets:</span>
                {(Object.keys(LAYER_PRESETS) as PresetName[]).map((preset) => {
                  const isActive = activePreset === preset;
                  return (
                    <button
                      key={preset}
                      onClick={() => applyPreset(preset)}
                      title={PRESET_CONFIG[preset].description}
                      className={`
                        px-3 py-1 text-xs font-medium rounded-full
                        transition-all duration-200
                        ${
                          isActive
                            ? "bg-plasma-orange/20 text-plasma-orange border border-plasma-orange/50"
                            : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-300"
                        }
                      `}
                    >
                      {PRESET_CONFIG[preset].label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sidebar (1/3 width on large screens) */}
          <div className="space-y-6">
            {/* Station Info */}
            {station ? (
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-signal-green animate-pulse" />
                  <div>
                    <div className="text-white font-mono font-bold">
                      {station.callsign}
                    </div>
                    <div className="text-xs text-gray-500">
                      {station.grid} • {station.name || "Home"}
                    </div>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="p-4">
                <div className="text-center text-gray-500 text-sm">
                  <p>No station configured</p>
                  <p className="text-xs mt-1">
                    Set your QTH in settings (gear icon)
                  </p>
                </div>
              </Card>
            )}

            {/* Time Control */}
            <Card>
              <h3 className="text-sm font-medium text-white mb-4">
                Time Machine
              </h3>
              <TimeControl />
            </Card>

            {/* Path Analysis */}
            <PathAnalysis displayTime={displayTime} />

            {/* Recommendations Panel - only show when target is selected */}
            {target && station && (
              <RecommendationsPanel
                homeLat={station.lat}
                homeLon={station.lon}
                targetLat={target.lat}
                targetLon={target.lon}
                displayTime={displayTime}
              />
            )}

            {/* 24-Hour Propagation Forecast */}
            <PropagationForecast displayTime={displayTime} />

            {/* Quick Targets */}
            <QuickTargets />

            {/* DX Spot List - Collapsible */}
            <Card className="p-0 overflow-hidden">
              <button
                onClick={() => setIsDXSpotListExpanded(!isDXSpotListExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-sm font-medium text-white">
                    Live DX Spots
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${
                    isDXSpotListExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {isDXSpotListExpanded && (
                <div
                  className="border-t border-white/10"
                  style={{ maxHeight: "400px", overflowY: "auto" }}
                >
                  <DXSpotList
                    maxHeight="350px"
                    showFilters={true}
                    showHeader={false}
                    className="border-0 rounded-none"
                  />
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Info Footer */}
        <div className="text-center text-xs text-gray-600 pt-4">
          <p>
            Terminator shows day/night boundary • Greyline (±15°) indicates
            enhanced propagation zone
          </p>
          <p className="mt-1">
            Path analysis uses great circle calculations • Distance accuracy
            within 1%
          </p>
        </div>
      </main>

      {/* Fullscreen mode */}
      {isFullscreen && (
        <FullscreenPropSphere
          displayTime={displayTime}
          onLocationClick={handleLocationClick}
        />
      )}
    </div>
  );
}

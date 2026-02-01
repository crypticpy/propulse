/**
 * PropSphere Page
 *
 * Interactive map visualization for radio propagation analysis.
 * Features a framed layout with the map as the central focal point,
 * surrounded by information panels on all sides.
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
  PropagationForecastMini,
  BandConditionsPanel,
  MUFLegend,
  FullscreenPropSphere,
  RecommendationsPanel,
} from "@/components/map";
import { DXSpotList } from "@/components/dx/DXSpotList";
import { Card } from "@/components/ui/Card";
import { useMapStore, LAYER_PRESETS, type PresetName } from "@/stores/mapStore";
import { PRESET_CONFIG } from "@/constants/mapPresets";
import { useUserStore } from "@/stores/userStore";

/**
 * Convert decimal degrees to Maidenhead grid locator
 */
function latLonToGrid(lat: number, lon: number): string {
  const normalizedLon = lon + 180;
  const normalizedLat = lat + 90;

  const field1 = String.fromCharCode(65 + Math.floor(normalizedLon / 20));
  const field2 = String.fromCharCode(65 + Math.floor(normalizedLat / 10));
  const square1 = Math.floor((normalizedLon % 20) / 2);
  const square2 = Math.floor(normalizedLat % 10);
  const subsquare1 = String.fromCharCode(
    97 + Math.floor((normalizedLon % 2) * 12),
  );
  const subsquare2 = String.fromCharCode(
    97 + Math.floor((normalizedLat % 1) * 24),
  );

  return `${field1}${field2}${square1}${square2}${subsquare1}${subsquare2}`;
}

// Tab options for mobile/tablet bottom panel
type PanelTab = "path" | "bands" | "recs" | "spots";

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

  // Panel collapse states (desktop)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  // Active tab for mobile bottom panel
  const [activeTab, setActiveTab] = useState<PanelTab>("path");

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
    <div className="min-h-screen flex flex-col">
      {/* Main Content - Framed Layout */}
      <main className="flex-1 flex flex-col p-2 md:p-4 gap-2 md:gap-3 max-w-[1920px] mx-auto w-full">
        {/* Top Row: Time | Station | Forecast */}
        <div className="grid grid-cols-2 lg:grid-cols-[280px_1fr_1fr] xl:grid-cols-[280px_auto_1fr] gap-2 md:gap-3">
          {/* Time Machine */}
          <Card className="p-3 col-span-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-white">Time Machine</h3>
              <ViewModeToggle compact />
            </div>
            <TimeControl className="[&>*:first-child]:hidden [&>*:nth-child(2)]:hidden" />
          </Card>

          {/* Station Info */}
          <Card className="p-3 col-span-1">
            {station ? (
              <div className="h-full flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-signal-green animate-pulse flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-white font-mono font-bold text-sm truncate">
                    {station.callsign}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {station.grid} • {station.name || "Home"}
                  </div>
                </div>
                <button
                  onClick={() => setFullscreen(true)}
                  className="ml-auto p-1.5 bg-white/5 rounded hover:bg-white/10 transition-colors"
                  title="Fullscreen"
                >
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 text-xs">
                Set QTH in settings
              </div>
            )}
          </Card>

          {/* 24h Forecast Mini (hidden on mobile, shown on lg+) */}
          <div className="hidden lg:block col-span-1">
            <PropagationForecastMini
              displayTime={displayTime}
              className="h-full"
            />
          </div>
        </div>

        {/* Middle Row: Bands | Map | Path */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-2 md:gap-3 min-h-0">
          {/* Band Conditions Panel (left) - hidden on mobile */}
          <div
            className={`hidden lg:flex flex-col transition-all duration-300 ${
              leftPanelCollapsed ? "lg:w-10" : ""
            }`}
          >
            {leftPanelCollapsed ? (
              <Card className="h-full flex items-center justify-center">
                <button
                  onClick={() => setLeftPanelCollapsed(false)}
                  className="p-2 hover:bg-white/10 rounded transition-colors"
                  title="Expand band conditions"
                >
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </Card>
            ) : (
              <div className="relative h-full">
                <BandConditionsPanel
                  displayTime={displayTime}
                  className="h-full"
                />
                <button
                  onClick={() => setLeftPanelCollapsed(true)}
                  className="absolute top-2 right-2 p-1 bg-white/10 rounded hover:bg-white/20 transition-colors"
                  title="Collapse panel"
                >
                  <svg
                    className="w-3 h-3 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Map View (center) */}
          <Card className="p-0 overflow-hidden relative min-h-[300px] md:min-h-[400px]">
            {/* Layer toggles overlay (top-left of map) */}
            <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1">
              {(
                ["terminator", "greyline", "aurora", "muf", "spots"] as const
              ).map((layer) => (
                <button
                  key={layer}
                  onClick={() => toggleLayer(layer)}
                  className={`px-2 py-1 text-[10px] rounded-full border transition-all ${
                    layers[layer]
                      ? "bg-white/20 border-white/30 text-white"
                      : "bg-black/40 border-white/10 text-gray-400 hover:bg-black/60"
                  }`}
                >
                  {layer.charAt(0).toUpperCase() + layer.slice(1)}
                </button>
              ))}
            </div>

            {/* Preset buttons overlay (top-right of map) */}
            <div className="absolute top-2 right-2 z-10 flex gap-1">
              {(Object.keys(LAYER_PRESETS) as PresetName[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  title={PRESET_CONFIG[preset].description}
                  className={`px-2 py-1 text-[10px] rounded-full border transition-all ${
                    activePreset === preset
                      ? "bg-plasma-orange/30 border-plasma-orange/50 text-plasma-orange"
                      : "bg-black/40 border-white/10 text-gray-400 hover:bg-black/60"
                  }`}
                >
                  {PRESET_CONFIG[preset].label}
                </button>
              ))}
            </div>

            {/* MUF Legend (bottom of map when MUF layer active) */}
            {layers.muf && (
              <div className="absolute bottom-2 left-2 right-2 z-10">
                <MUFLegend className="bg-black/60 backdrop-blur-sm rounded-lg p-2" />
              </div>
            )}

            {/* Map View */}
            <div className="h-full">
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

          {/* Path Analysis Panel (right) - hidden on mobile */}
          <div
            className={`hidden lg:flex flex-col transition-all duration-300 ${
              rightPanelCollapsed ? "lg:w-10" : ""
            }`}
          >
            {rightPanelCollapsed ? (
              <Card className="h-full flex items-center justify-center">
                <button
                  onClick={() => setRightPanelCollapsed(false)}
                  className="p-2 hover:bg-white/10 rounded transition-colors"
                  title="Expand path analysis"
                >
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
              </Card>
            ) : (
              <div className="relative h-full">
                <PathAnalysis displayTime={displayTime} className="h-full" />
                <button
                  onClick={() => setRightPanelCollapsed(true)}
                  className="absolute top-2 right-2 p-1 bg-white/10 rounded hover:bg-white/20 transition-colors"
                  title="Collapse panel"
                >
                  <svg
                    className="w-3 h-3 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Row: Recommendations | DX Spots (desktop) */}
        <div className="hidden lg:grid grid-cols-[1fr_2fr] gap-2 md:gap-3 h-[200px]">
          {/* Recommendations */}
          {station && target ? (
            <RecommendationsPanel
              homeLat={station.lat}
              homeLon={station.lon}
              targetLat={target.lat}
              targetLon={target.lon}
              displayTime={displayTime}
              className="h-full overflow-y-auto"
            />
          ) : (
            <Card className="h-full flex items-center justify-center text-gray-500 text-sm">
              Select a target for recommendations
            </Card>
          )}

          {/* DX Spots */}
          <DXSpotList
            maxHeight="168px"
            showFilters={true}
            showHeader={true}
            className="h-full"
          />
        </div>

        {/* Mobile/Tablet Bottom Panel (shown on < lg) */}
        <div className="lg:hidden">
          {/* Tab Navigation */}
          <div className="flex border-b border-white/10 mb-2">
            {(
              [
                { id: "path", label: "Path" },
                { id: "bands", label: "Bands" },
                { id: "recs", label: "Recs" },
                { id: "spots", label: "Spots" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? "text-plasma-orange border-b-2 border-plasma-orange"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="h-[250px] overflow-hidden">
            {activeTab === "path" && (
              <PathAnalysis displayTime={displayTime} className="h-full" />
            )}
            {activeTab === "bands" && (
              <BandConditionsPanel
                displayTime={displayTime}
                className="h-full"
              />
            )}
            {activeTab === "recs" &&
              (station && target ? (
                <RecommendationsPanel
                  homeLat={station.lat}
                  homeLon={station.lon}
                  targetLat={target.lat}
                  targetLon={target.lon}
                  displayTime={displayTime}
                  className="h-full"
                />
              ) : (
                <Card className="h-full flex items-center justify-center text-gray-500 text-sm">
                  Select a target for recommendations
                </Card>
              ))}
            {activeTab === "spots" && (
              <DXSpotList
                maxHeight="218px"
                showFilters={true}
                showHeader={true}
                className="h-full"
              />
            )}
          </div>
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

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
  RecommendationsBadge,
  OptimalBandsPanel,
  WhatsOpenNow,
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
  const { station, preferences } = useUserStore();
  const uiMode = preferences.uiMode || "normal";

  // Derived state for mode checks
  const isBeginnerMode = uiMode === "beginner";

  // Panel collapse states (desktop)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  // Panel widths for resizing (in pixels)
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);

  // Active tab for mobile bottom panel
  const [activeTab, setActiveTab] = useState<PanelTab>("path");

  // DX Cluster drawer state
  const [dxClusterExpanded, setDxClusterExpanded] = useState(true);

  // Resize handle dragging
  const handleResizeLeft = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = leftPanelWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.max(200, Math.min(400, startWidth + delta));
        setLeftPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [leftPanelWidth],
  );

  const handleResizeRight = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = rightPanelWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.max(200, Math.min(400, startWidth + delta));
        setRightPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [rightPanelWidth],
  );

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
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Main Content - Framed Layout */}
      <main className="flex-1 flex flex-col p-2 md:p-4 gap-2 md:gap-3 max-w-[1920px] mx-auto w-full min-h-0">
        {/* Top Row: Time + View | Station | Forecast | Recommendations */}
        <div className="grid grid-cols-2 lg:grid-cols-[240px_auto_1fr] xl:grid-cols-[240px_auto_1fr_280px] gap-2 md:gap-3">
          {/* Time Machine + View Toggle */}
          <Card className="p-3 col-span-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-white">Time Machine</h3>
              <ViewModeToggle compact />
            </div>
            <TimeControl className="[&>*:first-child]:hidden [&>*:nth-child(2)]:hidden" />
          </Card>

          {/* Station Info + Pro View Button */}
          <Card className="p-3 col-span-1 min-w-[140px]">
            {station ? (
              <div className="h-full flex items-center gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-2 h-2 rounded-full bg-signal-green animate-pulse flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-white font-mono font-bold text-sm truncate">
                      {station.callsign}
                    </div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {station.grid}
                    </div>
                  </div>
                </div>
                {/* Pro View button */}
                <button
                  onClick={() => setFullscreen(true)}
                  className="flex items-center gap-1 px-2 py-1.5 bg-plasma-orange/20 border border-plasma-orange/50 rounded
                             text-plasma-orange hover:bg-plasma-orange/30 transition-colors flex-shrink-0"
                  title="Enter fullscreen Pro View"
                >
                  <svg
                    className="w-4 h-4"
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
                  <span className="text-[10px] font-bold uppercase tracking-wide">
                    Pro
                  </span>
                </button>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 text-xs">
                Set QTH in settings
              </div>
            )}
          </Card>

          {/* 24h Forecast (hidden on mobile, shown on lg+) */}
          <Card className="hidden lg:block col-span-1 p-3">
            <div className="text-[10px] text-gray-300 uppercase tracking-wide mb-1">
              24h Propagation Forecast
            </div>
            <PropagationForecastMini
              displayTime={displayTime}
              className="h-[calc(100%-16px)]"
            />
          </Card>

          {/* Recommendations Badge (xl+ only) */}
          {station && target && (
            <Card className="hidden xl:block col-span-1 p-3">
              <div className="text-[10px] text-gray-300 uppercase tracking-wide mb-1">
                Optimal Band Now
              </div>
              <RecommendationsBadge
                homeLat={station.lat}
                homeLon={station.lon}
                targetLat={target.lat}
                targetLon={target.lon}
                displayTime={displayTime}
                className="h-[calc(100%-16px)]"
              />
            </Card>
          )}
        </div>

        {/* Middle Row: Bands | Map | Path - fills available space */}
        <div className="flex-1 min-h-0 flex gap-0 lg:gap-0">
          {/* Band Conditions Panel (left) - hidden on mobile */}
          <div
            className={`hidden lg:flex flex-col flex-shrink-0 transition-all duration-200 ${
              leftPanelCollapsed ? "w-10" : ""
            }`}
            style={{ width: leftPanelCollapsed ? 40 : leftPanelWidth }}
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
              <div className="relative h-full overflow-hidden">
                {/* Show WhatsOpenNow in beginner mode, BandConditionsPanel otherwise */}
                {isBeginnerMode ? (
                  <WhatsOpenNow
                    displayTime={displayTime}
                    className="h-full overflow-y-auto"
                  />
                ) : (
                  <BandConditionsPanel
                    displayTime={displayTime}
                    className="h-full overflow-y-auto"
                  />
                )}
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

          {/* Left Resize Handle */}
          {!leftPanelCollapsed && (
            <div
              className="hidden lg:flex w-2 flex-shrink-0 cursor-col-resize items-center justify-center group hover:bg-plasma-orange/20 transition-colors"
              onMouseDown={handleResizeLeft}
              title="Drag to resize"
            >
              <div className="w-0.5 h-8 bg-white/20 group-hover:bg-plasma-orange rounded-full transition-colors" />
            </div>
          )}

          {/* Map View (center) - takes remaining space */}
          <Card className="flex-1 min-w-0 p-0 overflow-hidden relative min-h-[280px] flex flex-col">
            {/* View Mode Tabs - edge-to-edge row */}
            <div className="flex-shrink-0 flex border-b border-white/10">
              {(
                [
                  { value: "globe", label: "3D Globe" },
                  { value: "flat", label: "2D Map" },
                  { value: "azimuthal", label: "Azimuthal" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  onClick={() =>
                    useMapStore.getState().setViewMode(option.value)
                  }
                  className={`flex-1 py-2 text-xs font-medium transition-all border-b-2 ${
                    viewMode === option.value
                      ? "bg-plasma-orange/10 text-plasma-orange border-plasma-orange"
                      : "text-gray-400 hover:text-white hover:bg-white/5 border-transparent"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Layer controls bar - simplified in beginner mode */}
            <div className="flex-shrink-0 flex items-center justify-between gap-2 px-2 py-1.5 bg-nebula-blue/80 border-b border-white/10">
              {/* Layer toggles */}
              <div className="flex flex-wrap gap-1">
                {(isBeginnerMode
                  ? (["terminator", "greyline", "spots", "labels"] as const)
                  : ([
                      "terminator",
                      "greyline",
                      "aurora",
                      "muf",
                      "sporadicE",
                      "spots",
                      "nightLights",
                      "labels",
                    ] as const)
                ).map((layer) => {
                  // Display names for layers
                  const displayNames: Record<string, string> = {
                    terminator: "Day/Night",
                    greyline: "Greyline",
                    aurora: "Aurora",
                    muf: "MUF",
                    sporadicE: "Es",
                    spots: "Spots",
                    nightLights: "Lights",
                    labels: "Labels",
                  };
                  return (
                    <button
                      key={layer}
                      onClick={() => toggleLayer(layer)}
                      className={`px-2 py-0.5 text-[10px] rounded transition-all ${
                        layers[layer]
                          ? "bg-white/20 text-white"
                          : "text-gray-400 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      {displayNames[layer] || layer}
                    </button>
                  );
                })}
              </div>

              {/* Preset buttons - hidden in beginner mode */}
              {!isBeginnerMode && (
                <div className="flex gap-1">
                  {(Object.keys(LAYER_PRESETS) as PresetName[]).map(
                    (preset) => (
                      <button
                        key={preset}
                        onClick={() => applyPreset(preset)}
                        title={PRESET_CONFIG[preset].description}
                        className={`px-2 py-0.5 text-[10px] rounded transition-all ${
                          activePreset === preset
                            ? "bg-plasma-orange/30 text-plasma-orange"
                            : "text-gray-400 hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {PRESET_CONFIG[preset].label}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>

            {/* MUF Legend (bottom of map when MUF layer active) - hidden in beginner mode */}
            {layers.muf && !isBeginnerMode && (
              <div className="absolute bottom-2 left-2 right-2 z-10">
                <MUFLegend className="bg-black/60 backdrop-blur-sm rounded-lg p-2" />
              </div>
            )}

            {/* Map View - relative container for floating panels */}
            <div className="flex-1 min-h-0 relative">
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

              {/* Optimal Bands Pop-out Panel (inside map container, below control bar) */}
              {viewMode === "globe" && (
                <OptimalBandsPanel displayTime={displayTime} />
              )}
            </div>
          </Card>

          {/* Right Resize Handle */}
          {!rightPanelCollapsed && (
            <div
              className="hidden lg:flex w-2 flex-shrink-0 cursor-col-resize items-center justify-center group hover:bg-plasma-orange/20 transition-colors"
              onMouseDown={handleResizeRight}
              title="Drag to resize"
            >
              <div className="w-0.5 h-8 bg-white/20 group-hover:bg-plasma-orange rounded-full transition-colors" />
            </div>
          )}

          {/* Path Analysis Panel (right) - hidden on mobile */}
          <div
            className={`hidden lg:flex flex-col flex-shrink-0 transition-all duration-200 ${
              rightPanelCollapsed ? "w-10" : ""
            }`}
            style={{ width: rightPanelCollapsed ? 40 : rightPanelWidth }}
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
              <div className="relative h-full overflow-hidden">
                <PathAnalysis
                  displayTime={displayTime}
                  className="h-full overflow-y-auto"
                />
                <button
                  onClick={() => setRightPanelCollapsed(true)}
                  className="absolute top-2 right-2 p-1 bg-white/10 rounded hover:bg-white/20 transition-colors z-10"
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

        {/* Bottom Row: DX Spots (full width on xl, with Recommendations on lg) */}
        <div className="hidden lg:grid xl:hidden grid-cols-[1fr_2fr] gap-2 md:gap-3 flex-shrink-0 h-[200px]">
          {/* Recommendations (lg only - on xl it's in top row) */}
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

        {/* Bottom Row: DX Spots only (xl screens - Recommendations in top row) */}
        <div className="hidden xl:block flex-shrink-0">
          <Card className="overflow-hidden">
            {/* Drawer Toggle Handle */}
            <button
              onClick={() => setDxClusterExpanded(!dxClusterExpanded)}
              className="w-full h-10 flex items-center justify-between px-4 bg-nebula-blue/50 hover:bg-nebula-blue/80 border-b border-white/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  DX Cluster
                </span>
                <span className="text-xs text-gray-400">
                  Live spots from PSKReporter, RBN, and DX clusters
                </span>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
                  dxClusterExpanded ? "" : "rotate-180"
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
            {/* Collapsible Content */}
            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                dxClusterExpanded ? "h-[280px]" : "h-0"
              }`}
            >
              <DXSpotList
                maxHeight="248px"
                showFilters={true}
                showHeader={false}
                className="border-t-0 rounded-t-none h-full"
              />
            </div>
          </Card>
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
            {activeTab === "bands" &&
              (isBeginnerMode ? (
                <WhatsOpenNow displayTime={displayTime} className="h-full" />
              ) : (
                <BandConditionsPanel
                  displayTime={displayTime}
                  className="h-full"
                />
              ))}
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

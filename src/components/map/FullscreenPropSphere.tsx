/**
 * FullscreenPropSphere Component
 *
 * Immersive full-screen view for PropSphere map visualization.
 * Uses framed layout with transparent glass panels overlaying the map.
 * All content visible without scrolling.
 */

import { useEffect, useState, useCallback } from "react";
import { useMapStore, LAYER_PRESETS, type PresetName } from "@/stores/mapStore";
import { PRESET_CONFIG } from "@/constants/mapPresets";
import { useUserStore } from "@/stores/userStore";
import {
  GlobeView,
  FlatMapView,
  AzimuthalView,
  TimeControl,
  PathAnalysis,
  BandConditionsPanel,
  RecommendationsPanel,
} from "@/components/map";
import { DXSpotList } from "@/components/dx/DXSpotList";
import { useLiveSpots } from "@/hooks/useLiveSpots";

interface FullscreenPropSphereProps {
  displayTime: Date;
  onLocationClick: (lat: number, lon: number) => void;
}

export function FullscreenPropSphere({
  displayTime,
  onLocationClick,
}: FullscreenPropSphereProps) {
  const {
    viewMode,
    setViewMode,
    layers,
    toggleLayer,
    activePreset,
    applyPreset,
    setFullscreen,
    target,
  } = useMapStore();
  const { station } = useUserStore();

  // Panel visibility states
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [isAnimating, setIsAnimating] = useState(true);

  // Get live spots for the count indicator
  const { spots } = useLiveSpots({
    grid: station?.grid,
    enabled: true,
  });

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setFullscreen]);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsAnimating(false), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleExit = useCallback(() => {
    setFullscreen(false);
  }, [setFullscreen]);

  // Glass panel base classes
  const glassPanel = "bg-black/60 backdrop-blur-md border border-white/20";

  return (
    <div
      className={`fixed inset-0 z-[200] bg-black transition-opacity duration-300
        ${isAnimating ? "opacity-0" : "opacity-100"}`}
    >
      {/* Full-size map view (background) */}
      <div className="absolute inset-0">
        {viewMode === "globe" && (
          <GlobeView
            displayTime={displayTime}
            onLocationClick={onLocationClick}
          />
        )}
        {viewMode === "flat" && (
          <FlatMapView
            displayTime={displayTime}
            onLocationClick={onLocationClick}
          />
        )}
        {viewMode === "azimuthal" && (
          <AzimuthalView
            displayTime={displayTime}
            onLocationClick={onLocationClick}
          />
        )}
      </div>

      {/* Overlay Grid Layout */}
      <div className="absolute inset-0 p-4 pointer-events-none">
        <div className="h-full grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-3">
          {/* Top Row */}
          <div className="col-span-3 flex items-start gap-3">
            {/* Station info + Live spots */}
            {station && (
              <div
                className={`${glassPanel} rounded-lg p-3 pointer-events-auto`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-signal-green animate-pulse" />
                  <div>
                    <div className="text-white font-mono font-bold text-sm">
                      {station.callsign}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {station.grid}
                    </div>
                  </div>
                  <div className="ml-3 pl-3 border-l border-white/10 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-xs text-cyan-400">
                      {spots.length} spots
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* View mode + Time control */}
            <div className={`${glassPanel} rounded-lg p-3 pointer-events-auto`}>
              <div className="flex items-center gap-4">
                {/* View mode buttons */}
                <div className="flex gap-1">
                  {(["globe", "flat", "azimuthal"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-all capitalize ${
                        viewMode === mode
                          ? "bg-plasma-orange text-white"
                          : "text-gray-400 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      {mode === "azimuthal" ? "Azim" : mode}
                    </button>
                  ))}
                </div>

                {/* Time slider */}
                <div className="w-32">
                  <TimeControl className="[&>*:first-child]:hidden [&>*:nth-child(2)]:hidden [&>*:last-child]:hidden" />
                </div>
              </div>
            </div>

            {/* Layer toggles */}
            <div
              className={`${glassPanel} rounded-lg p-2 pointer-events-auto flex gap-1`}
            >
              {(
                ["terminator", "greyline", "aurora", "muf", "spots"] as const
              ).map((layer) => (
                <button
                  key={layer}
                  onClick={() => toggleLayer(layer)}
                  className={`px-2 py-1 text-[10px] rounded transition-all ${
                    layers[layer]
                      ? "bg-white/20 text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {layer.charAt(0).toUpperCase() + layer.slice(1)}
                </button>
              ))}
            </div>

            {/* Presets */}
            <div
              className={`${glassPanel} rounded-lg p-2 pointer-events-auto flex gap-1`}
            >
              {(Object.keys(LAYER_PRESETS) as PresetName[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  title={PRESET_CONFIG[preset].description}
                  className={`px-2 py-1 text-[10px] rounded transition-all ${
                    activePreset === preset
                      ? "bg-plasma-orange/30 text-plasma-orange"
                      : "text-gray-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {PRESET_CONFIG[preset].label}
                </button>
              ))}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Exit button */}
            <button
              onClick={handleExit}
              className={`${glassPanel} rounded-lg p-2 pointer-events-auto hover:bg-white/10 transition-colors text-gray-400 hover:text-white`}
              aria-label="Exit fullscreen"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Left Panel - Band Conditions */}
          <div className="row-span-1 flex flex-col">
            {showLeftPanel ? (
              <div
                className={`${glassPanel} rounded-lg pointer-events-auto w-64 h-full max-h-[400px] relative`}
              >
                <button
                  onClick={() => setShowLeftPanel(false)}
                  className="absolute top-2 right-2 z-10 p-1 rounded bg-white/10 hover:bg-white/20 transition-colors text-gray-400 hover:text-white"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <BandConditionsPanel
                  displayTime={displayTime}
                  compact
                  className="!bg-transparent !border-0 h-full"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowLeftPanel(true)}
                className={`${glassPanel} rounded-lg p-2 pointer-events-auto text-gray-400 hover:text-white transition-colors`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Center - Map (empty, map shows through) */}
          <div className="row-span-1" />

          {/* Right Panel - Path Analysis */}
          <div className="row-span-1 flex flex-col items-end">
            {showRightPanel ? (
              <div
                className={`${glassPanel} rounded-lg pointer-events-auto w-72 h-full max-h-[400px] relative`}
              >
                <button
                  onClick={() => setShowRightPanel(false)}
                  className="absolute top-2 right-2 z-10 p-1 rounded bg-white/10 hover:bg-white/20 transition-colors text-gray-400 hover:text-white"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
                <PathAnalysis
                  displayTime={displayTime}
                  className="!bg-transparent !border-0 h-full"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowRightPanel(true)}
                className={`${glassPanel} rounded-lg p-2 pointer-events-auto text-gray-400 hover:text-white transition-colors`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* Bottom Row */}
          <div className="col-span-3 flex items-end gap-3">
            {/* Recommendations Panel */}
            {station && target && (
              <div
                className={`${glassPanel} rounded-lg pointer-events-auto w-80 max-h-[180px] overflow-y-auto`}
              >
                <RecommendationsPanel
                  homeLat={station.lat}
                  homeLon={station.lon}
                  targetLat={target.lat}
                  targetLon={target.lon}
                  displayTime={displayTime}
                  className="!bg-transparent !border-0"
                />
              </div>
            )}

            {/* DX Spots Panel */}
            {showBottomPanel ? (
              <div
                className={`${glassPanel} rounded-lg pointer-events-auto flex-1 max-w-2xl h-[180px] relative`}
              >
                <button
                  onClick={() => setShowBottomPanel(false)}
                  className="absolute top-2 right-2 z-10 p-1 rounded bg-white/10 hover:bg-white/20 transition-colors text-gray-400 hover:text-white"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <DXSpotList
                  maxHeight="148px"
                  showFilters={true}
                  showHeader={true}
                  className="!bg-transparent !border-0 h-full"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowBottomPanel(true)}
                className={`${glassPanel} rounded-lg px-3 py-2 pointer-events-auto text-gray-400 hover:text-white transition-colors flex items-center gap-2`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 15l7-7 7 7"
                  />
                </svg>
                <span className="text-xs">Show DX Spots</span>
              </button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Keyboard hint */}
            <div className="text-xs text-gray-600 pointer-events-auto">
              Press{" "}
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-gray-400">
                ESC
              </kbd>{" "}
              to exit
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FullscreenPropSphere;

/**
 * FullscreenPropSphere Component
 *
 * Immersive full-screen view for PropSphere map visualization.
 * Includes all controls, PathAnalysis panel, DXSpotList panel,
 * and RecommendationsPanel overlay.
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

  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isSpotsPanelCollapsed, setIsSpotsPanelCollapsed] = useState(false);
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

  return (
    <div
      className={`fixed inset-0 z-[200] bg-black transition-opacity duration-300
        ${isAnimating ? "opacity-0" : "opacity-100"}`}
    >
      {/* Full-size map view */}
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

      {/* Top-right controls panel */}
      <div className="absolute top-4 right-4 flex flex-col gap-3 max-w-xs sm:max-w-sm">
        {/* Exit button */}
        <button
          onClick={handleExit}
          className="self-end p-2 bg-black/60 backdrop-blur-md border border-white/20
            rounded-lg hover:bg-white/10 hover:border-white/30 transition-all
            text-gray-400 hover:text-white"
          aria-label="Exit fullscreen"
        >
          <svg
            className="w-6 h-6"
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

        {/* View mode toggle */}
        <div className="bg-black/60 backdrop-blur-md border border-white/20 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">View Mode</div>
          <div className="flex gap-1">
            {(["globe", "flat", "azimuthal"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`
                  px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize
                  ${
                    viewMode === mode
                      ? "bg-plasma-orange text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/10"
                  }
                `}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Time control */}
        <div className="bg-black/60 backdrop-blur-md border border-white/20 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Time Machine</div>
          <TimeControl />
        </div>

        {/* Layer toggles */}
        <div className="bg-black/60 backdrop-blur-md border border-white/20 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Layers</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.terminator}
                onChange={() => toggleLayer("terminator")}
                className="w-4 h-4 rounded bg-white/10 border-white/20
                  text-plasma-orange focus:ring-plasma-orange"
              />
              <span className="text-sm text-gray-300">Terminator</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.greyline}
                onChange={() => toggleLayer("greyline")}
                className="w-4 h-4 rounded bg-white/10 border-white/20
                  text-caution-amber focus:ring-caution-amber"
              />
              <span className="text-sm text-gray-300">Greyline</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.aurora}
                onChange={() => toggleLayer("aurora")}
                className="w-4 h-4 rounded bg-white/10 border-white/20
                  text-purple-500 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-300">Aurora</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.muf}
                onChange={() => toggleLayer("muf")}
                className="w-4 h-4 rounded bg-white/10 border-white/20
                  text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300">MUF</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={layers.spots}
                onChange={() => toggleLayer("spots")}
                className="w-4 h-4 rounded bg-white/10 border-white/20
                  text-cyan-400 focus:ring-cyan-400"
              />
              <span className="text-sm text-gray-300">Live Spots</span>
            </label>
          </div>

          {/* Presets */}
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="text-xs text-gray-500 mb-2">Presets</div>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(LAYER_PRESETS) as PresetName[]).map((preset) => {
                const isActive = activePreset === preset;
                return (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    title={PRESET_CONFIG[preset].description}
                    className={`
                      px-2 py-1 text-xs font-medium rounded-full transition-all
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
      </div>

      {/* Station info (top-left) with spot count */}
      {station && (
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-white/20 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
            <div>
              <div className="text-white font-mono font-bold text-sm">
                {station.callsign}
              </div>
              <div className="text-xs text-gray-500">{station.grid}</div>
            </div>
          </div>
          {/* Live spot count indicator */}
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs text-cyan-400 font-medium">
              {spots.length} live spot{spots.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}

      {/* Collapsible DXSpotList panel (left side) */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 left-4 transition-all duration-300
          hidden lg:flex ${isSpotsPanelCollapsed ? "-translate-x-[calc(100%-40px)]" : "translate-x-0"}`}
        style={{ marginTop: "60px" }}
      >
        <div className="flex items-stretch">
          {/* DXSpotList content */}
          <div
            className="w-96 max-h-[500px] overflow-hidden bg-black/60 backdrop-blur-md
            border border-white/20 rounded-l-lg"
          >
            <DXSpotList
              maxHeight="460px"
              showFilters={true}
              showHeader={true}
              className="!bg-transparent !border-0"
            />
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setIsSpotsPanelCollapsed(!isSpotsPanelCollapsed)}
            className="bg-black/60 backdrop-blur-md border border-l-0 border-white/20
              rounded-r-lg px-1 py-4 hover:bg-white/10 transition-colors
              text-gray-400 hover:text-white"
            aria-label={
              isSpotsPanelCollapsed
                ? "Expand spots panel"
                : "Collapse spots panel"
            }
          >
            <svg
              className={`w-4 h-4 transition-transform ${isSpotsPanelCollapsed ? "" : "rotate-180"}`}
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
        </div>
      </div>

      {/* Collapsible PathAnalysis panel (right side) */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 right-4 transition-all duration-300
          hidden lg:flex ${isPanelCollapsed ? "translate-x-[calc(100%-40px)]" : "translate-x-0"}`}
        style={{ marginTop: "180px" }}
      >
        <div className="flex items-stretch">
          {/* Collapse toggle */}
          <button
            onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
            className="bg-black/60 backdrop-blur-md border border-r-0 border-white/20
              rounded-l-lg px-1 py-4 hover:bg-white/10 transition-colors
              text-gray-400 hover:text-white"
            aria-label={isPanelCollapsed ? "Expand panel" : "Collapse panel"}
          >
            <svg
              className={`w-4 h-4 transition-transform ${isPanelCollapsed ? "rotate-180" : ""}`}
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

          {/* PathAnalysis content */}
          <div
            className="w-80 max-h-[400px] overflow-y-auto bg-black/60 backdrop-blur-md
            border border-white/20 rounded-r-lg"
          >
            <PathAnalysis
              displayTime={displayTime}
              className="!bg-transparent !border-0"
            />
          </div>
        </div>
      </div>

      {/* RecommendationsPanel (bottom-left overlay) - shown when target is selected */}
      {target && station && (
        <div className="absolute bottom-16 left-4 max-w-xs overflow-hidden">
          <div className="bg-black/60 backdrop-blur-md border border-white/20 rounded-lg">
            <RecommendationsPanel
              homeLat={station.lat}
              homeLon={station.lon}
              targetLat={target.lat}
              targetLon={target.lon}
              displayTime={displayTime}
              className="!bg-transparent !border-0"
            />
          </div>
        </div>
      )}

      {/* Keyboard hint (bottom-left) */}
      <div className="absolute bottom-4 left-4 text-xs text-gray-600">
        Press{" "}
        <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-gray-400">
          ESC
        </kbd>{" "}
        to exit fullscreen
      </div>
    </div>
  );
}

export default FullscreenPropSphere;

/**
 * FullscreenPropSphere Component
 *
 * Immersive full-screen view for PropSphere map visualization.
 * Panels are wrapped in FloatingPanel for free drag and resize.
 * Top bar stays fixed; map renders behind everything.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useMapStore, LAYER_PRESETS, type PresetName } from "@/stores/mapStore";
import { PRESET_CONFIG } from "@/constants/mapPresets";
import { useUserStore } from "@/stores/userStore";
import { useWatchStore } from "@/stores/watchStore";
import {
  GlobeView,
  FlatMapView,
  AzimuthalView,
  TimeControl,
  PathAnalysis,
  BandConditionsPanel,
  RecommendationsPanel,
  RegionPresetSelector,
  RegionPresetManager,
} from "@/components/map";
import { FloatingPanel } from "@/components/layout/FloatingPanel";
import { LayersPopover } from "@/components/map/LayersPopover";
import { WatchPopover } from "@/components/map/WatchPopover";
import { WatchStatusPill } from "@/components/map/WatchStatusPill";
import { ContestRatePanel } from "@/components/map/ContestRatePanel";
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
    activePreset,
    applyPreset,
    setFullscreen,
    target,
    proPanelLayout,
    updateProPanelLayout,
    toggleProPanelCollapse,
    resetProPanelLayout,
  } = useMapStore();
  const { station } = useUserStore();

  const autoRotate = useMapStore((s) => s.autoRotate);
  const watchCriteria = useWatchStore((s) => s.criteria);

  const [showPresetManager, setShowPresetManager] = useState(false);
  const [isAnimating, setIsAnimating] = useState(true);

  // ── Ambient mode ──────────────────────────────────────────
  const [ambientMode, setAmbientMode] = useState(false);
  const [showTopBar, setShowTopBar] = useState(true);
  const [showCursor, setShowCursor] = useState(true);
  const lastMouseMoveRef = useRef(Date.now());

  // Timer loop: check elapsed time since last mouse move
  useEffect(() => {
    if (!ambientMode) {
      setShowTopBar(true);
      setShowCursor(true);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - lastMouseMoveRef.current;
      setShowTopBar(elapsed < 3000);
      setShowCursor(elapsed < 5000);
    };

    // Run immediately on entering ambient mode
    lastMouseMoveRef.current = Date.now();
    tick();

    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [ambientMode]);

  // Mouse move handler for ambient mode
  const handleMouseMove = useCallback(() => {
    if (!ambientMode) return;
    lastMouseMoveRef.current = Date.now();
    setShowTopBar(true);
    setShowCursor(true);
  }, [ambientMode]);

  // Ticking UTC clock for ambient overlay
  const [utcString, setUtcString] = useState(() =>
    new Date().toLocaleTimeString("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  );

  const showAmbientOverlay =
    ambientMode && autoRotate && watchCriteria !== null;

  useEffect(() => {
    if (!showAmbientOverlay) return;
    const id = setInterval(() => {
      setUtcString(
        new Date().toLocaleTimeString("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [showAmbientOverlay]);

  // Z-index management for floating panels
  const [panelZOrder, setPanelZOrder] = useState<Record<string, number>>({});
  const zCounter = useRef(100);
  const bringToFront = useCallback((id: string) => {
    zCounter.current += 1;
    setPanelZOrder((prev) => ({ ...prev, [id]: zCounter.current }));
  }, []);

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

  // Glass panel base classes (for top bar items only)
  const glassPanel = "bg-black/60 backdrop-blur-md border border-white/20";

  return (
    <div
      onMouseMove={handleMouseMove}
      style={ambientMode && !showCursor ? { cursor: "none" } : undefined}
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

      {/* Watch status pill (floating center) — hidden in ambient mode */}
      <div
        className={`fixed top-16 left-1/2 -translate-x-1/2 z-[215] pointer-events-auto transition-opacity duration-300
          ${ambientMode && !showTopBar ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        <WatchStatusPill />
      </div>

      {/* Contest rate panel (floating right) — hidden in ambient mode */}
      <div
        className={`fixed top-16 right-4 z-[215] pointer-events-auto transition-opacity duration-300
          ${ambientMode && !showTopBar ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        <ContestRatePanel />
      </div>

      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <div
        className={`fixed top-0 left-0 right-0 z-[210] pointer-events-none transition-opacity duration-300
          ${ambientMode && !showTopBar ? "opacity-0" : "opacity-100"}`}
      >
        <div className="flex items-center gap-2 p-3">
          {/* Station info + Live spots */}
          {station && (
            <div className={`${glassPanel} rounded-lg p-3 pointer-events-auto`}>
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

          {/* Layers + Watch popovers */}
          <div
            className={`${glassPanel} rounded-lg p-2 pointer-events-auto flex items-center gap-2`}
          >
            <LayersPopover />
            <WatchPopover />
          </div>

          {/* Presets */}
          <div
            className={`${glassPanel} rounded-lg p-2 pointer-events-auto flex gap-1`}
          >
            {(Object.keys(LAYER_PRESETS) as PresetName[]).map((preset) => {
              const cfg = PRESET_CONFIG[preset];
              const isActive = activePreset === preset;
              const activeStyles: Record<PresetName, string> = {
                "dx-hunter":
                  "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/40",
                contest:
                  "bg-caution-amber/20 text-caution-amber border-caution-amber/40",
                vhf: "bg-cosmic-cyan/20 text-cosmic-cyan border-cosmic-cyan/40",
                emergency: "bg-alert-red/20 text-alert-red border-alert-red/40",
              };
              return (
                <button
                  key={preset}
                  onClick={() => applyPreset(preset)}
                  title={`${cfg.description}\n${cfg.layerSummary}`}
                  className={`px-2 py-1 text-[10px] rounded border transition-all flex items-center gap-1 ${
                    isActive
                      ? activeStyles[preset]
                      : "text-gray-400 hover:text-white hover:bg-white/10 border-transparent"
                  }`}
                >
                  <svg
                    className="w-3 h-3 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={cfg.iconPath} />
                  </svg>
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Region Presets */}
          <div className={`${glassPanel} rounded-lg p-2 pointer-events-auto`}>
            <RegionPresetSelector
              onOpenManager={() => setShowPresetManager(true)}
            />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Reset layout button */}
          <button
            onClick={resetProPanelLayout}
            className={`${glassPanel} rounded-lg px-2 py-1.5 pointer-events-auto hover:bg-white/10 transition-colors text-gray-400 hover:text-white text-[10px] flex items-center gap-1`}
            title="Reset panel positions"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Reset
          </button>

          {/* Ambient mode toggle */}
          <button
            onClick={() => setAmbientMode((v) => !v)}
            title={ambientMode ? "Show panels" : "Ambient mode"}
            className={`${glassPanel} rounded-lg p-2 pointer-events-auto transition-colors ${
              ambientMode
                ? "bg-white/15 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {ambientMode ? (
                <>
                  {/* Eye open — show panels */}
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              ) : (
                <>
                  {/* Eye with slash — ambient / hide panels */}
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              )}
            </svg>
          </button>

          {/* ESC hint */}
          <div className="text-[10px] text-gray-600 pointer-events-none select-none whitespace-nowrap">
            <kbd className="px-1 py-0.5 bg-white/10 rounded text-gray-500">
              ESC
            </kbd>
          </div>

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
      </div>

      {/* ── Floating Panels (hidden in ambient mode) ─────────── */}
      <div
        className={`transition-opacity duration-300 ${
          ambientMode ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        {/* Band Conditions — top-left */}
        <FloatingPanel
          id="band-conditions"
          title="Band Conditions"
          defaultPosition={{ x: 1, y: 8 }}
          defaultSize={{ width: 256, height: 400 }}
          minSize={{ width: 200, height: 150 }}
          maxSize={{ width: 400, height: 600 }}
          collapsed={proPanelLayout["band-conditions"]?.collapsed ?? false}
          onCollapse={() => toggleProPanelCollapse("band-conditions")}
          persistedLayout={
            proPanelLayout["band-conditions"]
              ? {
                  x: proPanelLayout["band-conditions"].x,
                  y: proPanelLayout["band-conditions"].y,
                  width: proPanelLayout["band-conditions"].width,
                  height: proPanelLayout["band-conditions"].height,
                }
              : null
          }
          onLayoutChange={(layout) =>
            updateProPanelLayout("band-conditions", layout)
          }
          zIndex={panelZOrder["band-conditions"] ?? 100}
          onFocus={() => bringToFront("band-conditions")}
        >
          <BandConditionsPanel
            displayTime={displayTime}
            compact
            className="!bg-transparent !border-0 h-full"
          />
        </FloatingPanel>

        {/* Path Analysis — top-right */}
        <FloatingPanel
          id="path-analysis"
          title="Path Analysis"
          defaultPosition={{ x: 80, y: 8 }}
          defaultSize={{ width: 288, height: 400 }}
          minSize={{ width: 220, height: 150 }}
          maxSize={{ width: 450, height: 600 }}
          collapsed={proPanelLayout["path-analysis"]?.collapsed ?? false}
          onCollapse={() => toggleProPanelCollapse("path-analysis")}
          persistedLayout={
            proPanelLayout["path-analysis"]
              ? {
                  x: proPanelLayout["path-analysis"].x,
                  y: proPanelLayout["path-analysis"].y,
                  width: proPanelLayout["path-analysis"].width,
                  height: proPanelLayout["path-analysis"].height,
                }
              : null
          }
          onLayoutChange={(layout) =>
            updateProPanelLayout("path-analysis", layout)
          }
          zIndex={panelZOrder["path-analysis"] ?? 100}
          onFocus={() => bringToFront("path-analysis")}
        >
          <PathAnalysis
            displayTime={displayTime}
            className="!bg-transparent !border-0 h-full"
          />
        </FloatingPanel>

        {/* DX Spots — bottom-center */}
        <FloatingPanel
          id="dx-spots"
          title="DX Spots"
          defaultPosition={{ x: 20, y: 78 }}
          defaultSize={{ width: 720, height: 200 }}
          minSize={{ width: 300, height: 120 }}
          maxSize={{ width: 1100, height: 500 }}
          collapsed={proPanelLayout["dx-spots"]?.collapsed ?? false}
          onCollapse={() => toggleProPanelCollapse("dx-spots")}
          persistedLayout={
            proPanelLayout["dx-spots"]
              ? {
                  x: proPanelLayout["dx-spots"].x,
                  y: proPanelLayout["dx-spots"].y,
                  width: proPanelLayout["dx-spots"].width,
                  height: proPanelLayout["dx-spots"].height,
                }
              : null
          }
          onLayoutChange={(layout) => updateProPanelLayout("dx-spots", layout)}
          zIndex={panelZOrder["dx-spots"] ?? 100}
          onFocus={() => bringToFront("dx-spots")}
        >
          <DXSpotList
            maxHeight="100%"
            showFilters={true}
            showHeader={true}
            className="!bg-transparent !border-0 h-full"
          />
        </FloatingPanel>

        {/* Recommendations — bottom-left (only when station + target exist) */}
        {station && target && (
          <FloatingPanel
            id="recommendations"
            title="Recommendations"
            defaultPosition={{ x: 1, y: 75 }}
            defaultSize={{ width: 320, height: 180 }}
            minSize={{ width: 240, height: 120 }}
            maxSize={{ width: 500, height: 400 }}
            collapsed={proPanelLayout["recommendations"]?.collapsed ?? false}
            onCollapse={() => toggleProPanelCollapse("recommendations")}
            persistedLayout={
              proPanelLayout["recommendations"]
                ? {
                    x: proPanelLayout["recommendations"].x,
                    y: proPanelLayout["recommendations"].y,
                    width: proPanelLayout["recommendations"].width,
                    height: proPanelLayout["recommendations"].height,
                  }
                : null
            }
            onLayoutChange={(layout) =>
              updateProPanelLayout("recommendations", layout)
            }
            zIndex={panelZOrder["recommendations"] ?? 100}
            onFocus={() => bringToFront("recommendations")}
          >
            <RecommendationsPanel
              homeLat={station.lat}
              homeLon={station.lon}
              targetLat={target.lat}
              targetLon={target.lon}
              displayTime={displayTime}
              className="!bg-transparent !border-0"
            />
          </FloatingPanel>
        )}
      </div>
      {/* end ambient-mode floating panels wrapper */}

      {/* ── Ambient overlay (UTC clock + watch pill) ─────────── */}
      {showAmbientOverlay && (
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[215]
            transition-opacity duration-300
            ${!showTopBar ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-5 py-3 flex items-center gap-4">
            <span className="font-mono text-lg text-white/90 tracking-wider tabular-nums">
              {utcString}
              <span className="text-[10px] text-white/40 ml-1.5">UTC</span>
            </span>
            <div className="w-px h-5 bg-white/15" />
            <WatchStatusPill />
          </div>
        </div>
      )}

      {/* Region Preset Manager Modal */}
      <RegionPresetManager
        visible={showPresetManager}
        onClose={() => setShowPresetManager(false)}
      />
    </div>
  );
}

export default FullscreenPropSphere;

/**
 * FullscreenPropSphere Component
 *
 * Immersive full-screen view for PropSphere map visualization.
 * Panels are wrapped in FloatingPanel for free drag and resize.
 * Top bar stays fixed; map renders behind everything.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useWatchStore } from "@/stores/watchStore";
import {
  GlobeView,
  FlatMapView,
  AzimuthalView,
  PathAnalysis,
  BandConditionsPanel,
  RecommendationsPanel,
  RegionPresetManager,
  SatellitePanel,
} from "@/components/map";
import { FloatingPanel } from "@/components/layout/FloatingPanel";
import { ProToolbarRibbon } from "@/components/map/ProToolbarRibbon";
import { WatchStatusPill } from "@/components/map/WatchStatusPill";
import { ContestRatePanel } from "@/components/map/ContestRatePanel";
import { ObservatoryOverlay } from "@/components/map/ObservatoryOverlay";
import { ObservatoryTiltSlider } from "@/components/map/ObservatoryTiltSlider";
import { ISSSkyTracker } from "@/components/map/ISSSkyTracker";
import { DXSpotList } from "@/components/dx/DXSpotList";
import { usePanelDocking, type PanelRect } from "@/hooks/usePanelDocking";

// ── Panel metadata for dock strip pills ────────────────────────
const PANEL_LABELS: Record<string, string> = {
  "band-conditions": "Bands",
  "path-analysis": "Paths",
  "dx-spots": "DX Spots",
  recommendations: "Recs",
  satellites: "Sats",
};

const PANEL_ICONS: Record<string, React.ReactNode> = {
  "band-conditions": (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13h2v8H3zM7 9h2v12H7zM11 5h2v16h-2zM15 9h2v12h-2zM19 13h2v8h-2z"
      />
    </svg>
  ),
  "path-analysis": (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
      />
    </svg>
  ),
  "dx-spots": (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"
      />
    </svg>
  ),
  recommendations: (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
      />
    </svg>
  ),
  satellites: (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m7.5 3.5 8 8m-2-6 4 4m-8 0 4 4M4.5 19.5l4-4m-2 2 2-2"
      />
    </svg>
  ),
};

interface FullscreenPropSphereProps {
  displayTime: Date;
  onLocationClick: (lat: number, lon: number) => void;
}

export function FullscreenPropSphere({
  displayTime,
  onLocationClick,
}: FullscreenPropSphereProps) {
  const viewMode = useMapStore((s) => s.viewMode);
  const setFullscreen = useMapStore((s) => s.setFullscreen);
  const target = useMapStore((s) => s.target);
  const proPanelLayout = useMapStore((s) => s.proPanelLayout);
  const updateProPanelLayout = useMapStore((s) => s.updateProPanelLayout);
  const toggleProPanelCollapse = useMapStore((s) => s.toggleProPanelCollapse);
  const resetProPanelLayout = useMapStore((s) => s.resetProPanelLayout);
  const autoRotate = useMapStore((s) => s.autoRotate);
  const observatoryMode = useMapStore((s) => s.observatoryMode);
  const exitObservatory = useMapStore((s) => s.exitObservatory);
  const layers = useMapStore((s) => s.layers);
  const { station } = useUserStore();
  const watchCriteria = useWatchStore((s) => s.criteria);

  const [showPresetManager, setShowPresetManager] = useState(false);
  const [isAnimating, setIsAnimating] = useState(true);

  // ── Ambient mode ──────────────────────────────────────────
  // Observatory forces ambient mode on; exiting observatory restores it
  const [ambientMode, setAmbientMode] = useState(false);

  // When observatory mode activates, force ambient mode
  useEffect(() => {
    if (observatoryMode) {
      setAmbientMode(true);
    }
  }, [observatoryMode]);
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

  // ── Panel docking ────────────────────────────────────────────
  const panelRects = useMemo<Record<string, PanelRect>>(() => {
    const rects: Record<string, PanelRect> = {};
    for (const [id, entry] of Object.entries(proPanelLayout)) {
      if (!entry.collapsed) {
        rects[id] = {
          x: entry.x,
          y: entry.y,
          width: entry.width,
          height: entry.height,
        };
      }
    }
    return rects;
  }, [proPanelLayout]);

  const {
    onDragMove: handleDockDragMove,
    onDragEnd: handleDockDragEnd,
    activeSnapTarget,
    onGroupWidthResize,
    getDockGroupWidth,
  } = usePanelDocking(panelRects);

  // List of collapsed panel IDs and pre-sorted edge groups
  const collapsedPanelIds = useMemo(() => {
    return Object.entries(proPanelLayout)
      .filter(([, entry]) => entry.collapsed)
      .map(([id]) => id);
  }, [proPanelLayout]);

  const edgeTabGroups = useMemo(() => {
    const byOrder = (a: string, b: string) =>
      (proPanelLayout[a]?.dockedOrder ?? 0) -
      (proPanelLayout[b]?.dockedOrder ?? 0);
    const left = collapsedPanelIds
      .filter((id) => (proPanelLayout[id]?.dockedEdge ?? "left") === "left")
      .sort(byOrder);
    const right = collapsedPanelIds
      .filter((id) => (proPanelLayout[id]?.dockedEdge ?? "left") === "right")
      .sort(byOrder);
    return { left, right };
  }, [collapsedPanelIds, proPanelLayout]);

  // Handle escape key — observatory mode exits observatory, else exits fullscreen
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (observatoryMode) {
          exitObservatory();
          setAmbientMode(false);
        } else {
          setFullscreen(false);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [observatoryMode, exitObservatory, setFullscreen]);

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

      {/* ISS Sky Tracker overlay (DOM, outside Canvas) */}
      {layers.issTracker && <ISSSkyTracker />}

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

      {/* ── Unified Toolbar Ribbon ──────────────────────────────── */}
      <ProToolbarRibbon
        ambientMode={ambientMode}
        showTopBar={showTopBar}
        observatoryMode={observatoryMode}
        onToggleAmbient={() => setAmbientMode((v) => !v)}
        onExit={handleExit}
        onResetLayout={resetProPanelLayout}
        onOpenPresetManager={() => setShowPresetManager(true)}
      />

      {/* ── Floating Panels (hidden in ambient mode) ─────────── */}
      <div
        className={`transition-opacity duration-300 ${
          ambientMode ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        {/* Band Conditions — top-left */}
        {!proPanelLayout["band-conditions"]?.collapsed && (
          <FloatingPanel
            id="band-conditions"
            title="Band Conditions"
            defaultPosition={{ x: 1, y: 8 }}
            defaultSize={{ width: 256, height: 400 }}
            minSize={{ width: 200, height: 150 }}
            maxSize={{ width: 400, height: 600 }}
            collapsed={false}
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
            onDragMove={handleDockDragMove}
            onDragEnd={handleDockDragEnd}
            snapTarget={activeSnapTarget}
            dockGroupWidth={getDockGroupWidth("band-conditions") ?? undefined}
            onResizeWidth={onGroupWidthResize}
            icon={
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13h2v8H3zM7 9h2v12H7zM11 5h2v16h-2zM15 9h2v12h-2zM19 13h2v8h-2z"
                />
              </svg>
            }
          >
            <BandConditionsPanel
              displayTime={displayTime}
              compact
              className="!bg-transparent !border-0 h-full"
            />
          </FloatingPanel>
        )}

        {/* Path Analysis — top-right */}
        {!proPanelLayout["path-analysis"]?.collapsed && (
          <FloatingPanel
            id="path-analysis"
            title="Path Analysis"
            defaultPosition={{ x: 80, y: 8 }}
            defaultSize={{ width: 288, height: 400 }}
            minSize={{ width: 220, height: 150 }}
            maxSize={{ width: 450, height: 600 }}
            collapsed={false}
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
            onDragMove={handleDockDragMove}
            onDragEnd={handleDockDragEnd}
            snapTarget={activeSnapTarget}
            dockGroupWidth={getDockGroupWidth("path-analysis") ?? undefined}
            onResizeWidth={onGroupWidthResize}
            icon={
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
            }
          >
            <PathAnalysis
              displayTime={displayTime}
              className="!bg-transparent !border-0 h-full"
            />
          </FloatingPanel>
        )}

        {/* DX Spots — bottom-center */}
        {!proPanelLayout["dx-spots"]?.collapsed && (
          <FloatingPanel
            id="dx-spots"
            title="DX Spots"
            defaultPosition={{ x: 20, y: 78 }}
            defaultSize={{ width: 720, height: 200 }}
            minSize={{ width: 300, height: 120 }}
            maxSize={{ width: 1100, height: 500 }}
            collapsed={false}
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
            onLayoutChange={(layout) =>
              updateProPanelLayout("dx-spots", layout)
            }
            zIndex={panelZOrder["dx-spots"] ?? 100}
            onFocus={() => bringToFront("dx-spots")}
            onDragMove={handleDockDragMove}
            onDragEnd={handleDockDragEnd}
            snapTarget={activeSnapTarget}
            dockGroupWidth={getDockGroupWidth("dx-spots") ?? undefined}
            onResizeWidth={onGroupWidthResize}
            icon={
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0"
                />
              </svg>
            }
          >
            <DXSpotList
              maxHeight="100%"
              showFilters={true}
              showHeader={true}
              className="!bg-transparent !border-0 h-full"
            />
          </FloatingPanel>
        )}

        {/* Recommendations — bottom-left (only when station + target exist) */}
        {station && target && !proPanelLayout["recommendations"]?.collapsed && (
          <FloatingPanel
            id="recommendations"
            title="Recommendations"
            defaultPosition={{ x: 1, y: 75 }}
            defaultSize={{ width: 320, height: 180 }}
            minSize={{ width: 240, height: 120 }}
            maxSize={{ width: 500, height: 400 }}
            collapsed={false}
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
            onDragMove={handleDockDragMove}
            onDragEnd={handleDockDragEnd}
            snapTarget={activeSnapTarget}
            dockGroupWidth={getDockGroupWidth("recommendations") ?? undefined}
            onResizeWidth={onGroupWidthResize}
            icon={
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
            }
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

        {/* Satellite tracking — right side (only when satellite layer active) */}
        {layers.satellites && !proPanelLayout["satellites"]?.collapsed && (
          <FloatingPanel
            id="satellites"
            title="Satellites"
            defaultPosition={{ x: 80, y: 50 }}
            defaultSize={{ width: 260, height: 360 }}
            minSize={{ width: 220, height: 200 }}
            maxSize={{ width: 400, height: 600 }}
            collapsed={false}
            onCollapse={() => toggleProPanelCollapse("satellites")}
            persistedLayout={
              proPanelLayout["satellites"]
                ? {
                    x: proPanelLayout["satellites"].x,
                    y: proPanelLayout["satellites"].y,
                    width: proPanelLayout["satellites"].width,
                    height: proPanelLayout["satellites"].height,
                  }
                : null
            }
            onLayoutChange={(layout) =>
              updateProPanelLayout("satellites", layout)
            }
            zIndex={panelZOrder["satellites"] ?? 100}
            onFocus={() => bringToFront("satellites")}
            onDragMove={handleDockDragMove}
            onDragEnd={handleDockDragEnd}
            snapTarget={activeSnapTarget}
            dockGroupWidth={getDockGroupWidth("satellites") ?? undefined}
            onResizeWidth={onGroupWidthResize}
            icon={PANEL_ICONS["satellites"]}
          >
            <SatellitePanel className="!bg-transparent !border-0 h-full" />
          </FloatingPanel>
        )}
      </div>
      {/* end ambient-mode floating panels wrapper */}

      {/* ── Edge-docked minimized panel tabs ─────────────────── */}
      {!ambientMode &&
        (["left", "right"] as const).map((edge) =>
          edgeTabGroups[edge].map((panelId, index) => {
            // 60px clears ribbon; 72px per tab
            const topOffset = 60 + index * 72;
            return (
              <button
                key={panelId}
                onClick={() => toggleProPanelCollapse(panelId)}
                aria-label={`Expand ${PANEL_LABELS[panelId] ?? panelId} panel`}
                className={`fixed z-[215] w-8 bg-black/80 backdrop-blur-md border border-white/25 shadow-lg shadow-black/40
                  hover:bg-white/15 hover:border-cyan-400/40 hover:shadow-cyan-400/20
                  focus-visible:ring-2 focus-visible:ring-cyan-400/50
                  transition-all duration-200 pointer-events-auto
                  flex flex-col items-center gap-2 py-3
                  animate-in slide-in-from-left
                  ${edge === "left" ? "rounded-r-lg border-l-0" : "rounded-l-lg border-r-0"}`}
                style={{ [edge]: 0, top: topOffset }}
                title={`Click to expand ${PANEL_LABELS[panelId] ?? panelId}`}
              >
                <span className="text-cyan-300/70 flex-shrink-0">
                  {PANEL_ICONS[panelId] ?? null}
                </span>
                <span
                  className="text-[9px] font-semibold text-white/70 whitespace-nowrap tracking-wide"
                  style={{
                    writingMode: "vertical-rl",
                    textOrientation: "mixed",
                  }}
                >
                  {PANEL_LABELS[panelId] ?? panelId}
                </span>
              </button>
            );
          }),
        )}

      {/* ── Observatory overlay (replaces ambient overlay when in observatory) */}
      {observatoryMode && ambientMode && !showTopBar && <ObservatoryOverlay />}

      {/* ── Observatory tilt slider — visible on mouse move in observatory mode */}
      {viewMode === "globe" && (
        <ObservatoryTiltSlider visible={observatoryMode ? showTopBar : true} />
      )}

      {/* ── Ambient overlay (UTC clock + watch pill) — non-observatory only */}
      {showAmbientOverlay && !observatoryMode && (
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

/**
 * PropSphere Page
 *
 * Interactive map visualization for radio propagation analysis.
 * Features a framed layout with the map as the central focal point,
 * surrounded by information panels on all sides.
 *
 * Performance optimized with lazy loading for heavy components.
 */

import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  lazy,
  Suspense,
} from "react";
import { addHours } from "date-fns";
import {
  GlobeView,
  FlatMapView,
  AzimuthalView,
  TimeControl,
  PathAnalysis,
  PropagationForecastMini,
  BandConditionsPanel,
  MUFLegend,
  RecommendationsPanel,
  OptimalBandsPanel,
  OperatorProfile,
  SolarSnapshot,
  LiteModeToggle,
  StyleSelector,
  MapStyleToggle,
  DXNewsTicker,
  SatellitePanel,
  LabelsPanel,
  KeyboardShortcutsOverlay,
  QuickGridInput,
  GridResearchPanel,
  AddPinDialog,
  RegionPresetSelector,
  RegionPresetManager,
} from "@/components/map";

// Lazy load heavy components that aren't always visible
const FullscreenPropSphere = lazy(() =>
  import("@/components/map/FullscreenPropSphere").then((m) => ({
    default: m.FullscreenPropSphere,
  })),
);
import { DXSpotList } from "@/components/dx";
import { OpsConsole } from "@/components/ops/OpsConsole";
import { WSJTXStatusPanel } from "@/components/dx/WSJTXStatusPanel";
import { BandScope } from "@/components/dx/BandScope";
import { useRigStore } from "@/stores/rigStore";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import { useWSJTXAutoLog } from "@/hooks/useWSJTXAutoLog";
import { Card } from "@/components/ui/Card";
import { HelpModal, HELP_CONTENT } from "@/components/ui/HelpModal";
import { ShareModal } from "@/components/ui/ShareModal";
import { OnboardingTour } from "@/components/ui/OnboardingTour";
import { useMapStore, LAYER_PRESETS, type PresetName } from "@/stores/mapStore";
import { useDXStore } from "@/stores/dxStore";
import { PRESET_CONFIG } from "@/constants/mapPresets";
import { useUserStore } from "@/stores/userStore";
import { useWatchStore } from "@/stores/watchStore";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import { useWatchAlerts } from "@/hooks/useWatchAlerts";
import { useShareParams } from "@/hooks/useShareParams";
import { useSpotCountTitle } from "@/hooks/useDocumentTitle";
import { useContestOverlayEngine } from "@/hooks/useContestOverlayEngine";
import { gridToLatLon } from "@/lib/utils/grid";
import type { ShareState } from "@/lib/utils/shareState";
import { PROPSPHERE_TOUR_STEPS } from "@/config/tourSteps";
import { useUndoStore } from "@/stores/undoStore";
import { useContestStore } from "@/stores/contestStore";
import { useContestUIStore } from "@/stores/contestUIStore";
import { useContestUIEphemeralStore } from "@/stores/contestUIEphemeralStore";
import { useAutoPanToSpots } from "@/hooks/useAutoPanToSpots";
import { ContestLiteHUD } from "@/components/contest/ContestLiteHUD";

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
    setTimeOffset,
    target,
    setTarget,
    layers,
    toggleLayer,
    activePreset,
    applyPreset,
    isFullscreen,
    setFullscreen,
    isLiteMode,
    isDXConsoleExpanded,
    setDXConsoleExpanded,
    pathMode,
  } = useMapStore();
  const station = useUserStore((state) => state.station);
  const spotCount = useDXStore((state) => state.spots.length);
  const contestSessionId = useContestStore((s) => s.activeSession?.id ?? null);
  const contestDockTab = useContestUIStore((s) =>
    contestSessionId
      ? (s.dockTabBySessionId[contestSessionId] ?? "contest")
      : "dx",
  );
  const contestFocusPreference = useContestUIStore(
    (s) => s.focusEntryOnSpotPrefill,
  );
  const requestContestEntryFocus = useContestUIEphemeralStore(
    (s) => s.requestEntryFocus,
  );

  // Auto-pan to new spots state
  const autoPanToSpots = useMapStore((s) => s.autoPanToSpots);
  const setAutoPanToSpots = useMapStore((s) => s.setAutoPanToSpots);

  // Auto-pan to new spots when enabled (works for all view modes)
  useAutoPanToSpots();

  // Contest-aware map overlays (needed mult markers, etc.)
  useContestOverlayEngine({ enabled: Boolean(contestSessionId) });

  // Mount WSJT-X auto-log listener
  useWSJTXAutoLog();

  // Rig CAT state
  const rigConnected = useRigStore((s) => s.connected);
  const rigCatEnabled = useRigStore((s) => s.catEnabled);
  const rigBand = useRigStore((s) => s.band);
  const getSMeterText = useRigStore((s) => s.getSMeterText);
  const catActive = rigCatEnabled && rigConnected;

  // WSJT-X connection state
  const wsjtxConnected = useWSJTXStore((s) => s.connected);

  // Sync DX Store band filter with rig band when CAT is active
  useEffect(() => {
    if (catActive && rigBand) {
      useDXStore.getState().setSyncedBand(rigBand);
    }
  }, [catActive, rigBand]);

  // Update browser tab title with spot count
  useSpotCountTitle(spotCount);

  // Panel expand states for lite mode floating pills
  // When user clicks a collapsed pill, it can expand to show full content
  const [leftPanelExpanded, setLeftPanelExpanded] = useState(false);
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);

  // Panel widths for resizing (in pixels)
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [rightPanelWidth, setRightPanelWidth] = useState(280);

  // Active tab for mobile bottom panel
  const [activeTab, setActiveTab] = useState<PanelTab>("path");

  // DX Cluster drawer state
  const [dxClusterExpanded, setDxClusterExpanded] = useState(true);
  const [showOptimalBandHelp, setShowOptimalBandHelp] = useState(false);

  // Keyboard shortcuts help overlay
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Quick Grid Input modal (Feature 1.5)
  const [showGridInput, setShowGridInput] = useState(false);

  // Grid Research Panel state (for keyboard shortcut)
  const [showGridResearch, setShowGridResearch] = useState(false);
  const [gridResearchGrid, setGridResearchGrid] = useState<string | null>(null);

  // Add Pin Dialog state (for keyboard shortcut)
  const [showAddPin, setShowAddPin] = useState(false);

  // Region Preset Manager modal state
  const [showPresetManager, setShowPresetManager] = useState(false);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);

  // Get watch store for toggle watch action
  const watchStore = useWatchStore();

  // Get undo store for tracking undoable actions
  const { pushAction } = useUndoStore();

  // Apply share params from URL (if any)
  useShareParams();

  // Initialize watch audio alerts (monitors watch matches and plays sounds)
  useWatchAlerts({ enabled: true });

  // Onboarding tour state and handlers
  const {
    isActive: isTourActive,
    currentStepData: tourStep,
    currentStep: tourStepIndex,
    totalSteps: tourTotalSteps,
    startTour,
    nextStep: tourNextStep,
    prevStep: tourPrevStep,
    skipTour,
    completeTour,
  } = useOnboardingTour({
    steps: PROPSPHERE_TOUR_STEPS,
    autoStart: true,
  });

  // Handler for grid research from DXSpotList context menu (Feature 2.6)
  const handleResearchGrid = useCallback((grid: string) => {
    setGridResearchGrid(grid);
    setShowGridResearch(true);
  }, []);

  // Keyboard shortcut action handler
  const handleShortcutAction = useCallback(
    (action: string) => {
      const mapStore = useMapStore.getState();

      switch (action) {
        // View modes
        case "viewGlobe":
          mapStore.setViewMode("globe");
          break;
        case "viewFlat":
          mapStore.setViewMode("flat");
          break;
        case "viewAzimuthal":
          mapStore.setViewMode("azimuthal");
          break;

        // Mode toggles
        case "toggleLiteMode":
          mapStore.toggleLiteMode();
          break;

        // Help
        case "showHelp":
          setShowShortcutsHelp(true);
          break;

        // Clear and close
        case "clearAndClose": {
          // Close any open panels/overlays
          setShowShortcutsHelp(false);
          setShowOptimalBandHelp(false);
          setShowGridInput(false);
          // Record target clear for undo if there was a target
          const currentTarget = mapStore.target;
          if (currentTarget) {
            pushAction({
              type: "CLEAR_TARGET",
              target: currentTarget,
              description: `Cleared target "${currentTarget.name || currentTarget.grid || "location"}"`,
            });
          }
          // Clear target
          mapStore.setTarget(null);
          // Close flyout if open
          mapStore.setFlyoutPosition(null);
          break;
        }

        // Time machine toggle (reset to live)
        case "toggleTimeMachine":
          if (timeOffset !== 0) {
            setTimeOffset(0);
          }
          break;

        // Grid input (for future implementation)
        case "openGridInput":
          setShowGridInput(true);
          break;

        // Target-based actions - use current target or hovered tooltip
        case "setHoveredAsTarget": {
          // Use tooltip position if available, otherwise do nothing
          const tooltip = mapStore.tooltipPosition;
          if (tooltip?.grid) {
            const coords = gridToLatLon(tooltip.grid);
            if (coords) {
              setTarget({
                lat: coords.lat,
                lon: coords.lon,
                grid: tooltip.grid,
                name: tooltip.grid,
              });
            }
          }
          break;
        }
        case "toggleWatch": {
          // Toggle watch on current target grid
          if (target?.grid) {
            const existingWatch = watchStore.watches.find(
              (w) => w.type === "grid" && w.pattern === target.grid,
            );
            if (existingWatch) {
              watchStore.removeWatch(existingWatch.id);
            } else {
              watchStore.addWatch("grid", target.grid, `Grid ${target.grid}`);
            }
          }
          break;
        }
        case "addPin": {
          // Open add pin dialog for current target
          if (target) {
            setShowAddPin(true);
          }
          break;
        }
        case "openGridResearch": {
          // Open grid research panel for current target
          if (target?.grid) {
            setGridResearchGrid(target.grid);
            setShowGridResearch(true);
          }
          break;
        }
        case "togglePathMode":
          mapStore.togglePathMode();
          break;

        // Band Sync Mode (Feature 2.3)
        case "cycleSyncedBand":
          useDXStore.getState().cycleSyncedBand();
          break;

        // Onboarding tour
        case "startTour":
          startTour();
          break;

        default:
          // Unknown action - do nothing
          break;
      }
    },
    [
      timeOffset,
      setTimeOffset,
      target,
      setTarget,
      watchStore,
      startTour,
      pushAction,
    ],
  );

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    onAction: handleShortcutAction,
    enabled: !showShortcutsHelp && !showOptimalBandHelp && !isFullscreen,
  });

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

  // Create share state for ShareModal
  const shareState = useMemo(
    (): ShareState => ({
      viewMode,
      target,
      timeOffset,
      layers,
      pathMode,
    }),
    [viewMode, target, timeOffset, layers, pathMode],
  );

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

      if (
        contestSessionId &&
        contestDockTab === "contest" &&
        contestFocusPreference
      ) {
        requestContestEntryFocus();
      }
    },
    [
      contestDockTab,
      contestFocusPreference,
      contestSessionId,
      requestContestEntryFocus,
      setTarget,
    ],
  );

  return (
    <div className="h-[calc(100dvh-4rem)] flex flex-col overflow-hidden">
      {isLiteMode && <ContestLiteHUD />}

      {/* Main Content - Framed Layout */}
      <main className="flex-1 flex flex-col p-2 md:p-4 gap-2 md:gap-3 max-w-[1920px] mx-auto w-full min-h-0">
        {/* Top Row: Lite Mode is EMPTY (controls move to map overlay), Default mode shows full cards */}
        {/* When DX Console is expanded, top row slides up and out of view */}
        {isLiteMode ? (
          // Lite Mode: No top row - everything is overlaid on the map
          // This div is intentionally minimal to maximize map space
          <div className="hidden lg:block h-0" />
        ) : (
          // Default Mode Top Row - full cards (animates out when DX Console expanded)
          <div
            className={`grid grid-cols-2 lg:grid-cols-[200px_220px_1fr] xl:grid-cols-[200px_220px_minmax(300px,1fr)_280px] gap-2 md:gap-3 transition-all duration-300 ease-in-out ${
              isDXConsoleExpanded
                ? "max-h-0 opacity-0 overflow-hidden mb-0"
                : "max-h-[500px] opacity-100"
            }`}
          >
            {/* Pro View Entry + Time Machine */}
            <div className="col-span-1 flex flex-col gap-2">
              {/* View Mode Toggle Row */}
              <div className="hidden lg:flex gap-2">
                <LiteModeToggle className="flex-1" />
                <button
                  onClick={() => setShowShareModal(true)}
                  className="p-2 rounded-lg bg-white/[0.03] border border-white/10
                             hover:border-cosmic-cyan/50 hover:bg-cosmic-cyan/5
                             transition-all duration-200 group"
                  title="Share this view"
                >
                  <svg
                    className="w-4 h-4 text-cosmic-cyan"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                </button>
              </div>

              {/* Pro View Entry Point - more compact */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setFullscreen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFullscreen(true);
                  }
                }}
                className="p-2.5 rounded-xl bg-white/[0.03] backdrop-blur-md border border-plasma-orange/30
                           hover:border-plasma-orange/60 hover:bg-plasma-orange/5
                           cursor-pointer transition-all duration-200 group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white group-hover:text-plasma-orange transition-colors truncate">
                      Pro View
                    </div>
                    <div className="text-[9px] text-gray-400 truncate">
                      Full-screen experience
                    </div>
                  </div>
                  <div className="p-1.5 rounded-lg bg-plasma-orange/10 text-plasma-orange group-hover:bg-plasma-orange/20 transition-colors flex-shrink-0">
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
                  </div>
                </div>
              </div>

              {/* Time Machine */}
              <Card className="p-2 flex-1 !rounded-lg" data-tour="time-control">
                <TimeControl className="h-full" />
              </Card>
            </div>

            {/* Operator Profile - fixed width */}
            <Card
              className="p-2 col-span-1 flex flex-col !rounded-lg"
              data-tour="operator-profile"
            >
              <OperatorProfile className="h-full" />
              {/* S-meter reading when rig is connected via CAT */}
              {catActive && (
                <div className="flex items-center gap-1.5 mt-1.5 px-1.5 py-1 rounded bg-white/5 border border-white/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-signal-green" />
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                    S-Meter
                  </span>
                  <span className="text-xs font-mono font-medium text-white ml-auto">
                    {getSMeterText()}
                  </span>
                </div>
              )}
            </Card>

            {/* 24h Forecast (hidden on mobile, shown on lg+) */}
            <Card className="hidden lg:flex lg:flex-col col-span-1 p-2 !rounded-lg">
              <div className="text-xs text-gray-300 uppercase tracking-wide mb-0.5 flex-shrink-0 font-medium">
                24h Propagation Forecast
                <span className="text-gray-500 normal-case ml-1">
                  (hover for details)
                </span>
              </div>
              <div className="flex-1 min-h-0">
                <PropagationForecastMini
                  displayTime={displayTime}
                  className="h-full"
                />
              </div>
            </Card>

            {/* Solar Snapshot (xl+ only) */}
            <Card className="hidden xl:flex xl:flex-col col-span-1 p-2 !rounded-lg">
              {station && target ? (
                <SolarSnapshot
                  homeLat={station.lat}
                  homeLon={station.lon}
                  targetLat={target.lat}
                  targetLon={target.lon}
                  displayTime={displayTime}
                  className="h-full"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 text-xs">
                  {station
                    ? "Select a target on the map"
                    : "Set QTH in settings"}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Middle Row: Bands | Map | Path - fills available space */}
        <div className="flex-1 min-h-0 flex gap-0 lg:gap-0">
          {/* Band Conditions Panel (left) - hidden on mobile, HIDDEN in lite mode */}
          {!isLiteMode && (
            <>
              <div
                className="hidden lg:flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out"
                style={{ width: leftPanelWidth }}
                data-tour="band-conditions-panel"
              >
                <BandConditionsPanel
                  displayTime={displayTime}
                  className="h-full overflow-y-auto"
                />
              </div>

              {/* Left Resize Handle */}
              <div
                className="hidden lg:flex w-2 flex-shrink-0 cursor-col-resize items-center justify-center group hover:bg-plasma-orange/20 transition-colors"
                onMouseDown={handleResizeLeft}
                title="Drag to resize"
              >
                <div className="w-0.5 h-8 bg-white/20 group-hover:bg-plasma-orange rounded-full transition-colors" />
              </div>
            </>
          )}

          {/* Map View (center) - takes remaining space */}
          <Card className="flex-1 min-w-0 p-0 overflow-hidden relative min-h-[280px] flex flex-col">
            {/* View Mode Tabs - edge-to-edge row */}
            <div
              className="flex-shrink-0 flex border-b border-white/10"
              data-tour="view-mode-tabs"
            >
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

            {/* Layer controls bar */}
            <div
              className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-2 py-1.5 bg-nebula-blue/80 border-b border-white/10"
              data-tour="layer-controls"
            >
              {/* Layer toggles */}
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    "terminator",
                    "greyline",
                    "aurora",
                    "muf",
                    "spots",
                    "nightLights",
                    "labels",
                    "satellites",
                  ] as const
                ).map((layer) => {
                  // Display names for layers
                  const displayNames: Record<string, string> = {
                    terminator: "Day/Night",
                    greyline: "Greyline",
                    aurora: "Aurora",
                    muf: "MUF",
                    spots: "Spots",
                    nightLights: "Lights",
                    labels: "Labels",
                    satellites: "Sats",
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

              {/* Auto-pan to new spots toggle */}
              <button
                onClick={() => setAutoPanToSpots(!autoPanToSpots)}
                aria-pressed={autoPanToSpots}
                title={
                  autoPanToSpots
                    ? "Stop following new spots"
                    : "Auto-follow new spots"
                }
                className={`px-2 py-0.5 text-[10px] rounded transition-all flex items-center gap-1 ${
                  autoPanToSpots
                    ? "bg-signal-green/20 text-signal-green border border-signal-green/40"
                    : "text-gray-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  {/* Crosshair / target icon */}
                  <circle cx="12" cy="12" r="3" />
                  <path
                    strokeLinecap="round"
                    d="M12 2v4m0 12v4m10-10h-4M6 12H2"
                  />
                </svg>
                Follow
              </button>

              {/* Map style toggle (Satellite / Standard) */}
              <MapStyleToggle className="flex-shrink-0" />

              {/* Region preset selector */}
              {viewMode !== "azimuthal" && (
                <RegionPresetSelector
                  onOpenManager={() => setShowPresetManager(true)}
                  className="flex-shrink-0"
                />
              )}

              {/* Visual style selector */}
              <StyleSelector compact className="flex-shrink-0" />

              {/* Layer preset buttons */}
              <div className="flex gap-1 flex-wrap justify-start sm:justify-end">
                {(Object.keys(LAYER_PRESETS) as PresetName[]).map((preset) => (
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
                ))}
              </div>
            </div>

            {/* MUF Legend (bottom of map when MUF layer active) */}
            {layers.muf && (
              <div className="absolute bottom-2 left-2 right-2 z-10">
                <MUFLegend className="bg-black/60 backdrop-blur-sm rounded-lg p-2" />
              </div>
            )}

            {/* Map View - relative container for floating panels */}
            <div
              className="flex-1 min-h-0 relative"
              data-tour="globe-container"
            >
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

              {/* Time Offset Warning - bottom right when viewing simulated time */}
              {timeOffset !== 0 && (
                <div className="absolute bottom-4 right-4 z-20 pointer-events-auto">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-caution-amber/90 backdrop-blur-sm border border-caution-amber shadow-lg">
                    <svg
                      className="w-4 h-4 text-black flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="text-black">
                      <div className="text-xs font-semibold">
                        Simulated Time
                      </div>
                      <div className="text-[10px] opacity-80">
                        Viewing {timeOffset > 0 ? "+" : ""}
                        {timeOffset}h from now
                      </div>
                    </div>
                    <button
                      onClick={() => setTimeOffset(0)}
                      className="ml-1 px-2 py-1 text-[10px] font-medium bg-black/20 hover:bg-black/30 rounded transition-colors"
                      title="Return to live view"
                    >
                      Go Live
                    </button>
                  </div>
                </div>
              )}

              {/* Optimal Bands Pop-out Panel (inside map container, below control bar) */}
              {viewMode === "globe" && !isLiteMode && (
                <OptimalBandsPanel displayTime={displayTime} />
              )}

              {/* Satellite Panel (inside map container, top-left when sat layer active) */}
              {layers.satellites && (
                <div className="absolute top-2 left-2 z-10 w-[260px] max-h-[50%] overflow-y-auto">
                  <SatellitePanel />
                </div>
              )}

              {/* Labels Panel — appears when labels layer is active */}
              {layers.labels && (
                <LabelsPanel className="absolute bottom-2 right-2 z-10" />
              )}

              {/* ═══════════════════════════════════════════════════════════════
                  LITE MODE HUD OVERLAY
                  A minimal, professional heads-up display for maximum map visibility
                  ═══════════════════════════════════════════════════════════════ */}
              {isLiteMode && (
                <div className="absolute inset-0 pointer-events-none z-10 hidden lg:block">
                  {/* ─── TOP HUD BAR ─── */}
                  <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-4 pointer-events-auto">
                    {/* Left cluster: Mode toggles */}
                    <div className="flex items-center gap-2">
                      <LiteModeToggle />
                      <button
                        onClick={() => setFullscreen(true)}
                        className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                                   bg-black/60 backdrop-blur-md border border-white/10
                                   hover:border-plasma-orange/50 hover:bg-black/70
                                   transition-all duration-200"
                      >
                        <svg
                          className="w-3.5 h-3.5 text-plasma-orange"
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
                        <span className="text-[11px] font-medium text-gray-300 group-hover:text-white">
                          Pro
                        </span>
                      </button>
                      <button
                        onClick={() => setShowShareModal(true)}
                        className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
                                   bg-black/60 backdrop-blur-md border border-white/10
                                   hover:border-cosmic-cyan/50 hover:bg-black/70
                                   transition-all duration-200"
                        title="Share this view"
                      >
                        <svg
                          className="w-3.5 h-3.5 text-cosmic-cyan"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                          />
                        </svg>
                        <span className="text-[11px] font-medium text-gray-300 group-hover:text-white">
                          Share
                        </span>
                      </button>
                    </div>

                    {/* Center: Time offset (compact) */}
                    <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500">
                        Time
                      </span>
                      <span className="text-sm font-mono text-white">
                        {displayTime.toISOString().substring(11, 16)}
                        <span className="text-gray-500 ml-1">UTC</span>
                      </span>
                      {timeOffset !== 0 && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            timeOffset > 0
                              ? "bg-plasma-orange/20 text-plasma-orange"
                              : "bg-cosmic-cyan/20 text-cosmic-cyan"
                          }`}
                        >
                          {timeOffset > 0 ? "+" : ""}
                          {timeOffset}h
                        </span>
                      )}
                    </div>

                    {/* Right: Callsign badge + S-meter */}
                    <div className="flex items-center gap-2">
                      {catActive && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10">
                          <span className="text-[10px] text-gray-500">S</span>
                          <span className="text-xs font-mono font-medium text-signal-green">
                            {getSMeterText()}
                          </span>
                        </div>
                      )}
                      {station && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10">
                          <div className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse" />
                          <span className="text-xs font-mono font-medium text-white tracking-wide">
                            {station.callsign}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ─── BOTTOM LEFT: Band Conditions Summary ─── */}
                  <div className="absolute bottom-3 left-3 pointer-events-auto">
                    <div
                      className={`transition-all duration-300 ease-out ${
                        leftPanelExpanded ? "w-[300px]" : "w-auto"
                      }`}
                    >
                      <BandConditionsPanel
                        displayTime={displayTime}
                        className={
                          leftPanelExpanded
                            ? "max-h-[350px] overflow-y-auto bg-black/70 backdrop-blur-md border-white/10"
                            : "bg-black/60 backdrop-blur-md border-white/10"
                        }
                        collapsed={!leftPanelExpanded}
                        onToggleCollapse={() =>
                          setLeftPanelExpanded(!leftPanelExpanded)
                        }
                      />
                    </div>
                  </div>

                  {/* ─── BOTTOM RIGHT: Path Info Summary ─── */}
                  <div className="absolute bottom-3 right-3 pointer-events-auto">
                    <div
                      className={`transition-all duration-300 ease-out ${
                        rightPanelExpanded ? "w-[320px]" : "w-auto"
                      }`}
                    >
                      <PathAnalysis
                        displayTime={displayTime}
                        className={
                          rightPanelExpanded
                            ? "max-h-[400px] overflow-y-auto bg-black/70 backdrop-blur-md border-white/10"
                            : "bg-black/60 backdrop-blur-md border-white/10"
                        }
                        collapsed={!rightPanelExpanded}
                        onToggleCollapse={() =>
                          setRightPanelExpanded(!rightPanelExpanded)
                        }
                        onShare={() => setShowShareModal(true)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Right Resize Handle and Path Analysis - HIDDEN in lite mode */}
          {!isLiteMode && (
            <>
              {/* Right Resize Handle */}
              <div
                className="hidden lg:flex w-2 flex-shrink-0 cursor-col-resize items-center justify-center group hover:bg-plasma-orange/20 transition-colors"
                onMouseDown={handleResizeRight}
                title="Drag to resize"
              >
                <div className="w-0.5 h-8 bg-white/20 group-hover:bg-plasma-orange rounded-full transition-colors" />
              </div>

              {/* Path Analysis Panel (right) - hidden on mobile */}
              <div
                className="hidden lg:flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out"
                style={{ width: rightPanelWidth }}
                data-tour="path-analysis-panel"
              >
                <PathAnalysis
                  displayTime={displayTime}
                  className="h-full overflow-y-auto"
                  onShare={() => setShowShareModal(true)}
                />
              </div>
            </>
          )}
        </div>

        {/* Live ticker bar */}
        {!isLiteMode && <DXNewsTicker className="flex-shrink-0" />}

        {/* Bottom Row - DX Cluster / DX Console (collapses in lite mode) */}
        {!isLiteMode && (
          <>
            {/* Ops Console (when expanded) - takes full bottom area */}
            {isDXConsoleExpanded && (
              <div className="hidden lg:block flex-1 min-h-[400px]">
                <OpsConsole
                  displayTime={displayTime}
                  onCollapse={() => setDXConsoleExpanded(false)}
                  className="h-full"
                />
              </div>
            )}

            {/* Normal Bottom Row: DX Spots (hidden when Console is expanded) */}
            {/* On lg (not xl): Shows Recommendations + DX Spots side by side */}
            <div
              className={`hidden lg:grid xl:hidden grid-cols-[1fr_2fr] gap-2 md:gap-3 flex-shrink-0 h-[200px] ${isDXConsoleExpanded ? "!hidden" : ""}`}
            >
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
              <div className="flex flex-col h-full min-h-0">
                <DXSpotList
                  maxHeight="100px"
                  showFilters={true}
                  showHeader={true}
                  className="flex-1 min-h-0"
                  onResearchGrid={handleResearchGrid}
                />
              </div>
            </div>

            {/* WSJT-X Status Panel + BandScope - shown when connected and DX Console not expanded */}
            {wsjtxConnected && !isDXConsoleExpanded && (
              <div className="hidden xl:block flex-shrink-0 space-y-2">
                <WSJTXStatusPanel defaultCollapsed className="" />
                <BandScope className="h-40" />
              </div>
            )}

            {/* Bottom Row: DX Spots only (xl screens - Recommendations in top row) */}
            {/* Hidden when DX Console is expanded */}
            <div
              className={`hidden xl:block flex-shrink-0 ${isDXConsoleExpanded ? "!hidden" : ""}`}
              data-tour="dx-spot-list"
            >
              <Card className="p-0 overflow-hidden">
                {/* Drawer Toggle Handle - using div with role="button" to avoid nested button */}
                <div
                  onClick={() => setDxClusterExpanded(!dxClusterExpanded)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDxClusterExpanded(!dxClusterExpanded);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="w-full h-10 flex items-center justify-between px-4 bg-nebula-blue/50 hover:bg-nebula-blue/80 border-b border-white/10 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      DX Cluster
                    </span>
                    <span className="text-xs text-gray-400">
                      Live spots from PSKReporter, RBN, and DX clusters
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Expand to Console button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDXConsoleExpanded(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-plasma-orange transition-colors rounded hover:bg-white/5"
                      title="Expand to Ops Console"
                      aria-label="Expand to Ops Console"
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
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                        />
                      </svg>
                    </button>
                    {/* Collapse/Expand chevron */}
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
                  </div>
                </div>
                {/* Collapsible Content */}
                <div
                  className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    dxClusterExpanded ? "h-[280px]" : "h-0"
                  }`}
                >
                  <DXSpotList
                    maxHeight="268px"
                    showFilters={true}
                    showHeader={false}
                    className="rounded-t-none h-full"
                    onResearchGrid={handleResearchGrid}
                  />
                </div>
              </Card>
            </div>
          </>
        )}

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
              <PathAnalysis
                displayTime={displayTime}
                className="h-full"
                onShare={() => setShowShareModal(true)}
              />
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
                onResearchGrid={handleResearchGrid}
              />
            )}
          </div>
        </div>
      </main>

      {/* Fullscreen mode */}
      {/* Fullscreen mode - lazy loaded for performance */}
      {isFullscreen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-8 h-8 border-2 border-plasma-orange border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">
                  Loading fullscreen view...
                </p>
              </div>
            </div>
          }
        >
          <FullscreenPropSphere
            displayTime={displayTime}
            onLocationClick={handleLocationClick}
          />
        </Suspense>
      )}

      <HelpModal
        isOpen={showOptimalBandHelp}
        onClose={() => setShowOptimalBandHelp(false)}
        title={HELP_CONTENT.recommendations.title}
        sections={HELP_CONTENT.recommendations.sections}
      />

      <KeyboardShortcutsOverlay
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />

      {/* Quick Grid Input Modal (Feature 1.5) */}
      <QuickGridInput
        isOpen={showGridInput}
        onClose={() => setShowGridInput(false)}
        onSubmit={(grid, lat, lon) => {
          setTarget({
            lat,
            lon,
            grid,
            name: grid,
          });
          setShowGridInput(false);
        }}
      />

      {/* Region Preset Manager */}
      <RegionPresetManager
        visible={showPresetManager}
        onClose={() => setShowPresetManager(false)}
      />

      {/* Grid Research Panel (keyboard shortcut R) */}
      {gridResearchGrid && (
        <GridResearchPanel
          visible={showGridResearch}
          grid={gridResearchGrid}
          onClose={() => {
            setShowGridResearch(false);
            setGridResearchGrid(null);
          }}
          onAction={(action, grid) => {
            if (action === "setTarget") {
              const coords = gridToLatLon(grid);
              if (coords) {
                setTarget({
                  lat: coords.lat,
                  lon: coords.lon,
                  grid,
                  name: grid,
                });
              }
            }
            if (action === "close") {
              setShowGridResearch(false);
              setGridResearchGrid(null);
            }
          }}
        />
      )}

      {/* Add Pin Dialog (keyboard shortcut P) */}
      {target && (
        <AddPinDialog
          visible={showAddPin}
          mode="add"
          location={{
            lat: target.lat,
            lon: target.lon,
            grid: target.grid || latLonToGrid(target.lat, target.lon),
          }}
          onClose={() => setShowAddPin(false)}
        />
      )}

      {/* Onboarding Tour */}
      <OnboardingTour
        isActive={isTourActive}
        currentStep={tourStep}
        stepIndex={tourStepIndex}
        totalSteps={tourTotalSteps}
        onNext={tourNextStep}
        onPrev={tourPrevStep}
        onSkip={skipTour}
        onComplete={completeTour}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        state={shareState}
        title="Share PropSphere View"
        description={
          target
            ? `Share your path analysis to ${target.name || target.grid}`
            : "Share your current propagation view"
        }
      />
    </div>
  );
}

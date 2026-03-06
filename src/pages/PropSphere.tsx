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
  LayoutModeDropdown,
  DXNewsTicker,
  LabelsPanel,
  KeyboardShortcutsOverlay,
  QuickGridInput,
  GridResearchPanel,
  AddPinDialog,
  RegionPresetManager,
} from "@/components/map";
import { SatelliteDetailModal } from "@/components/map/layers";
import { LayersPopover } from "@/components/map/LayersPopover";
import { ISSSkyTracker } from "@/components/map/ISSSkyTracker";
import { ColorsPopover } from "@/components/map/ColorsPopover";
import { ProfilePopover } from "@/components/map/ProfilePopover";
import { ViewsPopover } from "@/components/map/ViewsPopover";

// Lazy load heavy components that aren't always visible
const FullscreenPropSphere = lazy(() =>
  import("@/components/map/FullscreenPropSphere").then((m) => ({
    default: m.FullscreenPropSphere,
  })),
);
const HamClockView = lazy(() =>
  import("@/components/map/HamClockView").then((m) => ({
    default: m.HamClockView,
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
import { useMapStore } from "@/stores/mapStore";
import { useDXStore } from "@/stores/dxStore";
import { useUserStore } from "@/stores/userStore";
import { BUILTIN_PROFILES } from "@/constants/operatingProfiles";
import type { BuiltinProfileId } from "@/types/operatingProfile";
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
import { WatchPopover } from "@/components/map/WatchPopover";
import { HelpTooltip } from "@/components/help/HelpTooltip";
import { WatchStatusPill } from "@/components/map/WatchStatusPill";
import { ReplayIndicator } from "@/components/map/ReplayIndicator";
import { ContestRatePanel } from "@/components/map/ContestRatePanel";
import { ObservatoryTiltSlider } from "@/components/map/ObservatoryTiltSlider";
import { AspectRatioSlider } from "@/components/map/AspectRatioSlider";
import { PanelMiniStrip } from "@/components/map/PanelMiniStrip";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getPathMetrics, formatBearing } from "@/lib/utils/path";
import { ContestLiteHUD } from "@/components/contest/ContestLiteHUD";
import { useSpotReplay } from "@/hooks/useSpotReplay";
import { useReplayStore } from "@/stores/replayStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { LiveSpot } from "@/types/livespot";

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

// Panel display modes for side panels (normal desktop layout)
type PanelMode = "full" | "mini" | "hidden";

// ─── Toolbar visual separator ────────────────────────────────────────────────
const ToolbarDivider = () => <div className="w-px h-5 bg-white/10" />;

export function PropSphere() {
  const viewMode = useMapStore((s) => s.viewMode);
  const timeOffset = useMapStore((s) => s.timeOffset);
  const setTimeOffset = useMapStore((s) => s.setTimeOffset);
  const target = useMapStore((s) => s.target);
  const setTarget = useMapStore((s) => s.setTarget);
  const layers = useMapStore((s) => s.layers);
  const activePreset = useMapStore((s) => s.activePreset);
  const layoutMode = useMapStore((s) => s.layoutMode);
  const isLiteMode = useMapStore((s) => s.isLiteMode);
  const isDXConsoleExpanded = useMapStore((s) => s.isDXConsoleExpanded);
  const setDXConsoleExpanded = useMapStore((s) => s.setDXConsoleExpanded);
  const pathMode = useMapStore((s) => s.pathMode);
  const replayEnabled = useMapStore((s) => s.replayEnabled);
  const setReplayEnabled = useMapStore((s) => s.setReplayEnabled);
  const station = useUserStore((state) => state.station);
  const tickerPosition = useSettingsStore((s) => s.tickerPosition);
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

  // Contest-aware map overlays (needed mult markers, etc.)
  useContestOverlayEngine({ enabled: Boolean(contestSessionId) });

  // Mount WSJT-X auto-log listener
  useWSJTXAutoLog();

  // Rig CAT state
  const rigConnected = useRigStore((s) => s.connected);
  const rigCatEnabled = useRigStore((s) => s.catEnabled);
  const getSMeterText = useRigStore((s) => s.getSMeterText);
  const catActive = rigCatEnabled && rigConnected;

  // WSJT-X connection state
  const wsjtxConnected = useWSJTXStore((s) => s.connected);

  // Update browser tab title with spot count
  useSpotCountTitle(spotCount);

  // Panel expand states for lite mode floating pills
  // When user clicks a collapsed pill, it can expand to show full content
  const [leftPanelExpanded, setLeftPanelExpanded] = useState(false);
  const [rightPanelExpanded, setRightPanelExpanded] = useState(false);

  // Panel display modes for normal desktop layout (full | mini | hidden)
  const [leftPanelMode, setLeftPanelMode] = useState<PanelMode>("full");
  const [rightPanelMode, setRightPanelMode] = useState<PanelMode>("full");

  // Panel widths for resizing (in pixels)
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);

  // Remember last full-mode widths for restore after mini/hidden
  const [leftPanelLastWidth, setLeftPanelLastWidth] = useState(280);
  const [rightPanelLastWidth, setRightPanelLastWidth] = useState(320);

  // Solar data for mini strip display (cached via react-query, no duplicate fetches)
  const { data: miniKData } = useKIndex();
  const { data: miniSfiData } = useSolarFlux();
  const miniKp = miniKData?.length
    ? miniKData[miniKData.length - 1].kp_index
    : null;
  const miniSfi = miniSfiData?.length
    ? miniSfiData[miniSfiData.length - 1].flux
    : null;
  const miniKpColor =
    miniKp === null
      ? "bg-white/30"
      : miniKp <= 3
        ? "bg-signal-green"
        : miniKp <= 5
          ? "bg-yellow-400"
          : "bg-red-500";

  // Path metrics for mini strip display
  const miniPathMetrics = useMemo(() => {
    if (!station || !target) return null;
    return getPathMetrics(station.lat, station.lon, target.lat, target.lon);
  }, [station, target]);

  // Active tab for mobile bottom panel
  const [activeTab, setActiveTab] = useState<PanelTab>("path");

  // Track active profile locally (extends activePreset to include "listener")
  const [localActiveProfile, setLocalActiveProfile] =
    useState<BuiltinProfileId | null>(null);

  // Sync localActiveProfile with mapStore's activePreset.
  // When activePreset is set by applyPreset(), mirror it here.
  // When it becomes null (layer toggled manually), clear local too — including listener.
  useEffect(() => {
    if (activePreset !== null) {
      setLocalActiveProfile(activePreset as BuiltinProfileId);
    } else {
      // If listener is active, check if layers still match the listener profile
      if (localActiveProfile === "listener") {
        const currentLayers = useMapStore.getState().layers;
        const listenerLayers = BUILTIN_PROFILES.listener.layers;
        const match = (
          Object.keys(listenerLayers) as (keyof typeof listenerLayers)[]
        ).every((k) => currentLayers[k] === listenerLayers[k]);
        if (!match) setLocalActiveProfile(null);
      } else {
        setLocalActiveProfile(null);
      }
    }
  }, [activePreset, layers]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Watch store actions (read on-demand to avoid full-store subscription)
  const watchClearWatch = useWatchStore((s) => s.clearWatch);
  const watchSetMyGrid = useWatchStore((s) => s.setMyGridWatch);
  const watchCriteria = useWatchStore((s) => s.criteria);

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
            if (watchCriteria?.gridPrefix === target.grid) {
              watchClearWatch();
            } else {
              watchSetMyGrid(target.grid);
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
      watchCriteria,
      watchClearWatch,
      watchSetMyGrid,
      startTour,
      pushAction,
    ],
  );

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    onAction: handleShortcutAction,
    enabled:
      !showShortcutsHelp &&
      !showOptimalBandHelp &&
      (layoutMode === "normal" || layoutMode === "lite"),
  });

  // Resize handle dragging — snap to mini mode below 120px
  const handleResizeLeft = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = leftPanelWidth;
      let snapped = false;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (snapped) return;
        const delta = moveEvent.clientX - startX;
        const rawWidth = startWidth + delta;
        if (rawWidth < 120) {
          snapped = true;
          setLeftPanelLastWidth(leftPanelWidth);
          setLeftPanelMode("mini");
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          return;
        }
        setLeftPanelWidth(Math.max(200, Math.min(400, rawWidth)));
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
      let snapped = false;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (snapped) return;
        const delta = startX - moveEvent.clientX;
        const rawWidth = startWidth + delta;
        if (rawWidth < 120) {
          snapped = true;
          setRightPanelLastWidth(rightPanelWidth);
          setRightPanelMode("mini");
          document.removeEventListener("mousemove", handleMouseMove);
          document.removeEventListener("mouseup", handleMouseUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          return;
        }
        setRightPanelWidth(Math.max(200, Math.min(400, rawWidth)));
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

  // ── Spot Replay ────────────────────────────────────────────────────────
  const { spots: replaySpots } = useSpotReplay({
    centerTime: displayTime,
    enabled: replayEnabled,
    windowMinutes: 15,
  });

  // Convert ReplaySpot[] → LiveSpot[] so the globe renderer can consume them
  const replayAsLiveSpots: LiveSpot[] = useMemo(() => {
    if (!replaySpots.length) return [];
    return replaySpots.map((s) => ({
      id: `replay-${s.id}`,
      spotter: s.spotter,
      spotterGrid: s.spotterGrid,
      dx: s.dx,
      dxGrid: s.dxGrid,
      frequency: s.frequency,
      band: s.band,
      mode: s.mode,
      snr: s.snr,
      time: s.spottedAt,
      comment: "",
      source: s.source as LiveSpot["source"],
      spotterLat: s.spotterLat,
      spotterLon: s.spotterLon,
      dxLat: s.dxLat,
      dxLon: s.dxLon,
    }));
  }, [replaySpots]);

  // Sync converted replay spots into the ephemeral store so globe/flat views can read them
  useEffect(() => {
    useReplayStore.getState().setReplaySpots(replayAsLiveSpots);
  }, [replayAsLiveSpots]);

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
    <div className="h-[calc(100dvh-4rem)] flex flex-col overflow-y-auto lg:overflow-hidden">
      {isLiteMode && <ContestLiteHUD />}

      {/* Main Content - Framed Layout (hidden in pro/hamclock — those render their own fullscreen overlay) */}
      {layoutMode !== "pro" && layoutMode !== "hamclock" && (
        <main className="flex-1 flex flex-col p-2 md:p-4 gap-2 md:gap-3 max-w-[1920px] mx-auto w-full min-h-0">
          {/* Live ticker bar — "top" position (below masthead) */}
          {!isLiteMode && tickerPosition === "top" && (
            <DXNewsTicker className="flex-shrink-0 -mx-2 md:-mx-4 -mt-2 md:-mt-4 rounded-none" />
          )}

          {/* Top Row: Lite Mode is EMPTY (controls move to map overlay), Default mode shows full cards */}
          {/* When DX Console is expanded, top row slides up and out of view */}
          {isLiteMode ? (
            // Lite Mode: No top row - everything is overlaid on the map
            // This div is intentionally minimal to maximize map space
            <div className="hidden lg:block h-0" />
          ) : (
            // Default Mode Top Row - full cards (animates out when DX Console expanded)
            <div
              className={`grid grid-cols-2 lg:grid-cols-[220px_1fr_200px] xl:grid-cols-[220px_280px_minmax(300px,1fr)_200px] gap-2 md:gap-3 transition-all duration-300 ease-in-out ${
                isDXConsoleExpanded
                  ? "max-h-0 opacity-0 overflow-hidden mb-0"
                  : "max-h-[500px] opacity-100"
              }`}
            >
              {/* Operator Profile — top-left, primary attention zone */}
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

              {/* 24h Propagation Forecast (hidden on mobile, shown on lg+) */}
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

              {/* Time Machine + Layout + Share — top-right */}
              <div className="col-span-1 flex flex-col gap-2">
                {/* Layout Mode Dropdown + Share */}
                <div className="hidden lg:flex gap-2">
                  <LayoutModeDropdown className="flex-1" />
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

                {/* Time Machine */}
                <Card
                  className="p-2 flex-1 !rounded-lg"
                  data-tour="time-control"
                >
                  <TimeControl className="h-full" />
                </Card>
              </div>
            </div>
          )}

          {/* Live ticker bar — "above-panels" position */}
          {!isLiteMode && tickerPosition === "above-panels" && (
            <DXNewsTicker className="flex-shrink-0" />
          )}

          {/* Middle Row: Bands | Map | Path - fills available space */}
          <div className="flex-1 min-h-0 flex gap-0 lg:gap-0">
            {/* Band Conditions Panel (left) - hidden on mobile, HIDDEN in lite mode */}
            {!isLiteMode && leftPanelMode === "full" && (
              <>
                <div
                  className="hidden lg:flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out"
                  style={{ width: leftPanelWidth }}
                  data-tour="band-conditions-panel"
                >
                  <BandConditionsPanel
                    displayTime={displayTime}
                    className="h-full overflow-y-auto"
                    onMinimize={() => {
                      setLeftPanelLastWidth(leftPanelWidth);
                      setLeftPanelMode("mini");
                    }}
                    onClose={() => {
                      setLeftPanelLastWidth(leftPanelWidth);
                      setLeftPanelMode("hidden");
                    }}
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
            {/* Band Conditions Mini Strip (left) */}
            {!isLiteMode && leftPanelMode === "mini" && (
              <div className="hidden lg:flex">
                <PanelMiniStrip
                  side="left"
                  onExpand={() => {
                    setLeftPanelWidth(leftPanelLastWidth);
                    setLeftPanelMode("full");
                  }}
                  onHide={() => setLeftPanelMode("hidden")}
                >
                  {/* Condition indicator */}
                  <div
                    className={`w-2 h-2 rounded-full ${miniKpColor}`}
                    title={
                      miniKp !== null ? `K-index: ${miniKp}` : "Loading..."
                    }
                  />
                  {/* K-index */}
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[8px] text-white/40 leading-none">
                      K
                    </span>
                    <span className="text-[11px] font-mono font-medium text-white/70 leading-none">
                      {miniKp ?? "–"}
                    </span>
                  </div>
                  {/* SFI */}
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[8px] text-white/40 leading-none">
                      SFI
                    </span>
                    <span className="text-[11px] font-mono font-medium text-white/70 leading-none">
                      {miniSfi ?? "–"}
                    </span>
                  </div>
                </PanelMiniStrip>
              </div>
            )}

            {/* Map View (center) - takes remaining space */}
            <Card className="flex-1 min-w-0 !p-0 relative min-h-[280px] flex flex-col">
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

              {/* Quick-access toolbar */}
              <div
                role="toolbar"
                aria-label="Map controls"
                className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-void-black/50 border-b border-white/5"
                data-tour="layer-controls"
              >
                {/* Help tooltip */}
                <HelpTooltip
                  section="propsphere"
                  tooltip="Learn more about PropSphere"
                />

                {/* Layers popover */}
                <LayersPopover />

                {/* Colors popover */}
                <ColorsPopover />

                {/* Profile popover */}
                <ProfilePopover
                  activeProfile={localActiveProfile}
                  onSelectProfile={setLocalActiveProfile}
                />

                {/* Observatory mode */}
                <ToolbarDivider />
                <button
                  type="button"
                  onClick={() => useMapStore.getState().enterObservatory()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                  title="Observatory Mode — fullscreen auto-rotating globe, zoom only"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="3" />
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="2" y1="12" x2="6" y2="12" />
                    <line x1="18" y1="12" x2="22" y2="12" />
                  </svg>
                  Observatory
                </button>

                {/* Panel layout cycle: Full → Compact → Focus → Full */}
                <button
                  type="button"
                  className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    leftPanelMode !== "full" || rightPanelMode !== "full"
                      ? "bg-plasma-orange/15 text-plasma-orange hover:bg-plasma-orange/25"
                      : "text-gray-300 hover:text-white hover:bg-white/10"
                  }`}
                  title={
                    leftPanelMode === "full" && rightPanelMode === "full"
                      ? "Compact panels"
                      : leftPanelMode === "hidden" &&
                          rightPanelMode === "hidden"
                        ? "Reset panels"
                        : "Cycle panel layout"
                  }
                  onClick={() => {
                    const bothFull =
                      leftPanelMode === "full" && rightPanelMode === "full";
                    const bothMini =
                      leftPanelMode === "mini" && rightPanelMode === "mini";

                    if (bothFull) {
                      // Full → Compact
                      setLeftPanelLastWidth(leftPanelWidth);
                      setRightPanelLastWidth(rightPanelWidth);
                      setLeftPanelMode("mini");
                      setRightPanelMode("mini");
                    } else if (bothMini) {
                      // Compact → Focus
                      setLeftPanelMode("hidden");
                      setRightPanelMode("hidden");
                    } else {
                      // Any mixed or hidden state → Reset to full
                      setLeftPanelMode("full");
                      setRightPanelMode("full");
                      setLeftPanelWidth(leftPanelLastWidth);
                      setRightPanelWidth(rightPanelLastWidth);
                    }
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="1" y="1" width="12" height="12" rx="1.5" />
                    <line x1="4" y1="1" x2="4" y2="13" />
                    <line x1="10" y1="1" x2="10" y2="13" />
                  </svg>
                  Panels
                </button>

                {/* Watch popover + inline status pill */}
                <WatchPopover />
                <WatchStatusPill />

                {/* Spacer pushes Views to right */}
                <div className="flex-1" />

                {/* Views popover — far right */}
                {viewMode !== "azimuthal" && (
                  <ViewsPopover
                    onOpenManager={() => setShowPresetManager(true)}
                  />
                )}
              </div>

              {/* Replay indicator (floating below toolbar) */}
              <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20">
                <ReplayIndicator
                  displayTime={displayTime}
                  playSpeed={1}
                  isReplaying={replayEnabled}
                  onToggle={() => setReplayEnabled(!replayEnabled)}
                />
              </div>

              {/* Contest rate panel (floating, right side) */}
              <div className="absolute top-14 right-3 z-20">
                <ContestRatePanel />
              </div>

              {/* MUF Legend (bottom of map when MUF layer active) */}
              {layers.muf && (
                <div className="absolute bottom-2 left-2 right-2 z-10">
                  <MUFLegend className="bg-black/60 backdrop-blur-sm rounded-lg p-2" />
                </div>
              )}

              {/* Map View - relative container for floating panels */}
              <div
                className="flex-1 min-h-0 relative overflow-hidden"
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

                {/* ISS Sky Tracker overlay (DOM, outside Canvas) */}
                {layers.issTracker && <ISSSkyTracker />}

                {/* Earth tilt slider — globe view only */}
                {viewMode === "globe" && (
                  <ObservatoryTiltSlider
                    visible
                    className="absolute bottom-2 right-2"
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
                      {/* Left cluster: Layout mode dropdown + Share */}
                      <div className="flex items-center gap-2">
                        <LayoutModeDropdown className="bg-black/60 backdrop-blur-md" />
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

                    {/* ─── BOTTOM RIGHT: Controls + Path Info (docked together) ─── */}
                    <div className="absolute bottom-3 right-3 pointer-events-auto flex flex-col items-end gap-1.5">
                      {/* Aspect ratio slider — flat view only, docked above path box */}
                      {viewMode === "flat" && (
                        <AspectRatioSlider className="flex flex-col items-center gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg px-2 py-2" />
                      )}

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
            {!isLiteMode && rightPanelMode === "full" && (
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
                    onMinimize={() => {
                      setRightPanelLastWidth(rightPanelWidth);
                      setRightPanelMode("mini");
                    }}
                    onClose={() => {
                      setRightPanelLastWidth(rightPanelWidth);
                      setRightPanelMode("hidden");
                    }}
                  />
                </div>
              </>
            )}
            {/* Path Analysis Mini Strip (right) */}
            {!isLiteMode && rightPanelMode === "mini" && (
              <div className="hidden lg:flex">
                <PanelMiniStrip
                  side="right"
                  onExpand={() => {
                    setRightPanelWidth(rightPanelLastWidth);
                    setRightPanelMode("full");
                  }}
                  onHide={() => setRightPanelMode("hidden")}
                >
                  {miniPathMetrics ? (
                    <>
                      {/* Bearing arrow */}
                      <div
                        className="flex flex-col items-center gap-0.5"
                        title={`${Math.round(miniPathMetrics.shortPath.bearing)}° ${formatBearing(miniPathMetrics.shortPath.bearing)}`}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          className="text-white/60"
                          style={{
                            transform: `rotate(${miniPathMetrics.shortPath.bearing}deg)`,
                          }}
                        >
                          <path
                            d="M8 2L8 14M8 2L5 5M8 2L11 5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                        </svg>
                        <span className="text-[8px] text-white/40 leading-none">
                          {formatBearing(miniPathMetrics.shortPath.bearing)}
                        </span>
                      </div>
                      {/* Distance */}
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[11px] font-mono font-medium text-white/70 leading-none">
                          {miniPathMetrics.shortPath.distance < 1000
                            ? `${Math.round(miniPathMetrics.shortPath.distance)}`
                            : `${(miniPathMetrics.shortPath.distance / 1000).toFixed(1)}k`}
                        </span>
                        <span className="text-[8px] text-white/40 leading-none">
                          km
                        </span>
                      </div>
                      {/* Difficulty dot */}
                      <div
                        className={`w-2 h-2 rounded-full ${
                          miniPathMetrics.difficulty <= 2
                            ? "bg-signal-green"
                            : miniPathMetrics.difficulty <= 3
                              ? "bg-yellow-400"
                              : "bg-red-500"
                        }`}
                        title={`Difficulty: ${miniPathMetrics.difficulty}/5`}
                      />
                    </>
                  ) : (
                    <span className="text-[9px] text-white/30 [writing-mode:vertical-rl]">
                      No target
                    </span>
                  )}
                </PanelMiniStrip>
              </div>
            )}
          </div>

          {/* Live ticker bar — "bottom" position (default) */}
          {!isLiteMode && tickerPosition === "bottom" && (
            <DXNewsTicker className="flex-shrink-0" />
          )}

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
            <div className="h-[250px] overflow-y-auto">
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
      )}

      {/* Fullscreen Pro mode - lazy loaded for performance */}
      {layoutMode === "pro" && (
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

      {/* HamClock dense-information dashboard view */}
      {layoutMode === "hamclock" && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-8 h-8 border-2 border-signal-green border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">
                  Loading HamClock view...
                </p>
              </div>
            </div>
          }
        >
          <HamClockView
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

      {/* Satellite Detail Modal (portal-based, triggered by store selection) */}
      <SatelliteDetailModal />
    </div>
  );
}

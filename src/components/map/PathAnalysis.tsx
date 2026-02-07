/**
 * PathAnalysis Component
 *
 * Displays path metrics between home station and target location.
 * Shows distance, bearing, hop count, difficulty rating, and
 * MUF/LUF/FOT/HPF frequency limits. Designed for right-side panel
 * in the framed layout.
 *
 * Performance optimized with memoized sub-components.
 */

import {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
  memo,
  type ReactNode,
} from "react";
import { useMapStore, type TargetLocation } from "@/stores/mapStore";
import {
  useUserStore,
  useActiveRadio,
  usePreferTestedSpecs,
} from "@/stores/userStore";
import {
  getPathMetrics,
  formatBearing,
  formatDistance,
  getPathIllumination,
} from "@/lib/utils/path";
import { getFrequencyLimits } from "@/lib/api/muf";
import { useSolarFlux } from "@/hooks/useSolarData";
import { Card } from "@/components/ui/Card";
import { DetailModal } from "@/components/ui/DetailModal";
import { HelpButton, HelpModal, HELP_CONTENT } from "@/components/ui/HelpModal";
import { RadioPickerModal } from "@/components/radio/RadioPickerModal";
import { calculateReceiverScore } from "@/types/radio";
import type { FrequencyLimits } from "@/types/propagation";
import type { RadioEquipment } from "@/types/radio";
import { getRadioById, getEffectiveReceiverSpecs } from "@/lib/data/radios";
import { useUndoStore } from "@/stores/undoStore";
import {
  classifyTerrain,
  getTerrainIcon,
  getTerrainLabel,
  getPathTerrainLoss,
} from "@/lib/utils/terrain";
import type { TerrainType } from "@/lib/utils/terrain";
import { InfoTip } from "@/components/ui/Tooltip";
import { PROPAGATION_TOOLTIPS, GEOGRAPHY_TOOLTIPS } from "@/constants/tooltips";

interface PathAnalysisProps {
  /** Current display time for illumination calculation */
  displayTime: Date;
  className?: string;
  /** When true, panel collapses to a slim summary bar */
  collapsed?: boolean;
  /** Callback to toggle collapsed state */
  onToggleCollapse?: () => void;
  /** Callback to share the current path analysis */
  onShare?: () => void;
}

const DIFFICULTY_LABELS = [
  "",
  "Easy",
  "Moderate",
  "Challenging",
  "Difficult",
  "Extreme",
];
const DIFFICULTY_COLORS = [
  "",
  "text-signal-green",
  "text-good",
  "text-caution-amber",
  "text-plasma-orange",
  "text-alert-red",
];

/**
 * Get color class for distance based on difficulty level
 * Uses the same color scheme as difficulty ratings
 */
const getDistanceColor = (difficulty: number): string => {
  return DIFFICULTY_COLORS[difficulty] || "text-white";
};

/**
 * Get color class for estimated hop count
 * 1-2 hops = green (easy), 3-4 = amber (moderate), 5+ = red (difficult)
 */
const getHopsColor = (hops: number): string => {
  if (hops <= 2) {
    return "text-signal-green";
  }
  if (hops <= 4) {
    return "text-caution-amber";
  }
  return "text-alert-red";
};

/**
 * Get color class for path illumination percentage
 * >60% = green (good daylight), 40-60% = amber (mixed), <40% = red (mostly dark)
 */
const getIlluminationColor = (illumination: number): string => {
  if (illumination > 60) {
    return "text-signal-green";
  }
  if (illumination >= 40) {
    return "text-caution-amber";
  }
  return "text-alert-red";
};

/**
 * Get color class for long path distance
 * Long path is inherently more challenging, so we use a shifted scale
 */
const getLongPathDistanceColor = (difficulty: number): string => {
  // Long path adds inherent difficulty, shift the color by 1-2 levels
  const adjustedDifficulty = Math.min(5, difficulty + 1);
  return DIFFICULTY_COLORS[adjustedDifficulty] || "text-caution-amber";
};

/**
 * Recent Targets Dropdown component
 * Shows last 10 targets for quick re-selection
 */
const RecentTargetsDropdown = memo(function RecentTargetsDropdown({
  recentTargets,
  currentTarget,
  station,
  onSelect,
  onClear,
}: {
  recentTargets: TargetLocation[];
  currentTarget: TargetLocation | null;
  station: { lat: number; lon: number } | null;
  onSelect: (target: TargetLocation) => void;
  onClear: () => void;
}) {
  // Calculate distance for a target (if station is available)
  const getDistance = useCallback(
    (target: TargetLocation): string | null => {
      if (!station) {
        return null;
      }
      const metrics = getPathMetrics(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
      );
      return formatDistance(metrics.shortPath.distance);
    },
    [station],
  );

  // Check if a target is the current one
  const isCurrent = useCallback(
    (target: TargetLocation): boolean => {
      if (!currentTarget) {
        return false;
      }
      return (
        target.lat === currentTarget.lat && target.lon === currentTarget.lon
      );
    },
    [currentTarget],
  );

  return (
    <div className="absolute top-full left-0 mt-1 w-56 bg-nebula-blue border border-white/10 rounded-lg shadow-lg z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
        <span className="text-xs font-medium text-gray-300">
          Recent Targets
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="text-[10px] text-gray-400 hover:text-alert-red transition-colors"
          title="Clear recent targets"
        >
          Clear
        </button>
      </div>

      {/* Target list */}
      <div className="max-h-60 overflow-y-auto scrollbar-hide">
        {recentTargets.map((target, index) => {
          const distance = getDistance(target);
          const current = isCurrent(target);
          const displayName =
            target.name ||
            target.grid ||
            `${target.lat.toFixed(2)}, ${target.lon.toFixed(2)}`;

          return (
            <button
              key={`${target.lat}-${target.lon}-${index}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(target);
              }}
              className={`w-full px-3 py-2 text-left hover:bg-white/10 transition-colors flex items-center justify-between gap-2 ${
                current ? "bg-plasma-orange/10" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm truncate ${current ? "text-plasma-orange" : "text-white"}`}
                >
                  {displayName}
                </div>
                {target.grid && target.name && (
                  <div className="text-[10px] text-gray-400 font-mono">
                    {target.grid}
                  </div>
                )}
              </div>
              {distance && (
                <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                  {distance}
                </span>
              )}
              {current && (
                <svg
                  className="w-3 h-3 text-plasma-orange flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export function PathAnalysis({
  displayTime,
  className = "",
  collapsed = false,
  onToggleCollapse,
  onShare,
}: PathAnalysisProps) {
  const {
    target,
    pathMode,
    setPathMode,
    recentTargets,
    setTarget,
    clearRecentTargets,
  } = useMapStore();
  const { pushAction } = useUndoStore();
  const { station, preferences, savedTargets, addTarget } = useUserStore();
  const activeRadio = useActiveRadio();
  const preferTested = usePreferTestedSpecs();
  const { customRadios } = preferences;
  const radioInstances = useMemo(
    () => preferences.radios || [],
    [preferences.radios],
  );

  // Save target modal state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [targetName, setTargetName] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showRadioPicker, setShowRadioPicker] = useState(false);
  const [analysisRadioId, setAnalysisRadioId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

  // Recent targets dropdown state
  const [showRecentTargets, setShowRecentTargets] = useState(false);
  const recentDropdownRef = useRef<HTMLDivElement>(null);

  // Check if content overflows and handle scroll position
  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const hasOverflow = el.scrollHeight > el.clientHeight;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 5;
    setShowScrollIndicator(hasOverflow && !isAtBottom);
  }, []);

  // Set up scroll listener and initial check
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    checkScroll();
    el.addEventListener("scroll", checkScroll);
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll, collapsed]);

  // Close recent targets dropdown when clicking outside
  useEffect(() => {
    if (!showRecentTargets) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (
        recentDropdownRef.current &&
        !recentDropdownRef.current.contains(e.target as Node)
      ) {
        setShowRecentTargets(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showRecentTargets]);

  const analysisRadio = useMemo(() => {
    if (analysisRadioId === null) {
      return activeRadio;
    }
    const instance =
      radioInstances.find((r) => r.id === analysisRadioId) ?? null;
    const equipmentId = instance?.equipmentId ?? analysisRadioId;
    return (
      customRadios?.find((r) => r.id === equipmentId) ||
      getRadioById(equipmentId) ||
      null
    );
  }, [activeRadio, analysisRadioId, customRadios, radioInstances]);

  const analysisRadioInstance = useMemo(() => {
    if (!analysisRadioId) {
      return null;
    }
    return radioInstances.find((r) => r.id === analysisRadioId) ?? null;
  }, [analysisRadioId, radioInstances]);

  // Fetch current solar data for frequency limits
  const { data: solarFluxData } = useSolarFlux();

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return 100;
    }
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Check if current target is already saved
  const isTargetSaved = useMemo(() => {
    if (!target) {
      return false;
    }
    return savedTargets.some(
      (t) => t.lat === target.lat && t.lon === target.lon,
    );
  }, [target, savedTargets]);

  // Handle save target
  const handleSaveTarget = useCallback(() => {
    if (!target || !targetName.trim()) {
      return;
    }
    addTarget({
      name: targetName.trim(),
      lat: target.lat,
      lon: target.lon,
      grid: target.grid,
    });
    setTargetName("");
    setShowSaveModal(false);
  }, [target, targetName, addTarget]);

  // Open save modal with default name
  const openSaveModal = useCallback(() => {
    if (!target) {
      return;
    }
    setTargetName(target.name || target.grid || "");
    setShowSaveModal(true);
  }, [target]);

  // Calculate path metrics
  const metrics = useMemo(() => {
    if (!station || !target) {
      return null;
    }
    return getPathMetrics(station.lat, station.lon, target.lat, target.lon);
  }, [station, target]);

  // Calculate path illumination
  const illumination = useMemo(() => {
    if (!station || !target) {
      return 0;
    }
    return getPathIllumination(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      displayTime,
    );
  }, [station, target, displayTime]);

  // Calculate frequency limits (MUF, FOT, LUF, HPF) at path midpoint
  const frequencyLimits = useMemo((): FrequencyLimits | null => {
    if (!station || !target || !metrics) {
      return null;
    }
    try {
      return getFrequencyLimits(
        metrics.midpoint.lat,
        metrics.midpoint.lon,
        currentSfi,
        displayTime,
        100, // Default 100W TX power
        "SSB", // Default to SSB for frequency limit calculations
      );
    } catch {
      return null;
    }
  }, [station, target, metrics, currentSfi, displayTime]);

  // No station configured
  if (!station) {
    return (
      <>
        <Card className={`${className} h-full p-2 !rounded-lg`}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-0.5 flex-shrink-0">
              <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide">
                Path Analysis
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                <HelpButton onClick={() => setShowHelp(true)} />
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <p className="text-sm text-center px-4">
                Set your QTH in settings to see path analysis
              </p>
            </div>
          </div>
        </Card>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.pathAnalysis.title}
          sections={HELP_CONTENT.pathAnalysis.sections}
        />

        <RadioPickerModal
          isOpen={showRadioPicker}
          onClose={() => setShowRadioPicker(false)}
          value={{ radioId: analysisRadioId }}
          onChange={(next) => setAnalysisRadioId(next.radioId)}
          title="Path Analysis Radio Profile"
        />
      </>
    );
  }

  // No target selected
  if (!target) {
    return (
      <>
        <Card className={`${className} h-full p-2 !rounded-lg`}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-0.5 flex-shrink-0">
              <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide">
                Path Analysis
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                <HelpButton onClick={() => setShowHelp(true)} />
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <p className="text-sm text-center px-4">
                Click on the map to select a target location
              </p>
            </div>
          </div>
        </Card>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.pathAnalysis.title}
          sections={HELP_CONTENT.pathAnalysis.sections}
        />

        <RadioPickerModal
          isOpen={showRadioPicker}
          onClose={() => setShowRadioPicker(false)}
          value={{ radioId: analysisRadioId }}
          onChange={(next) => setAnalysisRadioId(next.radioId)}
          title="Path Analysis Radio Profile"
        />
      </>
    );
  }

  if (!metrics) return null;

  // Difficulty colors for collapsed view
  const difficultyBgColors: Record<number, string> = {
    1: "bg-signal-green/20",
    2: "bg-good/20",
    3: "bg-caution-amber/20",
    4: "bg-plasma-orange/20",
    5: "bg-alert-red/20",
  };

  return (
    <Card
      className={`${className} flex flex-col transition-all duration-300 ease-in-out !rounded-lg ${
        collapsed ? "h-auto !p-2.5" : "h-full p-2"
      }`}
    >
      {/* Header - always visible, clickable in collapsed mode */}
      <div
        className={`flex items-center justify-between flex-shrink-0 ${
          collapsed ? "cursor-pointer rounded-lg transition-colors" : "mb-0.5"
        }`}
        onClick={collapsed ? onToggleCollapse : undefined}
        role={collapsed ? "button" : undefined}
        tabIndex={collapsed ? 0 : undefined}
        onKeyDown={
          collapsed
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleCollapse?.();
                }
              }
            : undefined
        }
      >
        {/* COLLAPSED: Clean horizontal layout */}
        {collapsed ? (
          <div className="flex items-center gap-3 w-full">
            {/* Expand indicator */}
            <svg
              className="w-3.5 h-3.5 text-gray-500 flex-shrink-0"
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

            {/* Path mode badge */}
            <span
              className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium ${
                pathMode === "long"
                  ? "bg-plasma-orange/20 text-plasma-orange"
                  : "bg-white/10 text-gray-400"
              }`}
            >
              {pathMode === "long" ? "LP" : "SP"}
            </span>

            {/* Difficulty indicator dot */}
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                metrics.difficulty <= 2
                  ? "bg-signal-green"
                  : metrics.difficulty <= 3
                    ? "bg-caution-amber"
                    : "bg-alert-red"
              }`}
            />

            {/* Distance - show based on path mode */}
            <span
              className={`text-sm font-mono font-semibold ${
                pathMode === "long"
                  ? getLongPathDistanceColor(metrics.difficulty)
                  : getDistanceColor(metrics.difficulty)
              }`}
            >
              {pathMode === "long"
                ? formatDistance(metrics.longPath.distance)
                : formatDistance(metrics.shortPath.distance)}
            </span>

            {/* Difficulty badge */}
            <span
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                DIFFICULTY_COLORS[metrics.difficulty]
              } ${difficultyBgColors[metrics.difficulty] || "bg-white/5"}`}
            >
              {DIFFICULTY_LABELS[metrics.difficulty]}
            </span>

            {/* Divider */}
            <div className="w-px h-3 bg-white/10" />

            {/* Bearing compact - show based on path mode */}
            <span className="text-[10px] font-mono text-gray-400">
              {pathMode === "long"
                ? `${Math.round(metrics.longPath.bearing)}° ${formatBearing(metrics.longPath.bearing)}`
                : `${Math.round(metrics.shortPath.bearing)}° ${formatBearing(metrics.shortPath.bearing)}`}
            </span>

            {/* Target indicator */}
            {target && (
              <>
                <div className="w-px h-3 bg-white/10" />
                <span className="text-[10px] text-gray-500 truncate max-w-[80px]">
                  {pathMode === "long" ? "← " : "→ "}
                  {target.grid || target.name}
                </span>
              </>
            )}
          </div>
        ) : (
          /* EXPANDED: Restructured header with title top-left, icons top-right */
          <>
            <div className="flex items-center gap-2 min-w-0">
              {/* Collapse toggle icon */}
              {onToggleCollapse && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse();
                  }}
                  className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                  title="Collapse panel"
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
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              )}

              {/* Difficulty indicator dot */}
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  metrics.difficulty <= 2
                    ? "bg-signal-green"
                    : metrics.difficulty <= 3
                      ? "bg-caution-amber"
                      : "bg-alert-red"
                }`}
              />

              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide">
                  Path Info
                </h3>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-gray-400 truncate">
                    {station.callsign} →{" "}
                    {target.name || target.grid || "Target"}
                  </p>
                  {/* Recent targets dropdown */}
                  {recentTargets.length > 0 && (
                    <div className="relative" ref={recentDropdownRef}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowRecentTargets(!showRecentTargets);
                        }}
                        className="p-0.5 hover:bg-white/10 rounded transition-colors"
                        title="Recent targets"
                      >
                        <svg
                          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${
                            showRecentTargets ? "rotate-180" : ""
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
                      {showRecentTargets && (
                        <RecentTargetsDropdown
                          recentTargets={recentTargets}
                          currentTarget={target}
                          station={station}
                          onSelect={(t) => {
                            setTarget(t);
                            setShowRecentTargets(false);
                          }}
                          onClear={() => {
                            // Record the action for undo before clearing
                            if (recentTargets.length > 0) {
                              pushAction({
                                type: "CLEAR_RECENT_TARGETS",
                                targets: [...recentTargets],
                                description: `Cleared ${recentTargets.length} recent target${recentTargets.length !== 1 ? "s" : ""}`,
                              });
                            }
                            clearRecentTargets();
                            setShowRecentTargets(false);
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Difficulty badge - inline with title area */}
              <div
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  DIFFICULTY_COLORS[metrics.difficulty]
                } ${difficultyBgColors[metrics.difficulty] || "bg-white/5"}`}
              >
                {DIFFICULTY_LABELS[metrics.difficulty]}
              </div>
            </div>

            {/* Action icons - top-right */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <HelpButton onClick={() => setShowHelp(true)} />
              {/* Share button */}
              {onShare && (
                <button
                  onClick={onShare}
                  className="p-1 bg-cosmic-cyan/20 border border-cosmic-cyan/50 rounded
                             text-cosmic-cyan hover:bg-cosmic-cyan/30 transition-colors"
                  title="Share this path"
                >
                  <svg
                    className="w-3.5 h-3.5"
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
              )}
              {/* Save button */}
              {!isTargetSaved && (
                <button
                  onClick={openSaveModal}
                  className="p-1 bg-plasma-orange/20 border border-plasma-orange/50 rounded
                             text-plasma-orange hover:bg-plasma-orange/30 transition-colors"
                  title="Save this target"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                    />
                  </svg>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Collapsible content with smooth animation */}
      <div
        className={`relative flex-1 min-h-0 transition-all duration-300 ease-in-out overflow-hidden ${
          collapsed ? "max-h-0 opacity-0" : "max-h-[2000px] opacity-100"
        }`}
      >
        <div
          ref={scrollRef}
          className="h-full flex flex-col overflow-y-auto scrollbar-hide pt-3"
        >
          {/* Path Mode Toggle */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-400">
              Path Display
            </span>
            <div className="flex rounded-md overflow-hidden border border-white/10">
              <button
                onClick={() => setPathMode("short")}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  pathMode === "short"
                    ? "bg-plasma-orange/30 text-plasma-orange border-r border-plasma-orange/30"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border-r border-white/10"
                }`}
                title="Short Path - direct great circle route"
              >
                SP
              </button>
              <button
                onClick={() => setPathMode("long")}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  pathMode === "long"
                    ? "bg-plasma-orange/30 text-plasma-orange"
                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                }`}
                title="Long Path - around the other side of Earth"
              >
                LP
              </button>
            </div>
          </div>

          {/* Short Path */}
          <div
            className={`space-y-2 rounded-lg p-2 transition-colors ${
              pathMode === "short"
                ? "bg-plasma-orange/10 border border-plasma-orange/20"
                : "bg-white/5 border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-medium text-gray-400 inline-flex items-center gap-1">
                Short Path <InfoTip content={GEOGRAPHY_TOOLTIPS.greatCircle} />
              </h4>
              {pathMode === "short" && (
                <span className="text-[9px] uppercase tracking-wider text-plasma-orange bg-plasma-orange/20 px-1.5 py-0.5 rounded">
                  Active
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MetricItem
                label="Distance"
                value={formatDistance(metrics.shortPath.distance)}
                valueClassName={getDistanceColor(metrics.difficulty)}
              />
              <MetricItem
                label={
                  <>
                    Bearing <InfoTip content={GEOGRAPHY_TOOLTIPS.bearing} />
                  </>
                }
                value={`${Math.round(metrics.shortPath.bearing)}°`}
                subValue={formatBearing(metrics.shortPath.bearing)}
              />
              <MetricItem
                label="Return"
                value={`${Math.round(metrics.shortPath.reciprocal)}°`}
                subValue={formatBearing(metrics.shortPath.reciprocal)}
              />
            </div>
          </div>

          {/* Long Path */}
          <div
            className={`space-y-2 pt-3 mt-3 rounded-lg p-2 transition-colors ${
              pathMode === "long"
                ? "bg-plasma-orange/10 border border-plasma-orange/20"
                : "bg-white/5 border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-medium text-gray-400 inline-flex items-center gap-1">
                Long Path <InfoTip content={GEOGRAPHY_TOOLTIPS.greatCircle} />
              </h4>
              {pathMode === "long" && (
                <span className="text-[9px] uppercase tracking-wider text-plasma-orange bg-plasma-orange/20 px-1.5 py-0.5 rounded">
                  Active
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MetricItem
                label="Distance"
                value={formatDistance(metrics.longPath.distance)}
                valueClassName={getLongPathDistanceColor(metrics.difficulty)}
              />
              <MetricItem
                label={
                  <>
                    Bearing <InfoTip content={GEOGRAPHY_TOOLTIPS.bearing} />
                  </>
                }
                value={`${Math.round(metrics.longPath.bearing)}°`}
                subValue={formatBearing(metrics.longPath.bearing)}
              />
              <MetricItem
                label="Return"
                value={`${Math.round(metrics.longPath.reciprocal)}°`}
                subValue={formatBearing(metrics.longPath.reciprocal)}
              />
            </div>
          </div>

          {/* Propagation Info */}
          <div className="space-y-2 pt-3 border-t border-white/5 mt-3">
            <h4 className="text-xs font-medium text-gray-400">Propagation</h4>
            <div className="grid grid-cols-3 gap-2">
              <MetricItem
                label="Est. Hops"
                value={`${metrics.hops}`}
                subValue="F-layer"
                valueClassName={getHopsColor(metrics.hops)}
              />
              <MetricItem
                label="Path Light"
                value={`${Math.round(illumination)}%`}
                subValue={illumination > 50 ? "Day" : "Night"}
                valueClassName={getIlluminationColor(illumination)}
              />
              <MetricItem
                label="Midpoint"
                value={`${metrics.midpoint.lat.toFixed(0)}°`}
                subValue={`${metrics.midpoint.lon.toFixed(0)}°`}
              />
            </div>

            {/* Terrain at Bounce Points */}
            {metrics.hops > 1 && (
              <TerrainBounceDisplay
                startLat={station.lat}
                startLon={station.lon}
                endLat={target.lat}
                endLon={target.lon}
                hops={metrics.hops}
              />
            )}
          </div>

          {/* Frequency Limits Section */}
          <FrequencyLimitsDisplay limits={frequencyLimits} />

          {/* Radio Suggestions Section */}
          {analysisRadio && (
            <RadioSuggestions
              radio={analysisRadio}
              radioInstance={analysisRadioInstance}
              preferTested={preferTested}
              difficulty={metrics.difficulty}
              distance={metrics.shortPath.distance}
              onChange={() => setShowRadioPicker(true)}
              onUseProfile={
                analysisRadioId !== null
                  ? () => setAnalysisRadioId(null)
                  : undefined
              }
            />
          )}

          {/* Target coordinates footer */}
          <div className="mt-auto pt-3 border-t border-white/5 text-xs text-gray-400 font-mono flex-shrink-0">
            {target.lat.toFixed(2)}°, {target.lon.toFixed(2)}°
            {target.grid && <span className="ml-1">({target.grid})</span>}
          </div>
        </div>

        {/* Scroll indicator - shows when more content below */}
        {showScrollIndicator && (
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
            <div className="h-8 bg-gradient-to-t from-nebula-blue/90 to-transparent" />
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex flex-col items-center text-gray-400 animate-bounce">
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
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Save Target Modal */}
      <DetailModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        title="Save Target"
        subtitle={`${target.grid ?? ""} ${target.lat.toFixed(2)}°, ${target.lon.toFixed(2)}°`.trim()}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="target-name"
              className="block text-sm font-medium text-gray-200 mb-1"
            >
              Target Name
            </label>
            <input
              type="text"
              id="target-name"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="e.g., DX Station, Contest Target"
              className="w-full px-3 py-2 bg-deep-space/70 border border-white/10 rounded-lg
                         text-white placeholder-gray-400
                         focus:outline-none focus:border-plasma-orange/50"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && targetName.trim()) {
                  handleSaveTarget();
                } else if (e.key === "Escape") {
                  setShowSaveModal(false);
                }
              }}
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowSaveModal(false)}
              className="flex-1 px-4 py-2 bg-nebula-blue/60 border border-white/10 rounded-lg
                         text-gray-200 hover:text-white hover:border-white/20
                         transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveTarget}
              disabled={!targetName.trim()}
              className="flex-1 px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg
                         text-plasma-orange hover:bg-plasma-orange/30
                         transition-colors font-medium text-sm
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </DetailModal>

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title={HELP_CONTENT.pathAnalysis.title}
        sections={HELP_CONTENT.pathAnalysis.sections}
      />

      <RadioPickerModal
        isOpen={showRadioPicker}
        onClose={() => setShowRadioPicker(false)}
        value={{ radioId: analysisRadioId }}
        onChange={(next) => setAnalysisRadioId(next.radioId)}
        title="Path Analysis Radio Profile"
      />
    </Card>
  );
}

/**
 * Individual metric display item
 * Memoized to prevent unnecessary re-renders
 */
const MetricItem = memo(function MetricItem({
  label,
  value,
  subValue,
  valueClassName,
}: {
  label: ReactNode;
  value: string;
  subValue?: string;
  valueClassName?: string;
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-gray-400 mb-0.5 inline-flex items-center justify-center gap-0.5">
        {label}
      </div>
      <div className={`text-sm font-mono ${valueClassName || "text-white"}`}>
        {value}
      </div>
      {subValue && <div className="text-xs text-gray-400">{subValue}</div>}
    </div>
  );
});

/**
 * Frequency Limits display component - compact version
 * Memoized to prevent re-renders when parent re-renders
 */
const FrequencyLimitsDisplay = memo(function FrequencyLimitsDisplay({
  limits,
}: {
  limits: FrequencyLimits | null;
}) {
  if (!limits) {
    return (
      <div className="space-y-2 pt-3 border-t border-white/5 mt-3">
        <h4 className="text-xs font-medium text-gray-400">Freq Limits</h4>
        <div className="p-2 rounded-lg border border-white/10 bg-white/5 text-center text-gray-400 text-xs">
          Calculating...
        </div>
      </div>
    );
  }

  const getMufColor = (muf: number): string => {
    if (muf >= 21) {
      return "text-signal-green";
    }
    if (muf >= 14) {
      return "text-good";
    }
    if (muf >= 7) {
      return "text-caution-amber";
    }
    return "text-alert-red";
  };

  const getLufColor = (luf: number): string => {
    if (luf <= 3) {
      return "text-signal-green";
    }
    if (luf <= 5) {
      return "text-good";
    }
    if (luf <= 8) {
      return "text-caution-amber";
    }
    return "text-alert-red";
  };

  return (
    <div className="space-y-2 pt-3 border-t border-white/5 mt-3">
      <h4 className="text-xs font-medium text-gray-400">Freq Limits</h4>
      <div className="p-2 rounded-lg border border-white/10 bg-white/5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 inline-flex items-center gap-0.5">
              MUF: <InfoTip content={PROPAGATION_TOOLTIPS.muf} />
            </span>
            <span className={getMufColor(limits.muf)}>
              {limits.muf.toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 inline-flex items-center gap-0.5">
              FOT: <InfoTip content={PROPAGATION_TOOLTIPS.fot} />
            </span>
            <span className="text-white">{limits.fot.toFixed(1)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 inline-flex items-center gap-0.5">
              LUF: <InfoTip content={PROPAGATION_TOOLTIPS.luf} />
            </span>
            <span className={getLufColor(limits.luf)}>
              {limits.luf.toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 inline-flex items-center gap-0.5">
              HPF: <InfoTip content={PROPAGATION_TOOLTIPS.hpf} />
            </span>
            <span className="text-white">{limits.hpf.toFixed(1)}</span>
          </div>
        </div>
        {/* Compact frequency window bar */}
        <FrequencyWindowBar limits={limits} />
      </div>
    </div>
  );
});

/**
 * Visual frequency window bar - compact version
 * Memoized to prevent re-renders
 */
const FrequencyWindowBar = memo(function FrequencyWindowBar({
  limits,
}: {
  limits: FrequencyLimits;
}) {
  const minFreq = 1.8;
  const maxFreq = 30;
  const range = maxFreq - minFreq;

  const lufPercent = ((limits.luf - minFreq) / range) * 100;
  const mufPercent = ((limits.muf - minFreq) / range) * 100;
  const fotPercent = ((limits.fot - minFreq) / range) * 100;

  return (
    <div className="mt-2 relative h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div
        className="absolute top-0 left-0 h-full bg-alert-red/30"
        style={{ width: `${lufPercent}%` }}
      />
      <div
        className="absolute top-0 h-full bg-signal-green/40"
        style={{
          left: `${lufPercent}%`,
          width: `${mufPercent - lufPercent}%`,
        }}
      />
      <div
        className="absolute top-0 h-full w-0.5 bg-signal-green"
        style={{ left: `${fotPercent}%` }}
      />
      <div
        className="absolute top-0 h-full w-0.5 bg-caution-amber"
        style={{ left: `${mufPercent}%` }}
      />
    </div>
  );
});

/**
 * Radio-specific suggestions based on path difficulty and active radio
 * Memoized to prevent re-renders when parent state changes
 */
const RadioSuggestions = memo(function RadioSuggestions({
  radio,
  radioInstance,
  preferTested,
  difficulty,
  distance,
  onChange,
  onUseProfile,
}: {
  radio: RadioEquipment;
  radioInstance: {
    customPowerLimit?: number;
    specPreference?: "global" | "factory" | "tested";
  } | null;
  preferTested: boolean;
  difficulty: number;
  distance: number;
  onChange: () => void;
  onUseProfile?: () => void;
}) {
  const effectivePreferTested =
    radioInstance?.specPreference === "factory"
      ? false
      : radioInstance?.specPreference === "tested"
        ? true
        : preferTested;
  const effectiveReceiver = getEffectiveReceiverSpecs(
    radio,
    effectivePreferTested,
  );

  // Calculate suggested power based on path difficulty
  const suggestedPower = useMemo(() => {
    // Base power increases with difficulty
    const basePowers = [10, 25, 50, 75, 100]; // W per difficulty level 1-5
    const basePower = basePowers[Math.min(difficulty - 1, 4)] || 50;

    // Adjust for distance (longer paths need more power)
    const distanceFactor = Math.min(2, 1 + distance / 15000);
    const adjusted = Math.round(basePower * distanceFactor);

    // Cap at radio's max power
    const cap =
      typeof radioInstance?.customPowerLimit === "number" &&
      Number.isFinite(radioInstance.customPowerLimit) &&
      radioInstance.customPowerLimit > 0
        ? Math.min(radio.maxPower, radioInstance.customPowerLimit)
        : radio.maxPower;
    return Math.min(adjusted, cap);
  }, [difficulty, distance, radio.maxPower, radioInstance?.customPowerLimit]);

  // Receiver quality assessment
  const rxScore = calculateReceiverScore(effectiveReceiver);
  const rxQuality =
    rxScore >= 80
      ? "Excellent"
      : rxScore >= 60
        ? "Good"
        : rxScore >= 40
          ? "Adequate"
          : "Limited";
  const rxColor =
    rxScore >= 80
      ? "text-signal-green"
      : rxScore >= 60
        ? "text-good"
        : rxScore >= 40
          ? "text-caution-amber"
          : "text-alert-red";

  // Difficulty-adjusted receiver assessment
  const rxAdequate = useMemo(() => {
    // Higher difficulty paths need better receivers
    const requiredScore = difficulty * 15; // 15, 30, 45, 60, 75
    return rxScore >= requiredScore;
  }, [rxScore, difficulty]);

  return (
    <div className="space-y-2 pt-3 border-t border-white/5 mt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-gray-400">Active Radio</h4>
        <div className="flex items-center gap-2">
          {onUseProfile && (
            <button
              type="button"
              onClick={onUseProfile}
              className="px-2 py-1 text-xs rounded bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-white/20 transition-colors"
              title="Use active profile radio"
            >
              Use profile
            </button>
          )}
          <button
            type="button"
            onClick={onChange}
            className="px-2 py-1 text-xs rounded bg-plasma-orange/20 border border-plasma-orange/40 text-plasma-orange hover:bg-plasma-orange/30 transition-colors"
          >
            Change
          </button>
        </div>
      </div>
      <div className="text-sm font-semibold text-white">
        {radio.manufacturer} {radio.model}
      </div>
      <div className="p-2 rounded-lg border border-white/10 bg-white/5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Power:</span>
            <span className="text-plasma-orange">{suggestedPower}W</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Max:</span>
            <span className="text-white">{radio.maxPower}W</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">RX:</span>
            <span className={rxColor}>{rxQuality}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">For path:</span>
            <span
              className={
                rxAdequate ? "text-signal-green" : "text-caution-amber"
              }
            >
              {rxAdequate ? "OK" : "Marginal"}
            </span>
          </div>
        </div>
        {!rxAdequate && (
          <p className="mt-2 text-xs text-caution-amber">
            Consider narrow filters or quieter bands for this difficult path.
          </p>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Terrain bounce display
// ---------------------------------------------------------------------------

const TerrainBounceDisplay = memo(function TerrainBounceDisplay({
  startLat,
  startLon,
  endLat,
  endLon,
  hops,
}: {
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  hops: number;
}) {
  const terrainData = useMemo(() => {
    const numBounces = hops - 1;
    if (numBounces <= 0) return null;

    const types: TerrainType[] = [];
    for (let i = 1; i < hops; i++) {
      const fraction = i / hops;
      const lat = startLat + (endLat - startLat) * fraction;
      const lon = startLon + (endLon - startLon) * fraction;
      types.push(classifyTerrain(lat, lon));
    }
    const totalLoss = getPathTerrainLoss(types, 14);
    return { types, totalLoss };
  }, [startLat, startLon, endLat, endLon, hops]);

  if (!terrainData) return null;

  return (
    <div className="mt-2 p-2 rounded-lg border border-white/10 bg-white/5">
      <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">
        Ground Bounce Terrain
      </div>
      <div className="flex flex-wrap gap-1.5">
        {terrainData.types.map((t, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-0.5 text-xs text-gray-300"
            title={`Bounce ${i + 1}: ${getTerrainLabel(t)}`}
          >
            <span>{getTerrainIcon(t)}</span>
            <span className="font-mono text-[10px]">{getTerrainLabel(t)}</span>
          </span>
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-mono mt-1">
        <span className="text-gray-400">Terrain loss:</span>
        <span className="text-caution-amber">
          {terrainData.totalLoss.toFixed(1)} dB
        </span>
      </div>
    </div>
  );
});

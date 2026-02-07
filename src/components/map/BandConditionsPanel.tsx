/**
 * BandConditionsPanel Component
 *
 * Standalone panel displaying band-by-band propagation conditions
 * with S-meter indicators, SNR estimates, and status information.
 * Designed for left-side framed layout position.
 *
 * Performance optimized with React.memo for expensive sub-components.
 */

import { useMemo, useState, useRef, useEffect, useCallback, memo } from "react";
import { formatDistanceToNow } from "date-fns";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore, useUIInteractionPrefs } from "@/stores/userStore";
import { useActiveStationGain } from "@/hooks/useActiveStationGain";
import { useDXStore } from "@/stores/dxStore";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getPathIllumination, getDistance } from "@/lib/utils/path";
import { getAntennaGainForPath } from "@/lib/data/antennas";
import {
  getBandConditionsForPath,
  getEnhancedBandConditions,
  getPathStatusColor,
  getPathStatusBgColor,
  type PathBandCondition,
} from "@/lib/utils/bands";
import {
  getGreylineStatus,
  isGreylineActiveForBand,
  type GreylineIntensity,
} from "@/lib/utils/greyline";
import { Card } from "@/components/ui/Card";
import { InfoTip } from "@/components/ui/Tooltip";
import { PROPAGATION_TOOLTIPS } from "@/constants/tooltips";
import { HelpButton, HelpModal, HELP_CONTENT } from "@/components/ui/HelpModal";
import type { SUnit } from "@/types/signal";
import { CorrelationIndicator } from "./CorrelationIndicator";
import {
  aggregateCorrelation,
  type BandCorrelationSummary,
} from "@/lib/utils/spotCorrelation";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { detectEsOpening, type EsDetection } from "@/lib/utils/sporadicE";
import {
  BandOpeningDetector,
  type BandOpening,
} from "@/lib/services/bandOpeningDetector";

interface BandConditionsPanelProps {
  displayTime: Date;
  className?: string;
  compact?: boolean;
  /** When true, panel collapses to a slim summary bar */
  collapsed?: boolean;
  /** Callback to toggle collapsed state */
  onToggleCollapse?: () => void;
}

/**
 * Find the best band from conditions (for collapsed view)
 */
function findBestBand(
  conditions: PathBandCondition[],
): PathBandCondition | null {
  if (conditions.length === 0) {
    return null;
  }

  const statusPriority: Record<PathBandCondition["status"], number> = {
    excellent: 5,
    good: 4,
    fair: 3,
    poor: 2,
    closed: 1,
  };

  const sorted = [...conditions].sort((a, b) => {
    const priorityDiff = statusPriority[b.status] - statusPriority[a.status];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return b.snrEstimate - a.snrEstimate;
  });

  return sorted[0];
}

/**
 * Get overall status from conditions (for collapsed view)
 */
function getOverallStatus(
  conditions: PathBandCondition[],
): "good" | "fair" | "poor" {
  if (conditions.length === 0) {
    return "poor";
  }

  const statusCounts = conditions.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const total = conditions.length;
  const excellentGood =
    (statusCounts["excellent"] || 0) + (statusCounts["good"] || 0);
  const fair = statusCounts["fair"] || 0;

  if (excellentGood >= total * 0.4) {
    return "good";
  }
  if (excellentGood + fair >= total * 0.5) {
    return "fair";
  }
  return "poor";
}

// =============================================================================
// GRID VIEW COMPONENTS (High-Viz Mode)
// =============================================================================

/** Status-to-color mapping for grid cells */
const GRID_STATUS_COLORS: Record<
  PathBandCondition["status"],
  { bg: string; border: string; text: string }
> = {
  excellent: {
    bg: "rgba(0, 255, 136, 0.20)",
    border: "rgba(0, 255, 136, 0.2)",
    text: "#00ff88",
  },
  good: {
    bg: "rgba(0, 255, 136, 0.15)",
    border: "rgba(0, 255, 136, 0.15)",
    text: "#00ff88",
  },
  fair: {
    bg: "rgba(255, 180, 50, 0.15)",
    border: "rgba(255, 180, 50, 0.15)",
    text: "#ffb432",
  },
  poor: {
    bg: "rgba(255, 68, 102, 0.15)",
    border: "rgba(255, 68, 102, 0.15)",
    text: "#ff4466",
  },
  closed: {
    bg: "rgba(128, 128, 128, 0.10)",
    border: "rgba(128, 128, 128, 0.2)",
    text: "#666666",
  },
};

interface BandConditionGridCellProps {
  condition: PathBandCondition;
  isSynced: boolean;
  isEsActive?: boolean;
  hasBandOpening?: boolean;
}

function gridCellPropsAreEqual(
  prevProps: BandConditionGridCellProps,
  nextProps: BandConditionGridCellProps,
): boolean {
  return (
    prevProps.condition.band === nextProps.condition.band &&
    prevProps.condition.status === nextProps.condition.status &&
    prevProps.isSynced === nextProps.isSynced &&
    prevProps.isEsActive === nextProps.isEsActive &&
    prevProps.hasBandOpening === nextProps.hasBandOpening
  );
}

const BandConditionGridCell = memo(function BandConditionGridCell({
  condition,
  isSynced,
  isEsActive,
  hasBandOpening,
}: BandConditionGridCellProps) {
  const colors = GRID_STATUS_COLORS[condition.status];
  const statusLabel =
    condition.status === "closed" ? "CLOSED" : condition.status.toUpperCase();

  return (
    <div
      style={{
        padding: "6px 4px",
        borderRadius: "4px",
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        textAlign: "center",
        position: "relative",
        ...(isSynced
          ? { boxShadow: "inset 0 0 0 1px rgba(34, 211, 238, 0.5)" }
          : {}),
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 700,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          color: isSynced ? "#22d3ee" : "#ffffff",
          lineHeight: 1.3,
        }}
      >
        {condition.band}
      </div>
      <div
        style={{
          fontSize: "9px",
          fontWeight: 600,
          color: colors.text,
          lineHeight: 1.4,
          letterSpacing: "0.03em",
        }}
      >
        {isEsActive ? (
          <span style={{ color: "#a855f7" }}>Es</span>
        ) : hasBandOpening ? (
          <span style={{ color: "#00ff88" }}>OPEN</span>
        ) : (
          statusLabel
        )}
      </div>
    </div>
  );
}, gridCellPropsAreEqual);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function BandConditionsPanel({
  displayTime,
  className = "",
  compact = false,
  collapsed = false,
  onToggleCollapse,
}: BandConditionsPanelProps) {
  const target = useMapStore((s) => s.target);
  const showCorrelation = useMapStore((s) => s.showCorrelation);
  const station = useUserStore((s) => s.station);
  const { antennaType } = useActiveStationGain();
  const syncMode = useDXStore((s) => s.syncMode);
  const syncedBand = useDXStore((s) => s.syncedBand);
  const uiPrefs = useUIInteractionPrefs();
  const isGridView = uiPrefs.visualStyle === "high-viz";
  const [showHelp, setShowHelp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

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
    // Recheck on resize
    const resizeObserver = new ResizeObserver(checkScroll);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      resizeObserver.disconnect();
    };
  }, [checkScroll, collapsed]);

  // Fetch current solar data with refresh capabilities
  const {
    data: kIndexData,
    dataUpdatedAt: kIndexUpdatedAt,
    isRefetching: isKIndexRefetching,
    refetch: refetchKIndex,
  } = useKIndex();
  const {
    data: solarFluxData,
    dataUpdatedAt: sfiUpdatedAt,
    isRefetching: isSfiRefetching,
    refetch: refetchSfi,
  } = useSolarFlux();

  // Combined refresh state - use most recent update time
  const lastUpdatedAt = useMemo(() => {
    return Math.max(kIndexUpdatedAt || 0, sfiUpdatedAt || 0);
  }, [kIndexUpdatedAt, sfiUpdatedAt]);

  const isRefetching = isKIndexRefetching || isSfiRefetching;

  // Manual refresh handler
  const handleRefresh = useCallback(() => {
    refetchKIndex();
    refetchSfi();
  }, [refetchKIndex, refetchSfi]);

  // Format last updated time
  const lastUpdatedText = useMemo(() => {
    if (!lastUpdatedAt) {
      return "Never";
    }
    return formatDistanceToNow(new Date(lastUpdatedAt), { addSuffix: false });
  }, [lastUpdatedAt]);

  // Get current Kp and SFI values
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) {
      return 3;
    }
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) {
      return 100;
    }
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

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

  // Calculate basic band conditions (fallback)
  const basicBandConditions = useMemo(() => {
    if (!station || !target) {
      return [];
    }
    return getBandConditionsForPath(
      station.lat,
      station.lon,
      target.lat,
      target.lon,
      currentKp,
      currentSfi,
      illumination,
    );
  }, [station, target, currentKp, currentSfi, illumination]);

  // Calculate enhanced band conditions with S-unit readings
  const enhancedBandConditions = useMemo(() => {
    if (!station || !target) {
      return null;
    }
    try {
      const distance = getDistance(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
      );
      const antennaGainDbi = getAntennaGainForPath(antennaType, distance);
      return getEnhancedBandConditions(
        station.lat,
        station.lon,
        target.lat,
        target.lon,
        currentKp,
        currentSfi,
        displayTime,
        100, // Default 100W TX power
        "FT8", // Default to FT8 mode
        antennaGainDbi,
      );
    } catch {
      return null;
    }
  }, [station, target, currentKp, currentSfi, displayTime, antennaType]);

  // Use enhanced conditions if available
  const bandConditions = enhancedBandConditions || basicBandConditions;

  // Calculate greyline status based on station location
  const greylineIntensity = useMemo((): GreylineIntensity => {
    if (!station) {
      return "none";
    }
    const status = getGreylineStatus(station.lat, station.lon, displayTime);
    return status.intensity;
  }, [station, displayTime]);

  // Fetch live spots for correlation analysis
  const { spots: liveSpots } = useLiveSpots({
    grid: station?.grid,
    enabled: showCorrelation,
  });

  // Compute per-band correlation summaries from live spots and model predictions
  const correlationMap = useMemo((): Map<string, BandCorrelationSummary> => {
    if (!showCorrelation || !bandConditions.length || liveSpots.length === 0) {
      return new Map();
    }

    // Build predictions map from current band conditions
    const predictions: Record<string, string> = {};
    for (const bc of bandConditions) {
      predictions[bc.band] = bc.status;
    }

    const summaries = aggregateCorrelation(liveSpots, predictions);
    const map = new Map<string, BandCorrelationSummary>();
    for (const s of summaries) {
      map.set(s.band, s);
    }
    return map;
  }, [showCorrelation, bandConditions, liveSpots]);

  // Detect sporadic E openings from live spots (works with LiveSpot which extends DXSpot)
  const esDetection = useMemo((): EsDetection | null => {
    if (liveSpots.length === 0) {
      return null;
    }
    return detectEsOpening(liveSpots);
  }, [liveSpots]);

  // Band opening detector — singleton instance via ref
  const bandOpeningDetectorRef = useRef<BandOpeningDetector | null>(null);
  const [activeOpenings, setActiveOpenings] = useState<BandOpening[]>([]);

  // Initialize the band opening detector once
  useEffect(() => {
    const detector = new BandOpeningDetector();
    bandOpeningDetectorRef.current = detector;

    const unsub = detector.subscribe(() => {
      setActiveOpenings(detector.getCurrentOpenings());
    });

    return () => {
      unsub();
      detector.destroy();
    };
  }, []);

  // Feed live spots to the band opening detector
  useEffect(() => {
    const detector = bandOpeningDetectorRef.current;
    if (!detector || liveSpots.length === 0) {
      return;
    }
    detector.update(liveSpots);
    setActiveOpenings(detector.getCurrentOpenings());
  }, [liveSpots]);

  // Build a set of bands with active openings for quick lookup
  const openingBands = useMemo((): Set<string> => {
    const set = new Set<string>();
    for (const opening of activeOpenings) {
      if (opening.isActive) {
        set.add(opening.band);
      }
    }
    return set;
  }, [activeOpenings]);

  // No station configured
  if (!station) {
    return (
      <>
        <Card className={`${className} h-full p-2 !rounded-lg`}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide flex items-center gap-1">
                Band Conditions
                <InfoTip content={PROPAGATION_TOOLTIPS.bandCondition} />
              </h3>
              <div className="flex items-center gap-1 flex-shrink-0">
                <HelpButton onClick={() => setShowHelp(true)} />
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Set your QTH in settings
            </div>
          </div>
        </Card>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.bandConditions.title}
          sections={HELP_CONTENT.bandConditions.sections}
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
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide flex items-center gap-1">
                Band Conditions
                <InfoTip content={PROPAGATION_TOOLTIPS.bandCondition} />
              </h3>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    currentKp >= 4
                      ? "bg-caution-amber/20 text-caution-amber"
                      : "bg-white/5 text-gray-400"
                  }`}
                >
                  Kp {currentKp}
                </span>
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    currentSfi >= 120
                      ? "bg-signal-green/20 text-signal-green"
                      : "bg-white/5 text-gray-400"
                  }`}
                >
                  SFI {currentSfi}
                </span>
                <HelpButton onClick={() => setShowHelp(true)} />
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm text-center px-4">
              Click on the map to select a target
            </div>
          </div>
        </Card>

        <HelpModal
          isOpen={showHelp}
          onClose={() => setShowHelp(false)}
          title={HELP_CONTENT.bandConditions.title}
          sections={HELP_CONTENT.bandConditions.sections}
        />
      </>
    );
  }

  // Get best band and overall status for collapsed view
  const bestBand = findBestBand(bandConditions);
  const overallStatus = getOverallStatus(bandConditions);

  // Status colors for collapsed view
  const statusColors = {
    good: {
      dot: "bg-signal-green",
      text: "text-signal-green",
      bg: "bg-signal-green/10",
    },
    fair: {
      dot: "bg-caution-amber",
      text: "text-caution-amber",
      bg: "bg-caution-amber/10",
    },
    poor: {
      dot: "bg-alert-red",
      text: "text-alert-red",
      bg: "bg-alert-red/10",
    },
  };

  return (
    <>
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

              {/* Status dot */}
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[overallStatus].dot}`}
              />

              {/* Best band with status */}
              {bestBand ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-mono font-semibold ${getPathStatusColor(
                      bestBand.status,
                    )}`}
                  >
                    {bestBand.band}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${statusColors[overallStatus].text} ${statusColors[overallStatus].bg}`}
                  >
                    {overallStatus}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-gray-500">No data</span>
              )}

              {/* Divider */}
              <div className="w-px h-3 bg-white/10" />

              {/* Solar indices compact */}
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span
                  className={
                    currentKp >= 4 ? "text-caution-amber" : "text-gray-400"
                  }
                >
                  K{currentKp}
                </span>
                <span
                  className={
                    currentSfi >= 120 ? "text-signal-green" : "text-gray-400"
                  }
                >
                  SFI {currentSfi}
                </span>
              </div>
            </div>
          ) : (
            /* EXPANDED: Header with title left, badges + icons right */
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

                {/* Status dot */}
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[overallStatus].dot}`}
                />

                <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide truncate flex items-center gap-1">
                  Band Conditions
                  <InfoTip content={PROPAGATION_TOOLTIPS.bandCondition} />
                </h3>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    currentKp >= 4
                      ? "bg-caution-amber/20 text-caution-amber"
                      : "bg-white/5 text-gray-400"
                  }`}
                >
                  Kp {currentKp}
                </span>
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    currentSfi >= 120
                      ? "bg-signal-green/20 text-signal-green"
                      : "bg-white/5 text-gray-400"
                  }`}
                >
                  SFI {currentSfi}
                </span>
                <HelpButton onClick={() => setShowHelp(true)} />
              </div>
            </>
          )}
        </div>

        {/* Collapsible content with smooth animation */}
        <div
          className={`transition-all duration-300 ease-in-out overflow-hidden ${
            collapsed ? "max-h-0 opacity-0" : "max-h-[1000px] opacity-100"
          }`}
        >
          {/* Band conditions content — grid view (high-viz) or table view (realistic) */}
          <div className="relative flex-1 min-h-0 mt-3">
            <div
              ref={scrollRef}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide -mx-1"
            >
              {isGridView ? (
                /* Grid View — compact auto-flow grid inspired by OpenHamClock */
                <div
                  className="px-1"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(50px, 1fr))",
                    gap: "6px",
                  }}
                >
                  {bandConditions.map((condition) => (
                    <BandConditionGridCell
                      key={condition.band}
                      condition={condition}
                      isSynced={syncMode && syncedBand === condition.band}
                      isEsActive={
                        (condition.band === "6m" || condition.band === "10m") &&
                        esDetection?.active === true &&
                        esDetection.bands.includes(condition.band)
                      }
                      hasBandOpening={openingBands.has(condition.band)}
                    />
                  ))}
                </div>
              ) : (
                /* Table View — original detailed layout */
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-nebula-blue text-gray-400">
                      <th className="px-1 py-1 text-left font-medium">Band</th>
                      <th className="px-1 py-1 text-center font-medium">
                        Status
                      </th>
                      {!compact && (
                        <>
                          <th className="px-1 py-1 text-center font-medium">
                            Signal
                          </th>
                          <th className="px-1 py-1 text-center font-medium">
                            SNR
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {bandConditions.map((condition) => (
                      <BandConditionRow
                        key={condition.band}
                        condition={condition}
                        hasEnhancedData={!!enhancedBandConditions}
                        compact={compact}
                        isSynced={syncMode && syncedBand === condition.band}
                        greylineIntensity={greylineIntensity}
                        correlation={
                          showCorrelation
                            ? correlationMap.get(condition.band)
                            : undefined
                        }
                        esDetection={
                          (condition.band === "6m" ||
                            condition.band === "10m") &&
                          esDetection?.active &&
                          esDetection.bands.includes(condition.band)
                            ? esDetection
                            : undefined
                        }
                        hasBandOpening={openingBands.has(condition.band)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
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

          {/* Footer with path info and refresh */}
          <div className="flex-shrink-0 pt-2 mt-2 border-t border-white/5">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Path illumination: {Math.round(illumination)}%</span>
            </div>
            <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-white/5">
              <span className="text-[10px] text-gray-500">
                Updated {lastUpdatedText} ago
              </span>
              <button
                onClick={handleRefresh}
                disabled={isRefetching}
                className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
                title="Refresh band conditions"
                aria-label="Refresh band conditions"
              >
                <svg
                  className={`w-3.5 h-3.5 text-gray-400 ${isRefetching ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title={HELP_CONTENT.bandConditions.title}
        sections={HELP_CONTENT.bandConditions.sections}
      />
    </>
  );
}

/**
 * Props for BandConditionRow
 */
interface BandConditionRowProps {
  condition: PathBandCondition;
  hasEnhancedData: boolean;
  compact: boolean;
  isSynced: boolean;
  greylineIntensity: GreylineIntensity;
  /** Correlation summary for this band (when showCorrelation is on) */
  correlation?: BandCorrelationSummary;
  /** Active Es detection for this band (6m/10m only) */
  esDetection?: EsDetection;
  /** Whether this band has an active opening detected */
  hasBandOpening?: boolean;
}

/**
 * Comparison function for BandConditionRow memo
 */
function bandConditionRowPropsAreEqual(
  prevProps: BandConditionRowProps,
  nextProps: BandConditionRowProps,
): boolean {
  return (
    prevProps.condition.band === nextProps.condition.band &&
    prevProps.condition.status === nextProps.condition.status &&
    prevProps.condition.snrEstimate === nextProps.condition.snrEstimate &&
    prevProps.condition.sUnit?.value === nextProps.condition.sUnit?.value &&
    prevProps.condition.signalPrediction?.confidenceLow ===
      nextProps.condition.signalPrediction?.confidenceLow &&
    prevProps.condition.signalPrediction?.snrLow ===
      nextProps.condition.signalPrediction?.snrLow &&
    prevProps.hasEnhancedData === nextProps.hasEnhancedData &&
    prevProps.compact === nextProps.compact &&
    prevProps.isSynced === nextProps.isSynced &&
    prevProps.greylineIntensity === nextProps.greylineIntensity &&
    prevProps.correlation?.agreement === nextProps.correlation?.agreement &&
    prevProps.correlation?.spotCount === nextProps.correlation?.spotCount &&
    prevProps.esDetection?.active === nextProps.esDetection?.active &&
    prevProps.hasBandOpening === nextProps.hasBandOpening
  );
}

/**
 * Band condition table row
 * Memoized to prevent unnecessary re-renders when other rows change
 */
const BandConditionRow = memo(function BandConditionRow({
  condition,
  hasEnhancedData,
  compact,
  isSynced,
  greylineIntensity,
  correlation,
  esDetection,
  hasBandOpening,
}: BandConditionRowProps) {
  const statusColor = getPathStatusColor(condition.status);
  const statusBgColor = getPathStatusBgColor(condition.status);
  const statusLabel =
    condition.status.charAt(0).toUpperCase() + condition.status.slice(1);

  const sUnitText = condition.sUnit?.text || "N/A";
  const sUnitColor = getSUnitColor(condition.sUnit);

  // Check if greyline is active for this band (low bands only)
  const isGreylineActive = isGreylineActiveForBand(
    condition.band,
    greylineIntensity,
  );

  return (
    <tr
      className={`hover:bg-white/5 transition-colors ${
        isSynced ? "bg-cyan-500/10 border-l-2 border-cyan-400" : ""
      } ${isGreylineActive ? "bg-amber-500/5" : ""}`}
    >
      <td className="px-1 py-1">
        <div className="flex items-center gap-1.5">
          {isSynced && (
            <svg
              className="w-3 h-3 text-cyan-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          )}
          <div
            className={`font-mono text-sm ${isSynced ? "text-cyan-400" : "text-white"}`}
          >
            {condition.band}
          </div>
          {/* Greyline active indicator for low bands */}
          {isGreylineActive && (
            <span
              className="px-1 py-0.5 rounded text-[9px] font-medium bg-amber-500/20 text-amber-400 animate-pulse"
              title="Greyline propagation enhanced for this band"
            >
              GL
            </span>
          )}
          {/* Es Active badge for 6m/10m */}
          {esDetection?.active && (
            <span
              className="px-1 py-0.5 rounded text-[9px] font-semibold bg-purple-500/20 text-purple-400 animate-pulse"
              title={`Sporadic E detected: ${esDetection.spotCount} spots, est. MUF ${esDetection.estimatedMUFMHz} MHz`}
            >
              Es
            </span>
          )}
          {/* Band opening indicator */}
          {hasBandOpening && (
            <span
              className="px-1 py-0.5 rounded text-[9px] font-semibold bg-signal-green/20 text-signal-green animate-pulse"
              title="Band opening detected"
            >
              OPEN
            </span>
          )}
        </div>
        <div className="text-gray-400 text-xs">{condition.frequency}</div>
      </td>
      <td className="px-1 py-1 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span
            className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-medium ${statusColor} ${statusBgColor}`}
          >
            {statusLabel}
          </span>
          {/* Correlation indicator beneath status */}
          {correlation && (
            <CorrelationIndicator
              agreement={correlation.agreement}
              confidence={correlation.confidence}
              details={correlation.details}
              spotCount={correlation.spotCount}
              className="mt-0.5"
            />
          )}
        </div>
      </td>
      {!compact && (
        <>
          <td className="px-1 py-1 text-center">
            <div className="flex items-center justify-center gap-0.5">
              <SMeterIndicator sUnit={condition.sUnit} />
              <span className={`font-mono text-xs ${sUnitColor}`}>
                {sUnitText}
              </span>
            </div>
          </td>
          <td className="px-1 py-1 text-center font-mono text-xs">
            {/* SNR display: range when confidence intervals available, point value otherwise */}
            {condition.signalPrediction?.snrLow !== undefined &&
            condition.signalPrediction?.snrHigh !== undefined ? (
              <div
                title={`SNR range: ${condition.signalPrediction.snrLow} to ${condition.signalPrediction.snrHigh} dB (center: ${condition.snrEstimate} dB)`}
              >
                <span
                  className={
                    condition.snrEstimate <= -24
                      ? "text-gray-400"
                      : "text-white"
                  }
                >
                  {condition.signalPrediction.snrLow} to{" "}
                  {condition.signalPrediction.snrHigh}dB
                </span>
              </div>
            ) : (
              <span
                className={
                  condition.snrEstimate <= -24 ? "text-gray-400" : "text-white"
                }
              >
                {condition.snrEstimate}dB
              </span>
            )}
            {/* Confidence interval bar */}
            {condition.signalPrediction?.confidenceLow !== undefined &&
              condition.signalPrediction?.confidenceHigh !== undefined && (
                <ConfidenceBar
                  confidence={condition.signalPrediction.confidence}
                  low={condition.signalPrediction.confidenceLow}
                  high={condition.signalPrediction.confidenceHigh}
                />
              )}
            {hasEnhancedData &&
              condition.pathLoss !== undefined &&
              condition.signalPrediction?.snrLow === undefined && (
                <div className="text-xs text-gray-400">
                  {Math.round(condition.pathLoss)}dB loss
                </div>
              )}
          </td>
        </>
      )}
    </tr>
  );
}, bandConditionRowPropsAreEqual);

/**
 * Get color class for S-unit display
 */
function getSUnitColor(sUnit?: SUnit): string {
  if (!sUnit) {
    return "text-gray-400";
  }
  const { value } = sUnit;
  if (value >= 8) {
    return "text-signal-green";
  }
  if (value >= 5) {
    return "text-caution-amber";
  }
  return "text-alert-red";
}

/**
 * S-meter visual indicator
 * Memoized to prevent re-renders when parent re-renders
 */
const SMeterIndicator = memo(function SMeterIndicator({
  sUnit,
}: {
  sUnit?: SUnit;
}) {
  if (!sUnit) {
    return (
      <div className="flex gap-0.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-1 h-2 rounded-sm bg-gray-700" />
        ))}
      </div>
    );
  }

  const value = sUnit.value;
  const filledBars = Math.min(5, Math.max(1, Math.ceil(value / 2)));

  const getBarColor = (_barIndex: number, filled: boolean): string => {
    if (!filled) {
      return "bg-gray-700";
    }
    if (value >= 8) {
      return "bg-signal-green";
    }
    if (value >= 5) {
      return "bg-caution-amber";
    }
    return "bg-alert-red";
  };

  return (
    <div className="flex gap-0.5" title={`${sUnit.text} (${sUnit.dBm} dBm)`}>
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-sm transition-colors ${getBarColor(i, i < filledBars)}`}
          style={{ height: `${6 + i * 2}px` }}
        />
      ))}
    </div>
  );
});

/**
 * Compact confidence bar showing point estimate with translucent interval range
 * Width: full cell, height: 4px
 * Color: red (low) -> amber (mid) -> green (high)
 */
const ConfidenceBar = memo(function ConfidenceBar({
  confidence,
  low,
  high,
}: {
  confidence: number;
  low: number;
  high: number;
}) {
  // Determine color based on confidence center point
  const barColor =
    confidence >= 70
      ? "#00ff88" // signal-green
      : confidence >= 45
        ? "#ffaa00" // caution-amber
        : "#ff4455"; // alert-red

  return (
    <div
      className="relative w-full h-1 mt-1 rounded-full bg-white/5 overflow-hidden"
      title={`Confidence: ${low}%-${high}% (center: ${confidence}%)`}
    >
      {/* Translucent range (the interval) */}
      <div
        className="absolute top-0 h-full rounded-full"
        style={{
          left: `${low}%`,
          width: `${Math.max(1, high - low)}%`,
          backgroundColor: barColor,
          opacity: 0.25,
        }}
      />
      {/* Solid center point */}
      <div
        className="absolute top-0 h-full rounded-full"
        style={{
          left: `${Math.max(0, confidence - 1)}%`,
          width: "2%",
          backgroundColor: barColor,
          opacity: 0.9,
        }}
      />
    </div>
  );
});

export default BandConditionsPanel;

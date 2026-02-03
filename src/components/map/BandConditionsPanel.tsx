/**
 * BandConditionsPanel Component
 *
 * Standalone panel displaying band-by-band propagation conditions
 * with S-meter indicators, SNR estimates, and status information.
 * Designed for left-side framed layout position.
 */

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { getPathIllumination } from "@/lib/utils/path";
import {
  getBandConditionsForPath,
  getEnhancedBandConditions,
  getPathStatusColor,
  getPathStatusBgColor,
  type PathBandCondition,
} from "@/lib/utils/bands";
import { Card } from "@/components/ui/Card";
import { HelpButton, HelpModal, HELP_CONTENT } from "@/components/ui/HelpModal";
import type { SUnit } from "@/types/signal";

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
  if (conditions.length === 0) return null;

  const statusPriority: Record<PathBandCondition["status"], number> = {
    excellent: 5,
    good: 4,
    fair: 3,
    poor: 2,
    closed: 1,
  };

  const sorted = [...conditions].sort((a, b) => {
    const priorityDiff = statusPriority[b.status] - statusPriority[a.status];
    if (priorityDiff !== 0) return priorityDiff;
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
  if (conditions.length === 0) return "poor";

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

  if (excellentGood >= total * 0.4) return "good";
  if (excellentGood + fair >= total * 0.5) return "fair";
  return "poor";
}

export function BandConditionsPanel({
  displayTime,
  className = "",
  compact = false,
  collapsed = false,
  onToggleCollapse,
}: BandConditionsPanelProps) {
  const { target } = useMapStore();
  const { station } = useUserStore();
  const [showHelp, setShowHelp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

  // Check if content overflows and handle scroll position
  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollHeight > el.clientHeight;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 5;
    setShowScrollIndicator(hasOverflow && !isAtBottom);
  }, []);

  // Set up scroll listener and initial check
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
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

  // Fetch current solar data
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  // Get current Kp and SFI values
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return 3;
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return 100;
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  // Calculate path illumination
  const illumination = useMemo(() => {
    if (!station || !target) return 0;
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
    if (!station || !target) return [];
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
    if (!station || !target) return null;
    try {
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
      );
    } catch {
      return null;
    }
  }, [station, target, currentKp, currentSfi, displayTime]);

  // Use enhanced conditions if available
  const bandConditions = enhancedBandConditions || basicBandConditions;

  // No station configured
  if (!station) {
    return (
      <>
        <Card className={`${className} h-full p-2 !rounded-lg`}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide">
                Band Conditions
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
              <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide">
                Band Conditions
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

                <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide truncate">
                  Band Conditions
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
          {/* Scrollable Table */}
          <div className="relative flex-1 min-h-0 mt-3">
            <div
              ref={scrollRef}
              className="h-full overflow-y-auto overflow-x-hidden scrollbar-hide -mx-1"
            >
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
                    />
                  ))}
                </tbody>
              </table>
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

          {/* Footer with path info */}
          <div className="flex-shrink-0 pt-2 mt-2 border-t border-white/5 text-xs text-gray-400">
            Path illumination: {Math.round(illumination)}%
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
 * Band condition table row
 */
function BandConditionRow({
  condition,
  hasEnhancedData,
  compact,
}: {
  condition: PathBandCondition;
  hasEnhancedData: boolean;
  compact: boolean;
}) {
  const statusColor = getPathStatusColor(condition.status);
  const statusBgColor = getPathStatusBgColor(condition.status);
  const statusLabel =
    condition.status.charAt(0).toUpperCase() + condition.status.slice(1);

  const sUnitText = condition.sUnit?.text || "N/A";
  const sUnitColor = getSUnitColor(condition.sUnit);

  return (
    <tr className="hover:bg-white/5 transition-colors">
      <td className="px-1 py-1">
        <div className="font-mono text-white text-sm">{condition.band}</div>
        <div className="text-gray-400 text-xs">{condition.frequency}</div>
      </td>
      <td className="px-1 py-1 text-center">
        <span
          className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-medium ${statusColor} ${statusBgColor}`}
        >
          {statusLabel}
        </span>
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
            <span
              className={
                condition.snrEstimate <= -24 ? "text-gray-400" : "text-white"
              }
            >
              {condition.snrEstimate}dB
            </span>
            {hasEnhancedData && condition.pathLoss !== undefined && (
              <div className="text-xs text-gray-400">
                {Math.round(condition.pathLoss)}dB loss
              </div>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

/**
 * Get color class for S-unit display
 */
function getSUnitColor(sUnit?: SUnit): string {
  if (!sUnit) return "text-gray-400";
  const value = sUnit.value;
  if (value >= 8) return "text-signal-green";
  if (value >= 5) return "text-caution-amber";
  return "text-alert-red";
}

/**
 * S-meter visual indicator
 */
function SMeterIndicator({ sUnit }: { sUnit?: SUnit }) {
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
    if (!filled) return "bg-gray-700";
    if (value >= 8) return "bg-signal-green";
    if (value >= 5) return "bg-caution-amber";
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
}

export default BandConditionsPanel;

/**
 * PropagationConfidence Component
 *
 * Compact card/badge showing propagation confidence level. In normal mode it
 * displays baseline confidence from analytical models. During active contests,
 * it shows boosted confidence from real-world spot density.
 *
 * Visual features:
 * - Confidence bar (0-100%), color coded (red/yellow/green)
 * - Contest enhancement indicator with golden glow when active
 * - Spot count and band info
 *
 * @module components/solar/PropagationConfidence
 */

import React, { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { useContestPropIntel } from "@/hooks/useContestPropIntel";
import { useContestContext } from "@/hooks/useContestContext";

// ─── Props ──────────────────────────────────────────────────────────────────

interface PropagationConfidenceProps {
  /** Optional band filter (e.g., "20m") */
  band?: string;
  /** Additional CSS classes */
  className?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get confidence level label from 0-1 value.
 */
function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return "VERY HIGH";
  if (confidence >= 0.6) return "HIGH";
  if (confidence >= 0.4) return "MODERATE";
  if (confidence >= 0.2) return "LOW";
  return "VERY LOW";
}

/**
 * Get bar color class from confidence level.
 * Red < 0.3, Yellow 0.3-0.6, Green > 0.6
 */
function getBarColor(confidence: number): string {
  if (confidence >= 0.6) return "bg-signal-green";
  if (confidence >= 0.3) return "bg-caution-amber";
  return "bg-alert-red";
}

/**
 * Get text color class from confidence level.
 */
function getTextColor(confidence: number): string {
  if (confidence >= 0.6) return "text-signal-green";
  if (confidence >= 0.3) return "text-caution-amber";
  return "text-alert-red";
}

/**
 * Format a large number with K suffix for display.
 */
function formatSpotCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

// ─── Component ──────────────────────────────────────────────────────────────

export const PropagationConfidence: React.FC<PropagationConfidenceProps> = ({
  band,
  className = "",
}) => {
  const { confidence, enhancedPaths, loading, isContestEnhanced, density } =
    useContestPropIntel(band);
  const { isContestWeekend, activeContests } = useContestContext();

  // Total spot count from density map
  const totalSpots = useMemo(() => {
    if (!density) return 0;
    let total = 0;
    for (const bucket of density.values()) {
      total += bucket.count;
    }
    return total;
  }, [density]);

  // Active contest name for display
  const contestName = useMemo(() => {
    if (activeContests.length === 0) return null;
    if (activeContests.length === 1) return activeContests[0].name;
    return `${activeContests.length} contests`;
  }, [activeContests]);

  // Description text
  const description = useMemo(() => {
    if (loading) return "Analyzing propagation data...";

    if (isContestEnhanced && contestName) {
      const pathCount = enhancedPaths.length;
      const bandLabel = band ?? "HF";
      return `${formatSpotCount(totalSpots)} active contest stations confirming ${bandLabel} propagation${pathCount > 0 ? ` across ${pathCount} paths` : ""}`;
    }

    if (isContestWeekend) {
      return `Contest active — ${formatSpotCount(totalSpots)} spots in last hour`;
    }

    return `Based on ${totalSpots > 0 ? formatSpotCount(totalSpots) + " spots" : "analytical models"}`;
  }, [
    loading,
    isContestEnhanced,
    isContestWeekend,
    contestName,
    totalSpots,
    enhancedPaths.length,
    band,
  ]);

  const label = getConfidenceLabel(confidence);
  const barColor = getBarColor(confidence);
  const textColor = getTextColor(confidence);
  const percentWidth = Math.round(confidence * 100);

  return (
    <Card
      animate
      className={`relative overflow-hidden ${isContestEnhanced ? "border-yellow-500/30" : ""} ${className}`}
    >
      {/* Contest enhancement golden glow */}
      {isContestEnhanced && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-yellow-500/5 to-transparent pointer-events-none" />
      )}

      <div className="flex flex-col gap-2 relative">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-sans font-semibold uppercase tracking-wide text-gray-300">
            Propagation Confidence
          </span>

          {/* Contest badge */}
          {isContestEnhanced && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Contest Enhanced
            </span>
          )}
        </div>

        {/* Confidence value */}
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-orbitron font-bold ${textColor}`}>
            {label}
          </span>
          <span className="text-sm font-mono text-gray-500">
            {percentWidth}%
          </span>
        </div>

        {/* Confidence bar */}
        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${percentWidth}%` }}
          />
        </div>

        {/* Description */}
        <span className="text-xs font-sans text-gray-400">{description}</span>

        {/* Contest info footer */}
        {isContestWeekend && contestName && (
          <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                isContestEnhanced
                  ? "bg-yellow-400 animate-pulse"
                  : "bg-gray-500"
              }`}
            />
            <span className="text-[11px] text-gray-500 truncate">
              {contestName}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};

PropagationConfidence.displayName = "PropagationConfidence";

export default PropagationConfidence;

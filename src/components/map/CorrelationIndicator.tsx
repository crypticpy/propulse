/**
 * CorrelationIndicator Component
 *
 * Compact traffic-light indicator showing how well live spot data
 * agrees with the propagation model for a given band.
 *
 * Colour mapping:
 *  - Green  (confirmed)   -- spots match model prediction
 *  - Yellow (unverified)   -- insufficient spot data to validate
 *  - Red    (discrepancy)  -- model predicts propagation, no spots observed
 *  - Cyan   (surprise)     -- spots detected on a band predicted closed
 */

import { memo, useState, useCallback, useRef, useEffect } from "react";
import type { CorrelationAgreement } from "@/lib/utils/spotCorrelation";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CorrelationIndicatorProps {
  agreement: CorrelationAgreement;
  confidence: number;
  details: string;
  spotCount: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Colour & label look-ups
// ---------------------------------------------------------------------------

const DOT_COLORS: Record<CorrelationAgreement, string> = {
  confirmed: "bg-green-400 shadow-green-400/50",
  unverified: "bg-yellow-400 shadow-yellow-400/50",
  discrepancy: "bg-red-400 shadow-red-400/50",
  surprise: "bg-cyan-400 shadow-cyan-400/50",
};

const DOT_RING_COLORS: Record<CorrelationAgreement, string> = {
  confirmed: "ring-green-400/30",
  unverified: "ring-yellow-400/30",
  discrepancy: "ring-red-400/30",
  surprise: "ring-cyan-400/30",
};

const AGREEMENT_LABELS: Record<CorrelationAgreement, string> = {
  confirmed: "Confirmed",
  unverified: "Unverified",
  discrepancy: "Discrepancy",
  surprise: "Surprise",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatConfidenceLabel(confidence: number): string {
  if (confidence >= 80) return `${Math.round(confidence)}%`;
  if (confidence >= 50) return `${Math.round(confidence)}%`;
  return "Low";
}

function confidenceTextColor(confidence: number): string {
  if (confidence >= 80) return "text-green-400";
  if (confidence >= 60) return "text-yellow-400";
  if (confidence >= 40) return "text-orange-400";
  return "text-red-400";
}

// ---------------------------------------------------------------------------
// Tooltip sub-component (portal-free, CSS-positioned)
// ---------------------------------------------------------------------------

interface TooltipProps {
  visible: boolean;
  agreement: CorrelationAgreement;
  confidence: number;
  spotCount: number;
  details: string;
}

const Tooltip = memo(function Tooltip({
  visible,
  agreement,
  confidence,
  spotCount,
  details,
}: TooltipProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 pointer-events-none"
      role="tooltip"
    >
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm min-w-[200px] max-w-[280px]">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${DOT_COLORS[agreement]}`}
          />
          <span className="font-semibold text-zinc-100">
            {AGREEMENT_LABELS[agreement]}
          </span>
          <span
            className={`ml-auto font-mono ${confidenceTextColor(confidence)}`}
          >
            {Math.round(confidence)}%
          </span>
        </div>

        {/* Spot count */}
        <div className="text-zinc-400 mb-1">
          {spotCount === 0
            ? "No spots observed"
            : `${spotCount} spot${spotCount !== 1 ? "s" : ""} observed`}
        </div>

        {/* Details */}
        <div className="text-zinc-300 leading-snug">{details}</div>
      </div>

      {/* Arrow */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 border-b border-r border-zinc-700 bg-zinc-900/95" />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const CorrelationIndicator = memo(function CorrelationIndicator({
  agreement,
  confidence,
  details,
  spotCount,
  className = "",
}: CorrelationIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hideTimeout.current) {
      clearTimeout(hideTimeout.current);
      hideTimeout.current = null;
    }
    setShowTooltip(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeout.current = setTimeout(() => setShowTooltip(false), 150);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, []);

  return (
    <div
      className={`relative inline-flex items-center gap-1.5 ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Traffic-light dot */}
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full shadow-sm ring-2 ${DOT_COLORS[agreement]} ${DOT_RING_COLORS[agreement]}`}
        aria-label={`Correlation: ${AGREEMENT_LABELS[agreement]}`}
      />

      {/* Confidence label */}
      <span
        className={`text-[10px] font-mono leading-none ${confidenceTextColor(confidence)}`}
      >
        {formatConfidenceLabel(confidence)}
      </span>

      {/* Spot count badge */}
      {spotCount > 0 && (
        <span className="rounded-full bg-zinc-700/60 px-1.5 py-0.5 text-[9px] font-medium leading-none text-zinc-300">
          {spotCount} {spotCount === 1 ? "spot" : "spots"}
        </span>
      )}

      {/* Hover tooltip */}
      <Tooltip
        visible={showTooltip}
        agreement={agreement}
        confidence={confidence}
        spotCount={spotCount}
        details={details}
      />
    </div>
  );
});

export default CorrelationIndicator;

/**
 * BandAdvisor - Compact band-change recommendation panel
 *
 * Provides real-time QSY advice during contest operation based on:
 * - Current QSO rate with trend indicator
 * - Spot density across bands
 * - Needed multiplier opportunities
 * - Propagation predictions
 *
 * Design principles:
 * - Non-intrusive: only renders when advice type is not "stay"
 * - Actionable: includes QSY button for CAT-connected rigs
 * - Dismissible: snooze button prevents notification fatigue
 * - Compact: minimal footprint in the contest UI
 *
 * @module components/contest/BandAdvisor
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  getBandChangeAdvice,
  shouldNotify,
  getBandContestFrequency,
  computeRateTrend,
  type BandAdvice,
  type NeededMultOnBand,
  type BandPrediction,
} from "@/lib/contest/bandAdvisor";
import { useActiveBand, useActiveMode } from "@/hooks/useActiveBandMode";
import { useRigStore } from "@/stores/rigStore";

// ============================================================================
// Types
// ============================================================================

export interface BandAdvisorProps {
  /** Currently operating band. Falls back to useActiveBand() when omitted. */
  currentBand?: string;
  /** Current operating mode (CW, SSB, DIGITAL). Falls back to useActiveMode() when omitted. */
  currentMode?: string;
  /** Current QSO rate (5-min rolling average, QSOs/hr) */
  currentRate: number;
  /** Typical historical rate for this band/hour */
  historicalRate?: number;
  /** Spot count per band from DX cluster */
  spotsByBand: Record<string, number>;
  /** Propagation predictions for each band */
  predictions?: BandPrediction[];
  /** Needed multipliers spotted on other bands */
  neededMults?: NeededMultOnBand[];
  /** Recent rate history for trend computation (newest first) */
  rateHistory?: number[];
  /** Callback when band change is initiated */
  onBandChange?: (band: string) => void;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Snooze duration in milliseconds (5 minutes) */
const SNOOZE_DURATION_MS = 5 * 60 * 1000;

/** Colors for different advice urgency levels */
const URGENCY_COLORS = {
  high: {
    border: "border-alert-red/60",
    bg: "bg-alert-red/10",
    text: "text-alert-red",
    badge: "bg-alert-red/20 text-alert-red",
  },
  medium: {
    border: "border-yellow-500/60",
    bg: "bg-yellow-500/10",
    text: "text-yellow-400",
    badge: "bg-yellow-500/20 text-yellow-400",
  },
  low: {
    border: "border-blue-500/40",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    badge: "bg-blue-500/20 text-blue-400",
  },
};

/** Icons for different advice types */
const ADVICE_ICONS: Record<BandAdvice["type"], string> = {
  stay: "",
  consider_qsy: "~",
  opportunity: "!",
  predicted_opening: "*",
};

/** Trend arrow characters */
const TREND_ARROWS: Record<string, string> = {
  up: "\u2191", // up arrow
  down: "\u2193", // down arrow
  stable: "\u2192", // right arrow
};

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Rate display with trend arrow
 */
function RateIndicator({
  rate,
  trend,
}: {
  rate: number;
  trend: "up" | "down" | "stable";
}) {
  const trendColor =
    trend === "up"
      ? "text-signal-green"
      : trend === "down"
        ? "text-alert-red"
        : "text-gray-500";

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 font-mono">
        {Math.round(rate)}/hr
      </span>
      <span className={`text-xs font-bold ${trendColor}`}>
        {TREND_ARROWS[trend]}
      </span>
    </div>
  );
}

/**
 * QSY action button - sends frequency to rig via CAT
 */
function QSYButton({
  targetBand,
  mode,
  onBandChange,
}: {
  targetBand: string;
  mode: string;
  onBandChange?: (band: string) => void;
}) {
  const connected = useRigStore((s) => s.connected);
  const setPendingFrequency = useRigStore((s) => s.setPendingFrequency);

  const handleQSY = useCallback(() => {
    // Notify parent of band change
    onBandChange?.(targetBand);

    // If CAT is connected, send frequency to rig
    if (connected) {
      const freq = getBandContestFrequency(targetBand, mode);
      if (freq) {
        setPendingFrequency(freq);
      }
    }
  }, [targetBand, mode, connected, setPendingFrequency, onBandChange]);

  return (
    <button
      type="button"
      onClick={handleQSY}
      className="px-2 py-0.5 rounded text-[10px] font-bold bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 transition-colors whitespace-nowrap"
      title={
        connected
          ? `QSY to ${targetBand} (will tune rig)`
          : `QSY to ${targetBand}`
      }
    >
      QSY {targetBand}
    </button>
  );
}

/**
 * Snooze button
 */
function SnoozeButton({ onSnooze }: { onSnooze: () => void }) {
  return (
    <button
      type="button"
      onClick={onSnooze}
      className="px-1.5 py-0.5 rounded text-[9px] text-gray-500 hover:text-gray-400 hover:bg-white/5 transition-colors"
      title="Snooze advice for 5 minutes"
    >
      Snooze
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * BandAdvisor component
 *
 * Compact panel that shows band change recommendations during contest
 * operation. Only renders when there is actionable advice (hides when
 * advice type is "stay").
 *
 * @example
 * ```tsx
 * <BandAdvisor
 *   currentBand="20m"
 *   currentRate={25}
 *   spotsByBand={{ "20m": 12, "15m": 35, "40m": 8 }}
 *   neededMults={[{ callsign: "PY2XB", band: "15m", multiplier: "PY" }]}
 *   onBandChange={(band) => console.log("QSY to", band)}
 * />
 * ```
 */
export function BandAdvisor({
  currentBand: currentBandProp,
  currentMode: currentModeProp,
  currentRate,
  historicalRate = 0,
  spotsByBand,
  predictions = [],
  neededMults = [],
  rateHistory = [],
  onBandChange,
  className = "",
}: BandAdvisorProps) {
  const activeBand = useActiveBand();
  const activeMode = useActiveMode();
  const currentBand = currentBandProp ?? activeBand;
  const currentMode = currentModeProp ?? activeMode;

  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const lastNotifyTimeRef = useRef(0);
  const [dismissed, setDismissed] = useState(false);

  // Compute the current advice
  const advice = useMemo(
    () =>
      getBandChangeAdvice(
        currentBand,
        currentRate,
        historicalRate,
        spotsByBand,
        predictions,
        neededMults,
      ),
    [
      currentBand,
      currentRate,
      historicalRate,
      spotsByBand,
      predictions,
      neededMults,
    ],
  );

  // Compute rate trend
  const trend = useMemo(
    () =>
      computeRateTrend(rateHistory.length > 0 ? rateHistory : [currentRate]),
    [rateHistory, currentRate],
  );

  // Check if we're snoozed
  const isSnoozed = Date.now() < snoozedUntil;

  // Reset dismissed state when advice changes significantly
  useEffect(() => {
    setDismissed(false);
  }, [advice.type, advice.targetBand]);

  // Handle snooze
  const handleSnooze = useCallback(() => {
    setSnoozedUntil(Date.now() + SNOOZE_DURATION_MS);
    setDismissed(true);
  }, []);

  // Check if notification is warranted
  const shouldShow = useMemo(() => {
    if (advice.type === "stay") return false;
    if (isSnoozed) return false;
    if (dismissed) return false;
    return shouldNotify(advice, lastNotifyTimeRef.current);
  }, [advice, isSnoozed, dismissed]);

  // Update last notify time when we show
  useEffect(() => {
    if (shouldShow) {
      lastNotifyTimeRef.current = Date.now();
    }
  }, [shouldShow]);

  // Don't render if advice is "stay" or snoozed/dismissed
  if (!shouldShow) {
    return null;
  }

  const colors = URGENCY_COLORS[advice.urgency];
  const icon = ADVICE_ICONS[advice.type];

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg border
        ${colors.border} ${colors.bg}
        transition-all duration-300 animate-in fade-in slide-in-from-top-1
        ${className}
      `}
      role="status"
      aria-live="polite"
    >
      {/* Urgency icon */}
      {icon && (
        <span
          className={`text-sm font-bold ${colors.text} flex-shrink-0`}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}

      {/* Rate indicator */}
      <RateIndicator rate={currentRate} trend={trend} />

      {/* Advice message */}
      <span className="text-[11px] text-gray-300 truncate flex-1 min-w-0">
        {advice.message}
      </span>

      {/* Spot count badge */}
      {advice.spotCount !== undefined && advice.spotCount > 0 && (
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${colors.badge} flex-shrink-0`}
        >
          {advice.spotCount} spots
        </span>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {advice.targetBand && (
          <QSYButton
            targetBand={advice.targetBand}
            mode={currentMode}
            onBandChange={onBandChange}
          />
        )}
        <SnoozeButton onSnooze={handleSnooze} />
      </div>
    </div>
  );
}

export default BandAdvisor;

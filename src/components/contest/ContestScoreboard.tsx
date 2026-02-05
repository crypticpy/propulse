/**
 * ContestScoreboard - Elite-grade contest scoreboard with advanced metrics
 * Phase 4A.1: Rates, Pace, Trend, and ΔScore for high-speed decision support
 * Phase 8.1: Performance hardened with memoization for 5000+ QSO logs
 *
 * Features:
 * - 10-minute and 60-minute rolling rates (QSOs/hr, points/hr, mults/hr)
 * - Projection to contest end based on elapsed time + current rate
 * - Last-QSO delta showing points added and new multipliers
 * - Trend indicators (up/down/stable)
 * - Optimized with narrow Zustand selectors for minimal re-renders
 *
 * Performance notes:
 * - All sub-components use React.memo to prevent unnecessary re-renders
 * - Rate calculations are memoized and only recompute when QSOs change
 * - Narrow Zustand selectors prevent re-renders from unrelated state changes
 *
 * Web Worker candidates (for future optimization if needed):
 * - calculateRollingRate, calculatePointsRate, calculateMultsRate
 *   These iterate over QSO arrays and could be offloaded for logs > 10k QSOs
 */

import { useMemo, useState, useEffect, useCallback, useRef, memo } from "react";
import { Card } from "@/components/ui";
import { useContestStore, type ContestQSO } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";

const EMPTY_QSOS: ContestQSO[] = [];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format elapsed time as HH:MM:SS
 */
function formatElapsedTime(startTime: string): string {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - start) / 1000);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Get elapsed minutes since contest start
 */
function getElapsedMinutes(startTime: string): number {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  return (now - start) / (1000 * 60);
}

/**
 * Calculate QSO rate (QSOs per hour) - overall rate
 */
function calculateRate(qsoCount: number, startTime: string): number {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const hoursElapsed = (now - start) / (1000 * 60 * 60);

  if (hoursElapsed < 0.01) {
    return 0;
  }
  return Math.round(qsoCount / hoursElapsed);
}

/**
 * Calculate rolling rate over a time window
 * Returns QSOs per hour extrapolated from the window
 */
function calculateRollingRate(
  qsos: ContestQSO[],
  windowMinutes: number,
): number {
  if (qsos.length === 0) {
    return 0;
  }

  const now = Date.now();
  const windowStart = now - windowMinutes * 60 * 1000;

  let count = 0;
  for (let i = qsos.length - 1; i >= 0; i--) {
    const qsoTime = new Date(qsos[i].timestamp).getTime();
    if (qsoTime >= windowStart) {
      if (!qsos[i].isDupe) {
        count++;
      }
    } else {
      break;
    }
  }

  // Extrapolate to hourly rate
  return Math.round((count * 60) / windowMinutes);
}

/**
 * Calculate rolling points rate over a time window
 */
function calculatePointsRate(
  qsos: ContestQSO[],
  windowMinutes: number,
): number {
  if (qsos.length === 0) {
    return 0;
  }

  const now = Date.now();
  const windowStart = now - windowMinutes * 60 * 1000;

  let points = 0;
  for (let i = qsos.length - 1; i >= 0; i--) {
    const qsoTime = new Date(qsos[i].timestamp).getTime();
    if (qsoTime >= windowStart) {
      if (!qsos[i].isDupe) {
        points += qsos[i].points;
      }
    } else {
      break;
    }
  }

  return Math.round((points * 60) / windowMinutes);
}

/**
 * Calculate rolling multipliers rate over a time window
 */
function calculateMultsRate(qsos: ContestQSO[], windowMinutes: number): number {
  if (qsos.length === 0) {
    return 0;
  }

  const now = Date.now();
  const windowStart = now - windowMinutes * 60 * 1000;

  let mults = 0;
  for (let i = qsos.length - 1; i >= 0; i--) {
    const qsoTime = new Date(qsos[i].timestamp).getTime();
    if (qsoTime >= windowStart) {
      if (!qsos[i].isDupe && qsos[i].isMultiplier) {
        mults++;
      }
    } else {
      break;
    }
  }

  return Math.round((mults * 60) / windowMinutes);
}

/**
 * Calculate projected final score based on current pace
 */
function calculateProjectedScore(
  currentScore: number,
  elapsedMinutes: number,
  contestDurationHours: number,
): number {
  if (elapsedMinutes <= 0) {
    return 0;
  }

  const totalMinutes = contestDurationHours * 60;
  const projectionFactor = totalMinutes / elapsedMinutes;

  // Apply dampening - rate typically decreases over time
  const dampeningFactor = contestDurationHours > 24 ? 0.8 : 0.85;

  return Math.round(currentScore * projectionFactor * dampeningFactor);
}

/**
 * Determine trend direction based on rate comparison
 */
type TrendDirection = "up" | "down" | "stable";

function getTrend(rate10min: number, rate60min: number): TrendDirection {
  if (rate60min === 0) {
    return "stable";
  }
  const ratio = rate10min / rate60min;
  if (ratio > 1.15) {
    return "up";
  }
  if (ratio < 0.85) {
    return "down";
  }
  return "stable";
}

/**
 * Get the last QSO delta (points + new mults from last QSO)
 */
interface LastQSODelta {
  points: number;
  newMults: number;
  callsign: string;
  timestamp: string;
}

function getLastQSODelta(qsos: ContestQSO[]): LastQSODelta | null {
  if (qsos.length === 0) {
    return null;
  }

  const lastQso = qsos[qsos.length - 1];
  if (lastQso.isDupe) {
    return {
      points: 0,
      newMults: 0,
      callsign: lastQso.callsign,
      timestamp: lastQso.timestamp,
    };
  }

  return {
    points: lastQso.points,
    newMults: lastQso.isMultiplier ? 1 : 0,
    callsign: lastQso.callsign,
    timestamp: lastQso.timestamp,
  };
}

/**
 * Format a large number with thousands separator
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format rate with /hr suffix
 */
function formatRate(rate: number): string {
  return `${rate}/hr`;
}

// ============================================================================
// UI Components (memoized for performance)
// ============================================================================

/**
 * Trend indicator arrow component with accessibility
 * Memoized to prevent re-renders when parent updates
 */
const TrendIndicator = memo(function TrendIndicator({
  trend,
}: {
  trend: TrendDirection;
}) {
  if (trend === "stable") {
    return (
      <span
        className="text-gray-500 text-xs ml-1"
        title="Stable rate"
        aria-label="Rate stable"
      >
        {/* Horizontal arrow icon */}
        <svg
          className="w-3 h-3 inline"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 5l7 7m0 0l-7 7m7-7H3"
          />
        </svg>
      </span>
    );
  }
  if (trend === "up") {
    return (
      <span
        className="text-signal-green text-xs ml-1"
        title="Rate increasing"
        aria-label="Rate increasing"
      >
        {/* Up arrow icon */}
        <svg
          className="w-3 h-3 inline"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 10l7-7m0 0l7 7m-7-7v18"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="text-alert-red text-xs ml-1"
      title="Rate decreasing"
      aria-label="Rate decreasing"
    >
      {/* Down arrow icon */}
      <svg
        className="w-3 h-3 inline"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 14l-7 7m0 0l-7-7m7 7V3"
        />
      </svg>
    </span>
  );
});

/** Props for StatDisplay component */
interface StatDisplayProps {
  label: string;
  value: string | number;
  color?: "orange" | "cyan" | "green" | "white" | "red" | "yellow";
  size?: "normal" | "large" | "small";
  trend?: TrendDirection;
  subValue?: string;
}

/**
 * Individual stat display component
 * Memoized to prevent re-renders when sibling stats update
 */
const StatDisplay = memo(function StatDisplay({
  label,
  value,
  color = "white",
  size = "normal",
  trend,
  subValue,
}: StatDisplayProps) {
  const colorClasses = {
    orange: "text-plasma-orange",
    cyan: "text-cosmic-cyan",
    green: "text-signal-green",
    white: "text-white",
    red: "text-alert-red",
    yellow: "text-yellow-400",
  };

  const sizeClasses = {
    small: "text-sm",
    normal: "text-lg",
    large: "text-2xl",
  };

  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
        {label}
      </span>
      <div className="flex items-center">
        <span
          className={`font-mono font-bold ${colorClasses[color]} ${sizeClasses[size]}`}
        >
          {typeof value === "number" ? formatNumber(value) : value}
        </span>
        {trend && <TrendIndicator trend={trend} />}
      </div>
      {subValue && (
        <span className="text-[9px] text-gray-500 font-mono">{subValue}</span>
      )}
    </div>
  );
});

/** Props for RateDisplay component */
interface RateDisplayProps {
  label: string;
  rate10: number;
  rate60: number;
  color?: "orange" | "cyan" | "green" | "white";
}

/**
 * Rate display with 10min/60min breakdown
 * Memoized to prevent re-renders when sibling rates update
 */
const RateDisplay = memo(function RateDisplay({
  label,
  rate10,
  rate60,
  color = "green",
}: RateDisplayProps) {
  const trend = getTrend(rate10, rate60);
  const colorClasses = {
    orange: "text-plasma-orange",
    cyan: "text-cosmic-cyan",
    green: "text-signal-green",
    white: "text-white",
  };

  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
        {label}
      </span>
      <div className="flex items-center">
        <span className={`font-mono font-bold ${colorClasses[color]} text-lg`}>
          {rate10}
        </span>
        <TrendIndicator trend={trend} />
      </div>
      <span className="text-[9px] text-gray-500 font-mono">60m: {rate60}</span>
    </div>
  );
});

/**
 * Last QSO delta display
 * Memoized and includes accessibility features for color-blind users
 */
const DeltaDisplay = memo(function DeltaDisplay({
  delta,
}: {
  delta: LastQSODelta | null;
}) {
  if (!delta) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
          Last
        </span>
        <span className="font-mono text-gray-600 text-sm">--</span>
      </div>
    );
  }

  const isDupe = delta.points === 0 && delta.newMults === 0;

  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
        Last
      </span>
      <div className="flex items-center gap-1">
        {isDupe ? (
          <span
            className="inline-flex items-center gap-0.5 font-mono text-alert-red text-sm font-bold"
            role="status"
            aria-label="Last QSO was a duplicate"
          >
            {/* X icon for color-blind accessibility */}
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span className="line-through">DUPE</span>
          </span>
        ) : (
          <>
            <span
              className="font-mono text-plasma-orange text-sm font-bold"
              aria-label={`Plus ${delta.points} points`}
            >
              +{delta.points}
            </span>
            {delta.newMults > 0 && (
              <span
                className="inline-flex items-center gap-0.5 font-mono text-cosmic-cyan text-sm font-bold"
                aria-label={`Plus ${delta.newMults} multiplier`}
              >
                {/* Star icon for new mult */}
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                +{delta.newMults}M
              </span>
            )}
          </>
        )}
      </div>
      <span className="text-[9px] text-gray-500 font-mono truncate max-w-[60px]">
        {delta.callsign}
      </span>
    </div>
  );
});

export interface ContestScoreboardProps {
  /** Show compact version for narrow layouts */
  compact?: boolean;
  /** Show advanced metrics (rates, projections, deltas) */
  showAdvanced?: boolean;
}

/**
 * ContestScoreboard component
 * Elite-grade scoreboard with advanced decision support metrics
 * Uses narrow Zustand selectors for minimal re-renders at high log rates
 */
export function ContestScoreboard({
  compact = false,
  showAdvanced = true,
}: ContestScoreboardProps) {
  // Narrow selectors for minimal re-renders
  const contestId = useContestStore((s) => s.activeSession?.contestId);
  const startTime = useContestStore((s) => s.activeSession?.startTime);
  const qsos = useContestStore((s) => s.activeSession?.qsos) ?? EMPTY_QSOS;
  const totalPoints = useContestStore((s) => s.activeSession?.totalPoints ?? 0);
  const totalMultipliers = useContestStore(
    (s) => s.activeSession?.totalMultipliers ?? 0,
  );
  const totalScore = useContestStore((s) => s.activeSession?.totalScore ?? 0);
  const runMode = useContestStore((s) => s.activeSession?.runMode ?? "run");
  const scoreSummary = useContestStore((s) => s.activeSession?.scoreSummary);
  const setRunMode = useContestStore((s) => s.setRunMode);

  // Derived counts computed once per render
  const qsoCount = qsos.length;
  const dupeCount = useMemo(() => qsos.filter((q) => q.isDupe).length, [qsos]);

  // Tick state for elapsed time updates
  const [, setTick] = useState(0);

  // Store previous rates for trend calculation stability
  const prevRatesRef = useRef<{ rate10: number; rate60: number }>({
    rate10: 0,
    rate60: 0,
  });

  // Update elapsed time every second
  useEffect(() => {
    if (!startTime) {
      return;
    }

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Get contest definition for duration
  const contestDef = useMemo(() => {
    if (!contestId) {
      return null;
    }
    return getContestById(contestId);
  }, [contestId]);

  const contestName = contestDef?.name ?? contestId;
  const contestDuration = contestDef?.durationHours ?? 24;

  // Calculate elapsed time - recalculates on each tick via setTick interval
  // Not memoized since it needs to update every second
  const elapsedTime = startTime ? formatElapsedTime(startTime) : "00:00:00";
  const elapsedMinutes = startTime ? getElapsedMinutes(startTime) : 0;

  // Calculate overall rate
  const overallRate = useMemo(() => {
    if (!startTime) {
      return 0;
    }
    return calculateRate(qsoCount - dupeCount, startTime);
  }, [startTime, qsoCount, dupeCount]);

  // Calculate rolling rates (10-min and 60-min windows)
  const rates = useMemo(() => {
    const rate10 = calculateRollingRate(qsos, 10);
    const rate60 = calculateRollingRate(qsos, 60);
    const pointsRate10 = calculatePointsRate(qsos, 10);
    const pointsRate60 = calculatePointsRate(qsos, 60);
    const multsRate10 = calculateMultsRate(qsos, 10);
    const multsRate60 = calculateMultsRate(qsos, 60);

    // Update ref for trend stability
    prevRatesRef.current = { rate10, rate60 };

    return {
      qso10: rate10,
      qso60: rate60,
      points10: pointsRate10,
      points60: pointsRate60,
      mults10: multsRate10,
      mults60: multsRate60,
    };
  }, [qsos]);

  // Calculate projected final score
  const projectedScore = useMemo(() => {
    if (elapsedMinutes < 5) {
      return null;
    } // Don't project in first 5 minutes
    return calculateProjectedScore(totalScore, elapsedMinutes, contestDuration);
  }, [totalScore, elapsedMinutes, contestDuration]);

  // Get last QSO delta
  const lastDelta = useMemo(() => getLastQSODelta(qsos), [qsos]);

  // Toggle run mode
  const toggleRunMode = useCallback(() => {
    setRunMode(runMode === "run" ? "sp" : "run");
  }, [runMode, setRunMode]);

  if (!contestId || !startTime) {
    return (
      <Card className="p-3">
        <div className="text-center text-gray-500 text-sm">
          No active contest
        </div>
      </Card>
    );
  }

  if (compact) {
    return (
      <Card className="p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
            <span className="text-xs text-gray-400">{contestId}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm text-white">{qsoCount} Qs</span>
            <span className="font-mono text-lg font-bold text-plasma-orange">
              {formatNumber(totalScore)}
            </span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-3">
      <div className="flex flex-col gap-3">
        {/* Top row: Contest info + main stats */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Contest name + run mode indicator */}
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
            <span className="text-xs text-gray-400 uppercase tracking-wider">
              {contestName}
            </span>
            <button
              onClick={toggleRunMode}
              className={`
                px-2 py-0.5 text-xs font-bold uppercase rounded transition-colors
                ${
                  runMode === "run"
                    ? "bg-signal-green/20 text-signal-green border border-signal-green/50"
                    : "bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/50"
                }
              `}
              title={
                runMode === "run"
                  ? "Running (calling CQ)"
                  : "Search & Pounce mode"
              }
            >
              {runMode === "run" ? "RUN" : "S&P"}
            </button>
          </div>

          {/* Main stats row */}
          <div className="flex items-center gap-5">
            {/* QSO Count */}
            <StatDisplay label="QSOs" value={qsoCount} color="white" />

            {/* Dupe Count (if any) */}
            {dupeCount > 0 && (
              <>
                <div className="h-8 w-px bg-white/10" />
                <StatDisplay label="Dupes" value={dupeCount} color="red" />
              </>
            )}

            <div className="h-8 w-px bg-white/10" />

            {/* QSO Points */}
            <StatDisplay label="Points" value={totalPoints} color="orange" />

            <div className="h-8 w-px bg-white/10" />

            {/* Multipliers */}
            <StatDisplay label="Mults" value={totalMultipliers} color="cyan" />

            <div className="h-8 w-px bg-white/10" />

            {/* Total Score */}
            <StatDisplay
              label="Score"
              value={totalScore}
              color="orange"
              size="large"
            />

            <div className="h-8 w-px bg-white/10" />

            {/* Elapsed Time */}
            <StatDisplay label="Elapsed" value={elapsedTime} color="white" />
          </div>

          {/* Score formula */}
          <div className="text-xs text-gray-500">
            {scoreSummary
              ? `${formatNumber(scoreSummary.totalPoints)} × ${formatNumber(scoreSummary.totalMultipliers)}`
              : `${formatNumber(totalPoints)} × ${formatNumber(totalMultipliers)}`}{" "}
            ={" "}
            <span className="text-plasma-orange font-bold">
              {formatNumber(totalScore)}
            </span>
          </div>
        </div>

        {/* Advanced metrics row */}
        {showAdvanced && (
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/5">
            {/* Rate metrics with trends */}
            <div className="flex items-center gap-5">
              {/* QSO Rate (10min/60min) */}
              <RateDisplay
                label="Qs/Hr"
                rate10={rates.qso10}
                rate60={rates.qso60}
                color="green"
              />

              <div className="h-8 w-px bg-white/10" />

              {/* Points Rate */}
              <RateDisplay
                label="Pts/Hr"
                rate10={rates.points10}
                rate60={rates.points60}
                color="orange"
              />

              <div className="h-8 w-px bg-white/10" />

              {/* Mults Rate */}
              <RateDisplay
                label="Mults/Hr"
                rate10={rates.mults10}
                rate60={rates.mults60}
                color="cyan"
              />
            </div>

            {/* Projection and Delta */}
            <div className="flex items-center gap-5">
              {/* Last QSO Delta */}
              <DeltaDisplay delta={lastDelta} />

              <div className="h-8 w-px bg-white/10" />

              {/* Projected Score */}
              <StatDisplay
                label="Projected"
                value={projectedScore ?? "--"}
                color="yellow"
                subValue={projectedScore ? `@${contestDuration}hr` : undefined}
              />

              <div className="h-8 w-px bg-white/10" />

              {/* Overall Rate */}
              <StatDisplay
                label="Avg Rate"
                value={formatRate(overallRate)}
                color="white"
                size="small"
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default ContestScoreboard;

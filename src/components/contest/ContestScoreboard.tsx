/**
 * ContestScoreboard - Enhanced live score display panel
 * Composable panel showing contest stats with narrow Zustand selectors
 */

import { useMemo, useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui";
import { useContestStore } from "@/stores/contestStore";
import { getContestById } from "@/lib/data/contests";

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
 * Calculate QSO rate (QSOs per hour)
 */
function calculateRate(qsoCount: number, startTime: string): number {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const hoursElapsed = (now - start) / (1000 * 60 * 60);

  if (hoursElapsed < 0.01) return 0;
  return Math.round(qsoCount / hoursElapsed);
}

/**
 * Format a large number with thousands separator
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Individual stat display component
 */
function StatDisplay({
  label,
  value,
  color = "white",
  size = "normal",
}: {
  label: string;
  value: string | number;
  color?: "orange" | "cyan" | "green" | "white" | "red";
  size?: "normal" | "large";
}) {
  const colorClasses = {
    orange: "text-plasma-orange",
    cyan: "text-cosmic-cyan",
    green: "text-signal-green",
    white: "text-white",
    red: "text-alert-red",
  };

  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
        {label}
      </span>
      <span
        className={`
          font-mono font-bold ${colorClasses[color]}
          ${size === "large" ? "text-2xl" : "text-lg"}
        `}
      >
        {typeof value === "number" ? formatNumber(value) : value}
      </span>
    </div>
  );
}

export interface ContestScoreboardProps {
  /** Show compact version for narrow layouts */
  compact?: boolean;
}

/**
 * ContestScoreboard component
 * Uses narrow Zustand selectors for minimal re-renders
 */
export function ContestScoreboard({ compact = false }: ContestScoreboardProps) {
  // Narrow selectors for minimal re-renders
  const contestId = useContestStore((s) => s.activeSession?.contestId);
  const startTime = useContestStore((s) => s.activeSession?.startTime);
  const qsoCount = useContestStore((s) => s.activeSession?.qsos.length ?? 0);
  const dupeCount = useContestStore(
    (s) => s.activeSession?.qsos.filter((q) => q.isDupe).length ?? 0,
  );
  const totalPoints = useContestStore((s) => s.activeSession?.totalPoints ?? 0);
  const totalMultipliers = useContestStore(
    (s) => s.activeSession?.totalMultipliers ?? 0,
  );
  const totalScore = useContestStore((s) => s.activeSession?.totalScore ?? 0);
  const runMode = useContestStore((s) => s.activeSession?.runMode ?? "run");
  const scoreSummary = useContestStore((s) => s.activeSession?.scoreSummary);
  const setRunMode = useContestStore((s) => s.setRunMode);

  // Tick state for elapsed time updates
  const [, setTick] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  // Get contest name
  const contestName = useMemo(() => {
    if (!contestId) return null;
    const def = getContestById(contestId);
    return def?.name ?? contestId;
  }, [contestId]);

  // Calculate derived values
  const { elapsedTime, qsoRate } = useMemo(() => {
    if (!startTime) {
      return { elapsedTime: "00:00:00", qsoRate: 0 };
    }
    return {
      elapsedTime: formatElapsedTime(startTime),
      qsoRate: calculateRate(qsoCount, startTime),
    };
  }, [startTime, qsoCount]);

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

        {/* Stats row */}
        <div className="flex items-center gap-6">
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

          {/* QSO Rate */}
          <StatDisplay label="Rate/Hr" value={qsoRate} color="green" />

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
    </Card>
  );
}

export default ContestScoreboard;

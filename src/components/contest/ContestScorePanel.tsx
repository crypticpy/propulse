/**
 * ContestScorePanel - Live score display panel
 * Compact horizontal layout showing contest stats at a glance
 */

import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui";
import type { ContestSession } from "@/stores/contestStore";

export interface ContestScorePanelProps {
  /** Active contest session */
  session: ContestSession | null;
}

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

  if (hoursElapsed < 0.01) {
    return 0;
  } // Avoid division by tiny numbers
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
  color?: "orange" | "cyan" | "green" | "white";
  size?: "normal" | "large";
}) {
  const colorClasses = {
    orange: "text-plasma-orange",
    cyan: "text-cosmic-cyan",
    green: "text-signal-green",
    white: "text-su-text",
  };

  return (
    <div className="flex flex-col items-center">
      <span className="text-xs uppercase tracking-wider text-su-muted mb-0.5">
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

export function ContestScorePanel({ session }: ContestScorePanelProps) {
  // Tick state to force re-render every second for elapsed time
  const [, setTick] = useState(0);

  // Update elapsed time every second
  useEffect(() => {
    if (!session) {
      return;
    }

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  // Calculate derived values (recalculates when session changes or tick updates)
  const { elapsedTime, qsoRate } = useMemo(() => {
    if (!session) {
      return { elapsedTime: "00:00:00", qsoRate: 0 };
    }
    return {
      elapsedTime: formatElapsedTime(session.startTime),
      qsoRate: calculateRate(session.qsos.length, session.startTime),
    };
  }, [session]);

  if (!session) {
    return (
      <Card className="p-3">
        <div className="text-center text-su-muted text-sm">
          No active contest
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Contest name indicator */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
          <span className="text-xs text-su-muted uppercase tracking-wider">
            {session.contestId}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* QSO Count */}
          <StatDisplay label="QSOs" value={session.qsos.length} color="white" />

          {/* Divider */}
          <div className="hidden h-8 w-px bg-su-line/20 xl:block" />

          {/* QSO Points */}
          <StatDisplay
            label="Points"
            value={session.totalPoints}
            color="orange"
          />

          {/* Divider */}
          <div className="hidden h-8 w-px bg-su-line/20 xl:block" />

          {/* Multipliers */}
          <StatDisplay
            label="Mults"
            value={session.totalMultipliers}
            color="cyan"
          />

          {/* Divider */}
          <div className="hidden h-8 w-px bg-su-line/20 xl:block" />

          {/* Total Score */}
          <StatDisplay
            label="Score"
            value={session.totalScore}
            color="orange"
            size="large"
          />

          {/* Divider */}
          <div className="hidden h-8 w-px bg-su-line/20 xl:block" />

          {/* QSO Rate */}
          <StatDisplay label="Rate/Hr" value={qsoRate} color="green" />

          {/* Divider */}
          <div className="hidden h-8 w-px bg-su-line/20 xl:block" />

          {/* Elapsed Time */}
          <StatDisplay label="Elapsed" value={elapsedTime} color="white" />
        </div>

        {/* Score formula */}
        <div className="text-xs text-su-muted">
          {session.totalPoints} x {session.totalMultipliers} ={" "}
          <span className="text-plasma-orange font-bold">
            {formatNumber(session.totalScore)}
          </span>
        </div>
      </div>
    </Card>
  );
}

export default ContestScorePanel;

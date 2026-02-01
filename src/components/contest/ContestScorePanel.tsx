/**
 * ContestScorePanel - Live score display panel
 * Compact horizontal layout showing contest stats at a glance
 */

import { useMemo } from "react";
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

  if (hoursElapsed < 0.01) return 0; // Avoid division by tiny numbers
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
    white: "text-white",
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

export function ContestScorePanel({ session }: ContestScorePanelProps) {
  // Calculate derived values
  const { elapsedTime, qsoRate } = useMemo(() => {
    if (!session) {
      return { elapsedTime: "00:00:00", qsoRate: 0 };
    }
    return {
      elapsedTime: formatElapsedTime(session.startTime),
      qsoRate: calculateRate(session.qsos.length, session.startTime),
    };
  }, [session]);

  // Update elapsed time every second
  useMemo(() => {
    if (!session) return;
    const interval = setInterval(() => {
      // Force re-render by returning new object
      // This is handled by the parent re-rendering
    }, 1000);
    return () => clearInterval(interval);
  }, [session]);

  if (!session) {
    return (
      <Card className="p-3">
        <div className="text-center text-gray-500 text-sm">
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
          <span className="text-xs text-gray-400 uppercase tracking-wider">
            {session.contestId}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6">
          {/* QSO Count */}
          <StatDisplay label="QSOs" value={session.qsos.length} color="white" />

          {/* Divider */}
          <div className="h-8 w-px bg-white/10" />

          {/* QSO Points */}
          <StatDisplay
            label="Points"
            value={session.totalPoints}
            color="orange"
          />

          {/* Divider */}
          <div className="h-8 w-px bg-white/10" />

          {/* Multipliers */}
          <StatDisplay
            label="Mults"
            value={session.totalMultipliers}
            color="cyan"
          />

          {/* Divider */}
          <div className="h-8 w-px bg-white/10" />

          {/* Total Score */}
          <StatDisplay
            label="Score"
            value={session.totalScore}
            color="orange"
            size="large"
          />

          {/* Divider */}
          <div className="h-8 w-px bg-white/10" />

          {/* QSO Rate */}
          <StatDisplay label="Rate/Hr" value={qsoRate} color="green" />

          {/* Divider */}
          <div className="h-8 w-px bg-white/10" />

          {/* Elapsed Time */}
          <StatDisplay label="Elapsed" value={elapsedTime} color="white" />
        </div>

        {/* Score formula */}
        <div className="text-xs text-gray-500">
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

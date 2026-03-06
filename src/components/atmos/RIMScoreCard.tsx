/**
 * RIMScoreCard — Compact card showing the RIM composite score and 4 sub-scores.
 *
 * Designed to fit in the AtmosSidebar (224px / w-56). Shows:
 *   - Large composite number with color coding
 *   - 4 horizontal progress bars with labels, values, and trend arrows
 *   - Graceful fallback when data is unavailable
 */

import { useRIM } from "@/hooks/useRIM";
import type { RIMSubScore } from "@/types/atmos";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Color class for a score value (Tailwind bg- classes for the bar) */
function scoreBarColor(value: number): string {
  if (value >= 90) return "bg-signal-green";
  if (value >= 60) return "bg-caution-amber";
  if (value >= 30) return "bg-plasma-orange";
  return "bg-alert-red";
}

/** Text color class for the composite number */
function compositeTextColor(value: number): string {
  if (value >= 90) return "text-signal-green";
  if (value >= 60) return "text-caution-amber";
  if (value >= 30) return "text-plasma-orange";
  return "text-alert-red";
}

/** Short label for composite score quality */
function compositeLabel(value: number): string {
  if (value >= 90) return "Excellent";
  if (value >= 70) return "Good";
  if (value >= 50) return "Fair";
  if (value >= 30) return "Degraded";
  return "Poor";
}

/** Trend arrow character */
function trendArrow(trend: "up" | "down" | "stable"): string {
  switch (trend) {
    case "up":
      return "\u2191";
    case "down":
      return "\u2193";
    case "stable":
      return "\u2013";
  }
}

/** Trend arrow color */
function trendColor(trend: "up" | "down" | "stable"): string {
  switch (trend) {
    case "up":
      return "text-signal-green";
    case "down":
      return "text-alert-red";
    case "stable":
      return "text-gray-500";
  }
}

// ---------------------------------------------------------------------------
// Sub-Score Bar
// ---------------------------------------------------------------------------

function SubScoreBar({ sub }: { sub: RIMSubScore }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-400 w-[68px] truncate font-mono">
        {sub.label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        {sub.dataAvailable ? (
          <div
            className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(sub.value)}`}
            style={{ width: `${sub.value}%` }}
          />
        ) : (
          <div className="h-full w-full bg-white/[0.03]" />
        )}
      </div>
      <span className="text-[10px] font-mono text-gray-300 w-6 text-right tabular-nums">
        {sub.dataAvailable ? sub.value : "\u2014"}
      </span>
      <span className={`text-[10px] w-3 text-center ${trendColor(sub.trend)}`}>
        {trendArrow(sub.trend)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function RIMScoreCard() {
  const { rimResult, isLoading } = useRIM();

  // Loading state
  if (isLoading && !rimResult) {
    return (
      <div className="flex items-center justify-center h-20 rounded-lg bg-void-black/40 border border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-plasma-orange/40 border-t-plasma-orange animate-spin" />
          <span className="text-[10px] text-gray-500 font-mono">
            Computing RIM...
          </span>
        </div>
      </div>
    );
  }

  // No data state
  if (!rimResult) {
    return (
      <div className="flex items-center justify-center h-20 rounded-lg bg-void-black/40 border border-white/5">
        <span className="text-[10px] text-gray-600 font-mono">
          No data available
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-void-black/40 border border-white/5 p-2.5">
      {/* Composite score */}
      <div className="flex items-center gap-3 mb-2.5">
        <div className="flex flex-col items-center">
          <span
            className={`text-2xl font-orbitron font-bold leading-none tabular-nums ${compositeTextColor(rimResult.composite)}`}
          >
            {rimResult.composite}
          </span>
          <span className="text-[9px] text-gray-500 font-mono mt-0.5">
            /100
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
            Radio Impact
          </span>
          <span
            className={`text-xs font-medium ${compositeTextColor(rimResult.composite)}`}
          >
            {compositeLabel(rimResult.composite)}
          </span>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="space-y-1.5">
        <SubScoreBar sub={rimResult.hfBand} />
        <SubScoreBar sub={rimResult.vhfUhf} />
        <SubScoreBar sub={rimResult.infraRisk} />
        <SubScoreBar sub={rimResult.emcommReadiness} />
      </div>
    </div>
  );
}

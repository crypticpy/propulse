/**
 * StreakBadge — displays a fire icon + consecutive check-in count.
 *
 * Milestone thresholds apply progressively warmer color tints:
 *   10+  amber-400
 *   25+  orange-400
 *   50+  red-400
 *   100+ plasma-orange with glow
 */

import React from "react";

// ── Fire SVG Icon ────────────────────────────────────────────────────────────

const FireIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M8 16c-4.4 0-6-2.8-6-5.5 0-2.7 1.3-4.2 2.5-5.6.4-.5.8-.9 1.1-1.4C6.5 2 7.2.5 7.2.5s.8 1.8 1.3 2.8c.2.5.5.9.8 1.2C10.7 6.1 14 7.4 14 10.5 14 13.2 12.4 16 8 16z" />
  </svg>
);

// ── Color helpers ────────────────────────────────────────────────────────────

function streakColor(count: number): string {
  if (count >= 100)
    return "text-plasma-orange drop-shadow-[0_0_6px_rgba(255,140,50,0.6)]";
  if (count >= 50) return "text-red-400";
  if (count >= 25) return "text-orange-400";
  if (count >= 10) return "text-amber-400";
  return "text-gray-300";
}

// ── Component ────────────────────────────────────────────────────────────────

interface StreakBadgeProps {
  streak: number;
  size?: "sm" | "md";
}

export const StreakBadge: React.FC<StreakBadgeProps> = ({
  streak,
  size = "md",
}) => {
  if (streak <= 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-gray-500 ${size === "sm" ? "text-xs" : "text-sm"}`}
        title="No active streak"
      >
        0
      </span>
    );
  }

  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const textSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold ${textSize} ${streakColor(streak)}`}
      title={`${streak} session streak`}
    >
      <FireIcon className={iconSize} />
      {streak}
    </span>
  );
};

StreakBadge.displayName = "StreakBadge";

export default StreakBadge;

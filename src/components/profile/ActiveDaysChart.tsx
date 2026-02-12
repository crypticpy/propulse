/**
 * Day-of-week horizontal bar chart showing QSO distribution across weekdays.
 * Parses date strings to accumulate totals per day of week.
 */

import { useMemo } from "react";

interface ActiveDaysChartProps {
  qsosByDate: Record<string, number>; // "YYYY-MM-DD" -> count
  accentColor?: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function ActiveDaysChart({
  qsosByDate,
  accentColor = "var(--rank-accent, #f97316)",
}: ActiveDaysChartProps) {
  const bars = useMemo(() => {
    const totals = new Array(7).fill(0) as number[];

    for (const [dateStr, count] of Object.entries(qsosByDate)) {
      // Parse "YYYY-MM-DD" — use UTC to avoid timezone shifts
      const [y, m, d] = dateStr.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const dow = date.getUTCDay(); // 0=Sun
      totals[dow] += count;
    }

    const maxCount = Math.max(...totals, 1);

    return totals.map((count, i) => ({
      label: DAY_LABELS[i],
      count,
      widthPct: (count / maxCount) * 100,
    }));
  }, [qsosByDate]);

  return (
    <div className="flex flex-col gap-1.5" style={{ minHeight: 120 }}>
      {bars.map((bar) => (
        <div key={bar.label} className="flex items-center gap-2 h-[14px]">
          {/* Day label */}
          <span className="w-8 text-right text-[10px] font-mono text-gray-500 shrink-0">
            {bar.label}
          </span>

          {/* Bar track */}
          <div className="flex-1 h-full bg-white/[0.04] rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm transition-all duration-300"
              style={{
                width: `${Math.max(bar.widthPct, bar.count > 0 ? 2 : 0)}%`,
                backgroundColor: accentColor,
                opacity: 0.85,
              }}
            />
          </div>

          {/* Count */}
          <span className="w-8 text-right text-[10px] font-mono text-gray-400 shrink-0">
            {bar.count}
          </span>
        </div>
      ))}
    </div>
  );
}

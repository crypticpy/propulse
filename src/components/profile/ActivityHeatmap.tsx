/**
 * SVG 53x7 grid showing daily QSO activity for the last 365 days.
 * Inspired by GitHub's contribution heatmap.
 */

import { useMemo } from "react";

const CELL_SIZE = 10;
const CELL_GAP = 2;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const WEEKS = 53;
const DAYS_PER_WEEK = 7;

const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""] as const;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Left padding for day labels */
const LEFT_PAD = 28;
/** Top padding for month labels */
const TOP_PAD = 16;

function getColor(count: number): string {
  if (count === 0) return "#ffffff08";
  if (count <= 2) return "rgba(0,255,136,0.2)";
  if (count <= 5) return "rgba(0,255,136,0.4)";
  if (count <= 10) return "rgba(0,255,136,0.6)";
  return "rgb(0,255,136)";
}

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface DayEntry {
  date: Date;
  dateStr: string;
  count: number;
  week: number;
  dayOfWeek: number;
}

export function ActivityHeatmap({
  qsosByDate,
}: {
  qsosByDate: Record<string, number>;
}) {
  const { days, monthLabels } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Go back 365 days
    const start = new Date(today);
    start.setDate(start.getDate() - 364);

    // Adjust start to the previous Sunday
    const startDow = start.getDay(); // 0=Sun
    start.setDate(start.getDate() - startDow);

    const result: DayEntry[] = [];
    const months: { label: string; week: number }[] = [];
    let lastMonth = -1;

    const cursor = new Date(start);
    let weekIndex = 0;

    while (weekIndex < WEEKS) {
      for (let dow = 0; dow < DAYS_PER_WEEK; dow++) {
        const dateStr = formatDate(cursor);
        const count = qsosByDate[dateStr] || 0;

        result.push({
          date: new Date(cursor),
          dateStr,
          count,
          week: weekIndex,
          dayOfWeek: dow,
        });

        // Track month labels (placed at the first week of each month)
        const curMonth = cursor.getMonth();
        if (curMonth !== lastMonth && dow === 0) {
          months.push({ label: MONTH_NAMES[curMonth], week: weekIndex });
          lastMonth = curMonth;
        }

        cursor.setDate(cursor.getDate() + 1);
      }
      weekIndex++;
    }

    return { days: result, monthLabels: months };
  }, [qsosByDate]);

  const svgWidth = LEFT_PAD + WEEKS * CELL_STEP;
  const svgHeight = TOP_PAD + DAYS_PER_WEEK * CELL_STEP;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width="100%"
        style={{ aspectRatio: `${svgWidth}/${svgHeight}` }}
        className="block max-w-full"
        role="img"
        aria-label="QSO activity heatmap for the last 365 days"
      >
        {/* Month labels */}
        {monthLabels.map((m, i) => (
          <text
            key={`month-${i}`}
            x={LEFT_PAD + m.week * CELL_STEP}
            y={TOP_PAD - 4}
            className="fill-gray-500"
            fontSize={9}
            fontFamily="sans-serif"
          >
            {m.label}
          </text>
        ))}

        {/* Day labels */}
        {DAY_LABELS.map((label, i) =>
          label ? (
            <text
              key={`day-${i}`}
              x={LEFT_PAD - 6}
              y={TOP_PAD + i * CELL_STEP + CELL_SIZE - 1}
              className="fill-gray-500"
              fontSize={9}
              fontFamily="sans-serif"
              textAnchor="end"
            >
              {label}
            </text>
          ) : null,
        )}

        {/* Cells */}
        {days.map((day) => (
          <rect
            key={day.dateStr}
            x={LEFT_PAD + day.week * CELL_STEP}
            y={TOP_PAD + day.dayOfWeek * CELL_STEP}
            width={CELL_SIZE}
            height={CELL_SIZE}
            rx={2}
            fill={getColor(day.count)}
          >
            <title>
              {day.dateStr}: {day.count} QSO{day.count !== 1 ? "s" : ""}
            </title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

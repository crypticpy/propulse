/**
 * ScheduleOverlap — Visual 24-hour schedule overlap between viewer and target.
 * Two stacked horizontal bar rows showing activity intensity with overlap highlighting.
 */

import { useMemo } from "react";

interface ScheduleOverlapProps {
  /** 24-element array of viewer activity per hour */
  viewerHours: number[];
  /** 24-element array of target activity per hour */
  targetHours: number[];
  /** Target station callsign */
  targetCallsign: string;
  /** 24-element boolean array of overlap (computed if not provided) */
  overlapHours?: boolean[];
}

/** Hour tick labels shown at quarter positions */
const TICK_LABELS = [
  { hour: 0, label: "0z" },
  { hour: 6, label: "6z" },
  { hour: 12, label: "12z" },
  { hour: 18, label: "18z" },
] as const;

/**
 * Normalize a value relative to a maximum, producing an opacity in [0.1, 0.9].
 */
function normalizedOpacity(value: number, max: number): number {
  if (max <= 0) return 0.1;
  const ratio = value / max;
  return Math.max(0.1, Math.min(0.9, ratio * 0.9));
}

/**
 * Find the longest contiguous run of true values and format as a time range.
 */
function bestOverlapRange(overlap: boolean[]): string | null {
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < overlap.length; i++) {
    if (overlap[i]) {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curLen = 0;
    }
  }

  if (bestLen === 0) return null;
  const endHour = (bestStart + bestLen) % 24;
  return `${String(bestStart).padStart(2, "0")}:00-${String(endHour).padStart(2, "0")}:00z`;
}

export function ScheduleOverlap({
  viewerHours,
  targetHours,
  targetCallsign,
  overlapHours: overlapProp,
}: ScheduleOverlapProps) {
  const { viewerMax, targetMax, overlap } = useMemo(() => {
    const vMax = Math.max(...viewerHours, 1);
    const tMax = Math.max(...targetHours, 1);

    // Compute overlap if not provided
    const ov: boolean[] =
      overlapProp ??
      Array.from({ length: 24 }, (_, h) => {
        const vActive = viewerHours[h] / vMax > 0.1;
        const tActive = targetHours[h] / tMax > 0.1;
        return vActive && tActive;
      });

    return { viewerMax: vMax, targetMax: tMax, overlap: ov };
  }, [viewerHours, targetHours, overlapProp]);

  const overlapRange = useMemo(() => bestOverlapRange(overlap), [overlap]);

  return (
    <div className="space-y-2">
      {/* Viewer row */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
          You
        </div>
        <div className="flex gap-[2px]">
          {viewerHours.map((val, h) => {
            const isOverlap = overlap[h];
            return (
              <div
                key={h}
                className={[
                  "flex-1 h-5 rounded-[2px] transition-all",
                  isOverlap ? "ring-1 ring-white/30" : "",
                ].join(" ")}
                style={{
                  backgroundColor: `rgba(59, 130, 246, ${normalizedOpacity(val, viewerMax)})`,
                }}
                title={`${String(h).padStart(2, "0")}z: ${val} QSOs`}
              />
            );
          })}
        </div>
      </div>

      {/* Target row */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
          {targetCallsign}
        </div>
        <div className="flex gap-[2px]">
          {targetHours.map((val, h) => {
            const isOverlap = overlap[h];
            return (
              <div
                key={h}
                className={[
                  "flex-1 h-5 rounded-[2px] transition-all",
                  isOverlap ? "ring-1 ring-white/30" : "",
                ].join(" ")}
                style={{
                  backgroundColor: `rgba(249, 115, 22, ${normalizedOpacity(val, targetMax)})`,
                }}
                title={`${String(h).padStart(2, "0")}z: ${val} QSOs`}
              />
            );
          })}
        </div>
      </div>

      {/* Hour tick labels */}
      <div className="flex">
        {TICK_LABELS.map(({ hour, label }) => (
          <div
            key={hour}
            className="font-mono text-[9px] text-gray-600"
            style={{ width: "25%", paddingLeft: hour === 0 ? 0 : undefined }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Summary */}
      {overlapRange && (
        <p className="text-[11px] text-gray-400">
          Best overlap:{" "}
          <span className="text-white font-mono">{overlapRange}</span>
        </p>
      )}
    </div>
  );
}

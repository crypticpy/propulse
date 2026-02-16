/**
 * FlexDbScale — Vertical dB scale overlay positioned on the right edge of the
 * spectrum scope area in the FlexRadio SmartSDR-inspired SDR console skin.
 *
 * Pure/presentational component with memoized label computation.
 */

import { useMemo } from "react";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface FlexDbScaleProps {
  /** Bottom of the displayed dB range (e.g., -125) */
  minDb: number;
  /** Top of the displayed dB range (e.g., -40) */
  maxDb: number;
  className?: string;
}

// ─── Label computation ──────────────────────────────────────────────────────

interface DbLabel {
  db: number;
  yPercent: number;
  text: string;
}

function computeStep(range: number): number {
  if (range > 60) return 20;
  if (range > 30) return 10;
  return 5;
}

function computeLabels(minDb: number, maxDb: number): DbLabel[] {
  const range = maxDb - minDb;
  if (!Number.isFinite(range) || range <= 0) return [];

  const step = computeStep(range);

  // First label at or above minDb, snapped to step boundary
  const first = Math.ceil(minDb / step) * step;

  const labels: DbLabel[] = [];
  for (let db = first; db <= maxDb; db += step) {
    // Top of view = maxDb (0%), bottom = minDb (100%)
    const yPercent = ((maxDb - db) / range) * 100;
    labels.push({
      db,
      yPercent,
      text: `${db}`,
    });
  }

  return labels;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FlexDbScale({
  minDb,
  maxDb,
  className = "",
}: FlexDbScaleProps) {
  const labels = useMemo(() => computeLabels(minDb, maxDb), [minDb, maxDb]);

  return (
    <div
      className={`absolute right-0 top-0 bottom-0 w-10 pointer-events-none ${className}`}
      aria-label="dB scale"
    >
      {/* Semi-transparent background gradient */}
      <div className="absolute inset-0 bg-gradient-to-l from-black/50 to-transparent" />

      {/* dB labels */}
      {labels.map((label) => (
        <div
          key={label.db}
          className="absolute right-0 flex items-center"
          style={{ top: `${label.yPercent}%`, transform: "translateY(-50%)" }}
        >
          {/* Tick mark */}
          <div className="w-2 h-px bg-gray-700" />

          {/* Label text */}
          <span className="font-mono text-[9px] text-gray-600 text-right pr-1 leading-none whitespace-nowrap">
            {label.text}
          </span>
        </div>
      ))}
    </div>
  );
}

export default FlexDbScale;

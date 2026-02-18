/**
 * FlexTimeAxis — Vertical time axis overlay positioned on the right edge of
 * the waterfall area in the FlexRadio SmartSDR-inspired SDR console skin.
 *
 * Shows relative time labels (e.g., -5s, -10s) based on waterfall scroll rate.
 * Pure/presentational component with memoized label computation.
 */

import { useMemo } from "react";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface FlexTimeAxisProps {
  /** Waterfall speed multiplier (default 1) */
  speed: number;
  /** Pixel height of the waterfall container */
  containerHeight: number;
  /** FFT frames per second (default 20) */
  fps?: number;
  /** Pixel rows per FFT frame (default 1). */
  rowHeight?: number;
  className?: string;
}

// ─── Label computation ──────────────────────────────────────────────────────

interface TimeLabel {
  seconds: number;
  yPercent: number;
  text: string;
}

/** Nice time intervals in seconds */
const TIME_STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300] as const;

function pickTimeStep(maxSeconds: number): number {
  // Target ~4-6 visible labels
  const idealStep = maxSeconds / 5;
  for (const step of TIME_STEPS) {
    if (step >= idealStep) return step;
  }
  return TIME_STEPS[TIME_STEPS.length - 1];
}

function formatSeconds(s: number): string {
  if (s < 60) return `-${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `-${m}m` : `-${m}m${rem}s`;
}

function computeLabels(
  speed: number,
  containerHeight: number,
  fps: number,
  rowHeight: number,
): TimeLabel[] {
  const pixelsPerSecond = speed * fps * Math.max(1, Math.round(rowHeight));
  if (
    !Number.isFinite(pixelsPerSecond) ||
    pixelsPerSecond <= 0 ||
    containerHeight <= 0
  ) {
    return [];
  }

  // Total time visible in the waterfall
  const maxSeconds = containerHeight / pixelsPerSecond;
  const step = pickTimeStep(maxSeconds);

  const labels: TimeLabel[] = [];
  for (let s = step; s <= maxSeconds; s += step) {
    const yPercent = ((s * pixelsPerSecond) / containerHeight) * 100;
    labels.push({
      seconds: s,
      yPercent,
      text: formatSeconds(s),
    });
  }

  return labels;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FlexTimeAxis({
  speed,
  containerHeight,
  fps = 20,
  rowHeight = 1,
  className = "",
}: FlexTimeAxisProps) {
  const labels = useMemo(
    () => computeLabels(speed, containerHeight, fps, rowHeight),
    [speed, containerHeight, fps, rowHeight],
  );

  return (
    <div
      className={`absolute right-0 top-0 bottom-0 w-10 pointer-events-none ${className}`}
      aria-label="Waterfall time axis"
    >
      {/* Semi-transparent background gradient */}
      <div className="absolute inset-0 bg-gradient-to-l from-black/50 to-transparent" />

      {/* Time labels */}
      {labels.map((label) => (
        <div
          key={label.seconds}
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

export default FlexTimeAxis;

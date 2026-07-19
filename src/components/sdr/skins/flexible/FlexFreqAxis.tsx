/**
 * FlexFreqAxis — Shared frequency axis rendered between the spectrum scope
 * and waterfall in the FlexRadio SmartSDR-inspired SDR console skin.
 *
 * Pure/presentational SVG component with memoized tick computation.
 */

import { useMemo } from "react";

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface FlexFreqAxisProps {
  centerHz: number;
  spanHz: number;
  /** Tick direction: "up" points ticks toward the spectrum, "down" (default) from top. */
  orientation?: "up" | "down";
  className?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const AXIS_HEIGHT = 24;
const MAJOR_TICK_HEIGHT = 6;
const CENTER_TICK_HEIGHT = 8;
const MAX_TICKS = 20;

// ─── Tick step selection ───────────────────────────────────────────────────────

function niceTickStep(spanHz: number): number {
  if (spanHz > 10_000_000) return 2_000_000;
  if (spanHz > 5_000_000) return 1_000_000;
  if (spanHz > 2_000_000) return 500_000;
  if (spanHz > 1_000_000) return 200_000;
  if (spanHz > 500_000) return 100_000;
  if (spanHz > 200_000) return 50_000;
  if (spanHz > 100_000) return 25_000;
  if (spanHz > 50_000) return 10_000;
  return 5_000;
}

// ─── Label formatting ──────────────────────────────────────────────────────────

function formatTickLabel(hz: number, stepHz: number): string {
  if (stepHz >= 1_000_000) {
    // Show as "X.XXX" MHz (e.g. "28.075")
    return (hz / 1_000_000).toFixed(3);
  }
  if (stepHz >= 100_000) {
    // Show as "X.X" MHz (e.g. "28.1")
    return (hz / 1_000_000).toFixed(1);
  }
  // Show as kHz (e.g. "7074")
  return String(Math.round(hz / 1_000));
}

// ─── Tick data type ────────────────────────────────────────────────────────────

interface TickData {
  hz: number;
  xPercent: number;
  label: string;
  isCenter: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function FlexFreqAxis({
  centerHz,
  spanHz,
  orientation = "down",
  className = "",
}: FlexFreqAxisProps) {
  const ticks = useMemo<TickData[]>(() => {
    // Guard against invalid inputs
    if (
      !Number.isFinite(centerHz) ||
      !Number.isFinite(spanHz) ||
      centerHz === 0 ||
      spanHz === 0
    ) {
      return [];
    }

    const startHz = centerHz - spanHz / 2;
    const endHz = centerHz + spanHz / 2;
    const step = niceTickStep(spanHz);

    // First tick at or above startHz, rounded up to the step
    const firstTick = Math.ceil(startHz / step) * step;

    const result: TickData[] = [];
    for (
      let hz = firstTick;
      hz <= endHz && result.length < MAX_TICKS;
      hz += step
    ) {
      const xPercent = ((hz - startHz) / spanHz) * 100;
      result.push({
        hz,
        xPercent,
        label: formatTickLabel(hz, step),
        isCenter: Math.abs(hz - centerHz) < step / 2,
      });
    }

    return result;
  }, [centerHz, spanHz]);

  return (
    <svg
      className={`w-full bg-black ${className}`}
      height={AXIS_HEIGHT}
      preserveAspectRatio="none"
      aria-label="Frequency axis"
    >
      {ticks.map((tick) => {
        const tickHeight = tick.isCenter
          ? CENTER_TICK_HEIGHT
          : MAJOR_TICK_HEIGHT;
        const strokeColor = tick.isCenter
          ? "rgb(156, 163, 175)" /* gray-400 — brighter for center */
          : "rgb(107, 114, 128)"; /* gray-500 */

        // Orientation: "up" draws ticks from bottom edge upward,
        // "down" (default) draws ticks from top edge downward.
        const y1 = orientation === "up" ? AXIS_HEIGHT : 0;
        const y2 = orientation === "up" ? AXIS_HEIGHT - tickHeight : tickHeight;
        const textY =
          orientation === "up" ? AXIS_HEIGHT - tickHeight - 3 : tickHeight + 11;

        return (
          <g key={tick.hz}>
            <line
              x1={`${tick.xPercent}%`}
              y1={y1}
              x2={`${tick.xPercent}%`}
              y2={y2}
              stroke={strokeColor}
              strokeWidth={1}
            />
            <text
              x={`${tick.xPercent}%`}
              y={textY}
              textAnchor="middle"
              className="font-mono text-[10px] fill-gray-500"
              style={{ userSelect: "none" }}
            >
              {tick.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default FlexFreqAxis;

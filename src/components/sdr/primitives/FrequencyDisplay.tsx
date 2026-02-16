/**
 * FrequencyDisplay — Segmented LED-style frequency readout.
 *
 * Pure presentational component. Renders MHz.kHz.Hz with configurable
 * size and optional LED glow effect. Shows em-dash placeholder when
 * frequency is null.
 */

import { useMemo } from "react";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FrequencyDisplayProps {
  /** Frequency in Hz (e.g. 14074000). Null shows placeholder. */
  freqHz: number | null;
  /** Display size preset. Default "md". */
  size?: "sm" | "md" | "lg";
  /** Enable LED text glow effect. Default true. */
  glow?: boolean;
  /** Additional CSS classes on the wrapper. */
  className?: string;
}

// ─── Size mapping ────────────────────────────────────────────────────────────

const SIZE_CLASSES = {
  sm: {
    mhz: "text-xl",
    khz: "text-lg",
    hz: "text-sm",
    dot: "text-lg",
    placeholder: "text-xl",
  },
  md: {
    mhz: "text-2xl",
    khz: "text-xl",
    hz: "text-base",
    dot: "text-xl",
    placeholder: "text-2xl",
  },
  lg: {
    mhz: "text-3xl",
    khz: "text-2xl",
    hz: "text-lg",
    dot: "text-2xl",
    placeholder: "text-3xl",
  },
} as const;

// ─── Internal helpers ────────────────────────────────────────────────────────

interface FreqSegments {
  mhz: string;
  khz: string;
  hz: string;
}

function formatFreqSegments(freqHz: number): FreqSegments {
  const clamped = Math.max(0, Math.round(freqHz));
  const str = String(clamped).padStart(7, "0"); // minimum 7 digits: X.XXX.XXX

  // Split from the right: last 3 = Hz, next 3 = kHz, rest = MHz
  const hz = str.slice(-3);
  const khz = str.slice(-6, -3);
  const mhz = str.slice(0, -6) || "0";

  return { mhz, khz, hz };
}

const LED_GLOW = { textShadow: "0 0 8px rgba(0, 220, 255, 0.4)" } as const;
const DIM_GLOW = { textShadow: "0 0 6px rgba(0, 220, 255, 0.15)" } as const;
const NO_GLOW = {} as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function FrequencyDisplay({
  freqHz,
  size = "md",
  glow = true,
  className = "",
}: FrequencyDisplayProps) {
  const segments = useMemo<FreqSegments | null>(
    () =>
      freqHz != null && Number.isFinite(freqHz)
        ? formatFreqSegments(freqHz)
        : null,
    [freqHz],
  );

  const s = SIZE_CLASSES[size];
  const glowStyle = !glow ? NO_GLOW : segments ? LED_GLOW : DIM_GLOW;

  return (
    <div className={`font-mono tracking-wider ${className}`} style={glowStyle}>
      {segments ? (
        <>
          <span className={`${s.mhz} font-bold text-white`}>
            {segments.mhz}
          </span>
          <span className={`${s.dot} text-gray-400 mx-px`}>.</span>
          <span className={`${s.khz} font-semibold text-white`}>
            {segments.khz}
          </span>
          <span className={`${s.dot} text-gray-400 mx-px`}>.</span>
          <span className={`${s.hz} text-gray-300`}>{segments.hz}</span>
        </>
      ) : (
        <span className={`${s.placeholder} font-bold text-gray-600`}>
          {"\u2014"}
          <span className={`${s.dot} text-gray-700 mx-px`}>.</span>
          {"\u2014\u2014\u2014"}
          <span className={`${s.dot} text-gray-700 mx-px`}>.</span>
          <span className={`${s.hz} text-gray-700`}>
            {"\u2014\u2014\u2014"}
          </span>
        </span>
      )}
    </div>
  );
}

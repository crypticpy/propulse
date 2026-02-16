/**
 * FlexVfoDisplay — Large segmented VFO frequency display.
 *
 * Inspired by FlexRadio SmartSDR's "Slice" indicator, this is a pure
 * presentational component that renders a professional SDR-style frequency
 * readout with colored accent bar, slice label, mode badge, antenna
 * indicator, TX/RX state, filter bandwidth, and inline S-meter readout.
 */

import { useMemo } from "react";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FlexVfoDisplayProps {
  /** Current frequency in Hz (e.g., 28075000). Null shows placeholder. */
  freqHz: number | null;
  /** Current mode (e.g., "USB", "CW", "AM"). */
  mode: string | null;
  /** Whether the radio is transmitting. */
  ptt: boolean;
  /** Active antenna port (e.g., "ANT1"). */
  antenna: string | null;
  /** Filter low edge in Hz. */
  filterLow: number | null;
  /** Filter high edge in Hz. */
  filterHigh: number | null;
  /** S-meter readout string (e.g., "S7", "S9+10") */
  smeterReadout?: string | null;
}

// ─── Mode color mapping (Tailwind classes) ──────────────────────────────────

const MODE_COLORS: Record<string, string> = {
  USB: "text-signal-green",
  LSB: "text-signal-green",
  CW: "text-cosmic-cyan",
  CWR: "text-cosmic-cyan",
  AM: "text-caution-amber",
  FM: "text-caution-amber",
  NFM: "text-caution-amber",
  WFM: "text-caution-amber",
  RTTY: "text-purple-400",
  DIGI: "text-purple-400",
  FT8: "text-purple-400",
  FT4: "text-purple-400",
  JS8: "text-purple-400",
} as const;

const MODE_BG_COLORS: Record<string, string> = {
  USB: "bg-signal-green/15 border-signal-green/30",
  LSB: "bg-signal-green/15 border-signal-green/30",
  CW: "bg-cosmic-cyan/15 border-cosmic-cyan/30",
  CWR: "bg-cosmic-cyan/15 border-cosmic-cyan/30",
  AM: "bg-caution-amber/15 border-caution-amber/30",
  FM: "bg-caution-amber/15 border-caution-amber/30",
  NFM: "bg-caution-amber/15 border-caution-amber/30",
  WFM: "bg-caution-amber/15 border-caution-amber/30",
  RTTY: "bg-purple-400/15 border-purple-400/30",
  DIGI: "bg-purple-400/15 border-purple-400/30",
  FT8: "bg-purple-400/15 border-purple-400/30",
  FT4: "bg-purple-400/15 border-purple-400/30",
  JS8: "bg-purple-400/15 border-purple-400/30",
} as const;

function getModeColor(mode: string | null): string {
  if (!mode) return "text-gray-400";
  return MODE_COLORS[mode.toUpperCase()] ?? "text-gray-400";
}

function getModeBgColor(mode: string | null): string {
  if (!mode) return "bg-gray-400/15 border-gray-400/30";
  return (
    MODE_BG_COLORS[mode.toUpperCase()] ?? "bg-gray-400/15 border-gray-400/30"
  );
}

// ─── Mode accent color (CSS value for inline styles) ────────────────────────

function getModeAccentCss(mode: string | null): string {
  if (!mode) return "rgba(156, 163, 175, 0.5)";
  const upper = mode.toUpperCase();
  if (upper === "USB" || upper === "LSB") return "rgba(34, 197, 94, 0.9)";
  if (upper === "CW" || upper === "CWR") return "rgba(0, 220, 255, 0.9)";
  if (upper === "AM" || upper === "FM" || upper === "NFM" || upper === "WFM")
    return "rgba(245, 158, 11, 0.9)";
  if (["RTTY", "DIGI", "FT8", "FT4", "JS8"].includes(upper))
    return "rgba(168, 85, 247, 0.9)";
  return "rgba(156, 163, 175, 0.5)";
}

// ─── Frequency formatting ────────────────────────────────────────────────────

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

// ─── Filter bandwidth formatting ─────────────────────────────────────────────

function formatBandwidth(
  low: number | null,
  high: number | null,
): string | null {
  if (low == null || high == null) return null;
  const bw = Math.abs(high - low);
  if (bw >= 1000) {
    return `${(bw / 1000).toFixed(1)}K`;
  }
  return `${bw} Hz`;
}

// ─── LED glow style ──────────────────────────────────────────────────────────

const ledGlowStyle = {
  textShadow: "0 0 8px rgba(0, 220, 255, 0.4)",
} as const;

const dimGlowStyle = {
  textShadow: "0 0 6px rgba(0, 220, 255, 0.15)",
} as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function FlexVfoDisplay({
  freqHz,
  mode,
  ptt,
  antenna,
  filterLow,
  filterHigh,
  smeterReadout,
}: FlexVfoDisplayProps) {
  const segments = useMemo<FreqSegments | null>(
    () =>
      freqHz != null && Number.isFinite(freqHz)
        ? formatFreqSegments(freqHz)
        : null,
    [freqHz],
  );

  const bandwidth = useMemo(
    () => formatBandwidth(filterLow, filterHigh),
    [filterLow, filterHigh],
  );

  const modeUpper = mode?.toUpperCase() ?? null;
  const accentColor = getModeAccentCss(mode);

  return (
    <div
      className="absolute top-3 left-3 z-10 bg-black/80 backdrop-blur-sm rounded-lg px-3 py-1.5 select-none"
      style={{ boxShadow: `inset 3px 0 0 ${accentColor}` }}
    >
      {/* ── Slice label ────────────────────────────────────────────────── */}
      <div
        className="text-[9px] font-bold uppercase tracking-widest mb-0.5"
        style={{ color: accentColor }}
      >
        Slice A
      </div>

      {/* ── Frequency row ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Segmented frequency display */}
        <div
          className="font-mono tracking-wider"
          style={segments ? ledGlowStyle : dimGlowStyle}
        >
          {segments ? (
            <>
              <span className="text-3xl font-bold text-white">
                {segments.mhz}
              </span>
              <span className="text-2xl text-gray-400 mx-px">.</span>
              <span className="text-2xl font-semibold text-white">
                {segments.khz}
              </span>
              <span className="text-2xl text-gray-400 mx-px">.</span>
              <span className="text-lg text-gray-300">{segments.hz}</span>
            </>
          ) : (
            <span className="text-3xl font-bold text-gray-600">
              {"\u2014"}
              <span className="text-2xl text-gray-700 mx-px">.</span>
              {"\u2014\u2014\u2014"}
              <span className="text-2xl text-gray-700 mx-px">.</span>
              <span className="text-lg text-gray-700">
                {"\u2014\u2014\u2014"}
              </span>
            </span>
          )}
        </div>

        {/* ── Inline badges ────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 ml-1">
          {/* Mode pill */}
          {modeUpper && (
            <span
              className={`
                px-2 py-0.5 rounded text-xs font-bold font-mono border
                ${getModeColor(modeUpper)} ${getModeBgColor(modeUpper)}
              `}
            >
              {modeUpper}
            </span>
          )}

          {/* Antenna badge */}
          {antenna && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-gray-400 bg-white/5 border border-white/10">
              {antenna}
            </span>
          )}

          {/* TX / RX indicator */}
          {ptt ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono text-alert-red bg-alert-red/15 border border-alert-red/30 animate-pulse">
              TX
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono text-signal-green bg-signal-green/10 border border-signal-green/20">
              RX
            </span>
          )}
        </div>
      </div>

      {/* ── Bottom info row: BW + S-meter ──────────────────────────────── */}
      {(bandwidth || smeterReadout) && (
        <div className="mt-0.5 text-[10px] font-mono text-gray-500 tracking-wide">
          {bandwidth && <span>BW {bandwidth}</span>}
          {bandwidth && smeterReadout && <span className="mx-1">&middot;</span>}
          {smeterReadout && <span>{smeterReadout}</span>}
        </div>
      )}
    </div>
  );
}

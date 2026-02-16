/**
 * FlexVfoDisplay — SmartSDR-style "slice flag" overlay.
 *
 * Renders a professional SDR-style slice indicator with:
 * - Floating card with drop shadow for depth
 * - Configurable background color with mode-colored accent bar
 * - Animated S-meter bar with green/red zones and tick marks
 * - Segmented LED frequency display (MHz.kHz.Hz)
 * - Interactive DSP badges (NB, NR, AGC) — clickable toggles
 * - Mode pill, antenna badge, TX/RX indicator
 * - Filter bandwidth display
 */

import { useMemo } from "react";
import { SlicePanelTabs, type SlicePanelControlProps } from "./SlicePanelTabs";

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
  /** S-meter reading in dBm (e.g., -73 = S9). Drives the visual bar. */
  smeterDbm?: number;
  /** NR enabled on radio */
  nrEnabled?: boolean;
  /** NB enabled on radio */
  nbEnabled?: boolean;
  /** AGC enabled on radio */
  agcEnabled?: boolean;
  /** Active VFO ("A" or "B"). Defaults to "A" when null/undefined. */
  vfo?: "A" | "B" | null;
  /** Background color CSS value, default "rgba(0, 40, 60, 0.85)" */
  bgColor?: string;

  // ── Interactive callbacks (optional — omit for display-only) ──
  /** Swap VFO A/B. Omit to render label as non-interactive. */
  onVfoSwap?: () => void;
  /** Toggle noise blanker. Omit to render NB as non-interactive. */
  onNbToggle?: () => void;
  /** Toggle noise reduction. */
  onNrToggle?: () => void;
  /** Toggle AGC. */
  onAgcToggle?: () => void;

  /** Slice panel controls — when provided, renders the tab panel row. */
  slicePanels?: SlicePanelControlProps;
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

// ─── S-meter constants ───────────────────────────────────────────────────────

const S9_DBM = -73;
const S1_DBM = -121;
const DB_PER_S_UNIT = 6;
const DBM_MAX = -23; // S9+50
const DBM_RANGE = DBM_MAX - S1_DBM; // total range in dB

/** Map a dBm value to a percentage (0-100) of the full bar. */
function dbmToPercent(dbm: number): number {
  const clamped = Math.max(S1_DBM, Math.min(DBM_MAX, dbm));
  return ((clamped - S1_DBM) / DBM_RANGE) * 100;
}

/** The percentage where S9 falls on the bar. */
const S9_PERCENT = dbmToPercent(S9_DBM);

/** Format dBm into S-unit readout (e.g., "S7", "S9+10"). */
function formatSmeter(dbm: number): string {
  if (dbm >= S9_DBM) {
    const over = Math.round(dbm - S9_DBM);
    return over === 0 ? "S9" : `S9+${over}`;
  }
  const sUnit = Math.max(1, Math.round((dbm - S1_DBM) / DB_PER_S_UNIT) + 1);
  return `S${sUnit}`;
}

/** Tick mark positions for the S-meter bar. */
const SMETER_TICKS = [
  { label: "1", dbm: S1_DBM },
  { label: "3", dbm: S1_DBM + 2 * DB_PER_S_UNIT },
  { label: "5", dbm: S1_DBM + 4 * DB_PER_S_UNIT },
  { label: "7", dbm: S1_DBM + 6 * DB_PER_S_UNIT },
  { label: "9", dbm: S9_DBM },
  { label: "+20", dbm: S9_DBM + 20 },
  { label: "+40", dbm: S9_DBM + 40 },
] as const;

// ─── Default background color ────────────────────────────────────────────────

const DEFAULT_BG_COLOR = "rgba(0, 40, 60, 0.85)";

// ─── Component ───────────────────────────────────────────────────────────────

export function FlexVfoDisplay({
  freqHz,
  mode,
  ptt,
  antenna,
  filterLow,
  filterHigh,
  smeterDbm,
  nrEnabled = false,
  nbEnabled = false,
  agcEnabled = false,
  vfo,
  bgColor = DEFAULT_BG_COLOR,
  onVfoSwap,
  onNbToggle,
  onNrToggle,
  onAgcToggle,
  slicePanels,
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

  const fillPercent = smeterDbm != null ? dbmToPercent(smeterDbm) : 0;
  const hasReading = smeterDbm != null;
  const smeterText = hasReading ? formatSmeter(smeterDbm) : null;

  return (
    <div
      className="backdrop-blur-sm rounded-lg px-3 py-1.5 select-none min-w-[280px] border border-white/10"
      style={{
        backgroundColor: bgColor,
        boxShadow: `inset 3px 0 0 ${accentColor}, 0 4px 24px rgba(0,0,0,0.6), 0 1px 6px rgba(0,0,0,0.4)`,
      }}
    >
      {/* ── Top row: Slice label + badges ─────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-0.5">
        {/* VFO label */}
        {onVfoSwap ? (
          <button
            onClick={onVfoSwap}
            className="text-[10px] font-bold tracking-wider hover:brightness-125 active:scale-95 transition-all cursor-pointer mr-auto"
            style={{ color: accentColor }}
            title="Switch VFO"
          >
            VFO {vfo ?? "A"}
          </button>
        ) : (
          <span
            className="text-[10px] font-bold tracking-wider mr-auto"
            style={{ color: accentColor }}
          >
            VFO {vfo ?? "A"}
          </span>
        )}

        {/* Antenna badge */}
        {antenna && (
          <span className="px-1.5 py-0 rounded text-[9px] font-mono font-bold text-gray-400 bg-white/5 border border-white/10 leading-[16px]">
            {antenna}
          </span>
        )}

        {/* DSP badges: NB, NR, AGC — interactive when callbacks provided */}
        <DspBadge label="NB" active={nbEnabled} onClick={onNbToggle} />
        <DspBadge label="NR" active={nrEnabled} onClick={onNrToggle} />
        <DspBadge label="AGC" active={agcEnabled} onClick={onAgcToggle} />

        {/* Bandwidth badge */}
        {bandwidth && (
          <span className="px-1.5 py-0 rounded text-[9px] font-mono font-bold text-gray-400 bg-white/5 border border-white/10 leading-[16px]">
            {bandwidth}
          </span>
        )}

        {/* TX / RX indicator */}
        {ptt ? (
          <span className="px-1.5 py-0 rounded text-[9px] font-bold font-mono text-alert-red bg-alert-red/15 border border-alert-red/30 animate-pulse leading-[16px]">
            TX
          </span>
        ) : (
          <span className="px-1.5 py-0 rounded text-[9px] font-bold font-mono text-signal-green bg-signal-green/10 border border-signal-green/20 leading-[16px]">
            RX
          </span>
        )}
      </div>

      {/* ── S-meter bar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-0.5">
        {/* Bar track */}
        <div className="relative flex-1 h-[7px] rounded-sm bg-black/40 overflow-hidden border border-white/5">
          {hasReading ? (
            <>
              {/* Green zone fill: S1 to S9 */}
              <div
                className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-200 ease-out"
                style={{
                  width: `${Math.min(fillPercent, S9_PERCENT)}%`,
                  background:
                    "linear-gradient(90deg, rgba(34,197,94,0.6), rgba(34,197,94,0.9))",
                }}
              />
              {/* Red zone fill: S9+ only */}
              {fillPercent > S9_PERCENT && (
                <div
                  className="absolute inset-y-0 rounded-sm transition-[width] duration-200 ease-out"
                  style={{
                    left: `${S9_PERCENT}%`,
                    width: `${fillPercent - S9_PERCENT}%`,
                    background:
                      "linear-gradient(90deg, rgba(255,68,85,0.7), rgba(255,68,85,1.0))",
                  }}
                />
              )}
            </>
          ) : null}

          {/* Tick marks */}
          {SMETER_TICKS.map((tick) => {
            const pct = dbmToPercent(tick.dbm);
            return (
              <div
                key={tick.label}
                className="absolute top-0 w-px bg-white/20"
                style={{
                  left: `${pct}%`,
                  height: tick.label === "9" ? "100%" : "60%",
                }}
              />
            );
          })}
        </div>

        {/* Readout text */}
        <span className="text-[9px] font-mono font-bold text-gray-400 w-[52px] text-right whitespace-nowrap tabular-nums">
          {hasReading ? (
            <>
              <span className="text-white">{smeterText}</span>
              <span className="text-gray-500 ml-1">{smeterDbm}</span>
            </>
          ) : (
            <span className="text-gray-600">---</span>
          )}
        </span>
      </div>

      {/* ── Frequency row ────────────────────────────────────────────── */}
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

        {/* Mode pill */}
        <div className="flex items-center gap-1.5 ml-auto">
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
        </div>
      </div>

      {/* ── Bottom info row ──────────────────────────────────────────── */}
      {bandwidth && !slicePanels && (
        <div className="mt-0.5 text-[10px] font-mono text-gray-500 tracking-wide">
          BW {bandwidth}
        </div>
      )}

      {/* ── Slice panel tabs (SmartSDR-style expandable controls) ──── */}
      {slicePanels && <SlicePanelTabs controls={slicePanels} />}
    </div>
  );
}

// ─── DSP Status Badge ────────────────────────────────────────────────────────

function DspBadge({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  const isInteractive = !!onClick;
  const base =
    "px-1 py-0 rounded text-[9px] font-bold font-mono border leading-[16px]";
  const state = active
    ? "bg-signal-green/20 text-signal-green border-signal-green/30"
    : "text-gray-600 bg-white/5 border-white/10";
  const interactive = isInteractive
    ? "cursor-pointer hover:brightness-125 active:scale-95 transition-all"
    : "";

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} ${state} ${interactive}`}
        title={`Toggle ${label}`}
      >
        {label}
      </button>
    );
  }

  return <span className={`${base} ${state}`}>{label}</span>;
}

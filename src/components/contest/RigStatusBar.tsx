/**
 * RigStatusBar - Always-visible rig frequency/mode indicator
 *
 * Shows the current rig state in a prominent, always-visible display:
 * - Large frequency readout (e.g., "14.035.00 MHz")
 * - Band and mode badges (e.g., "20m CW")
 * - CAT control indicator
 * - ProPulse aesthetic styling
 */

import { useMemo } from "react";
import type { RigMode, RigStatus } from "@/types/bridge";
import { formatFrequency, frequencyToBand } from "@/types/bridge";
import { getModeTailwindColor } from "@/lib/utils/spotColors";

export interface RigStatusBarProps {
  /** Current frequency in Hz */
  frequency: number;
  /** Current operating mode */
  mode: RigMode | string;
  /** Current band (computed from frequency if not provided) */
  band?: string;
  /** Full rig status (optional, for extended info) */
  status?: RigStatus | null;
  /** Whether bridge is connected */
  connected: boolean;
  /** Whether rig is CAT controlled */
  isCATControlled?: boolean;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Callback when frequency display is clicked */
  onFrequencyClick?: () => void;
  /** Callback when mode is clicked */
  onModeClick?: () => void;
}

/**
 * Get color for band badge
 */
function getBandColor(band: string): string {
  const bandColors: Record<string, string> = {
    "160m": "text-purple-400 bg-purple-400/10 border-purple-400/30",
    "80m": "text-blue-400 bg-blue-400/10 border-blue-400/30",
    "60m": "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
    "40m": "text-teal-400 bg-teal-400/10 border-teal-400/30",
    "30m": "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    "20m": "text-plasma-orange bg-plasma-orange/10 border-plasma-orange/30",
    "17m": "text-amber-400 bg-amber-400/10 border-amber-400/30",
    "15m": "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    "12m": "text-lime-400 bg-lime-400/10 border-lime-400/30",
    "10m": "text-signal-green bg-signal-green/10 border-signal-green/30",
    "6m": "text-pink-400 bg-pink-400/10 border-pink-400/30",
    "2m": "text-rose-400 bg-rose-400/10 border-rose-400/30",
    "70cm": "text-red-400 bg-red-400/10 border-red-400/30",
  };

  return bandColors[band] || "text-gray-400 bg-gray-400/10 border-gray-400/30";
}

/**
 * Format mode for display (normalize common modes)
 */
function formatMode(mode: string): string {
  const modeMap: Record<string, string> = {
    CW: "CW",
    "CW-R": "CW",
    LSB: "LSB",
    USB: "USB",
    SSB: "SSB",
    AM: "AM",
    FM: "FM",
    RTTY: "RTTY",
    "RTTY-R": "RTTY",
    DATA: "DATA",
    "DATA-R": "DATA",
    PSK: "PSK",
    FT8: "FT8",
    FT4: "FT4",
  };

  return modeMap[mode.toUpperCase()] || mode.toUpperCase();
}

/**
 * Always-visible rig frequency and mode indicator
 *
 * @example
 * ```tsx
 * const { frequency, mode, band, connected, isCATControlled } = useRigBridge();
 *
 * <RigStatusBar
 *   frequency={frequency}
 *   mode={mode}
 *   band={band}
 *   connected={connected}
 *   isCATControlled={isCATControlled}
 * />
 * ```
 */
export function RigStatusBar({
  frequency,
  mode,
  band,
  status,
  connected,
  isCATControlled = false,
  compact = false,
  className = "",
  onFrequencyClick,
  onModeClick,
}: RigStatusBarProps) {
  // Compute band from frequency if not provided
  const displayBand = band || frequencyToBand(frequency);
  const displayMode = formatMode(mode);
  const displayFrequency = formatFrequency(frequency);

  const bandColorClasses = useMemo(
    () => getBandColor(displayBand),
    [displayBand],
  );
  const modeColorClasses = useMemo(
    () => getModeTailwindColor(displayMode),
    [displayMode],
  );

  // Split indicator - show when rig is in split mode
  const showSplit = status?.split;

  if (!connected) {
    return (
      <div
        className={`
          flex items-center gap-3 px-4 py-2 rounded-lg
          bg-white/[0.02] border border-white/5
          ${className}
        `}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-500" />
          <span className="text-gray-500 text-sm font-medium">
            Bridge Offline
          </span>
        </div>
        <span className="text-gray-600 text-xs">Rig control unavailable</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-lg
          bg-white/[0.03] border border-white/10
          ${className}
        `}
      >
        {/* Band badge */}
        <span
          className={`
            px-1.5 py-0.5 text-xs font-bold uppercase rounded border
            ${bandColorClasses}
          `}
        >
          {displayBand}
        </span>

        {/* Mode badge */}
        <span
          className={`
            px-1.5 py-0.5 text-xs font-bold uppercase rounded border
            ${modeColorClasses}
          `}
        >
          {displayMode}
        </span>

        {/* Frequency */}
        <span className="font-mono text-sm text-white font-medium">
          {displayFrequency}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`
        flex items-center gap-4 px-4 py-2 rounded-lg
        bg-white/[0.03] backdrop-blur-sm
        border border-white/10
        ${className}
      `}
    >
      {/* CAT/Manual indicator */}
      <div
        className="flex flex-col items-center"
        title={isCATControlled ? "CAT Control Active" : "Manual Tuning"}
      >
        <span
          className={`
            w-2 h-2 rounded-full
            ${isCATControlled ? "bg-signal-green shadow-[0_0_6px_#00ff88]" : "bg-gray-500"}
          `}
        />
        <span className="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wider">
          {isCATControlled ? "CAT" : "MAN"}
        </span>
      </div>

      {/* Divider */}
      <div className="h-8 w-px bg-white/10" />

      {/* Band badge */}
      <button
        onClick={onModeClick}
        disabled={!onModeClick}
        className={`
          px-2.5 py-1 text-sm font-bold uppercase rounded-md border
          transition-colors
          ${bandColorClasses}
          ${onModeClick ? "cursor-pointer hover:bg-white/5" : "cursor-default"}
        `}
        type="button"
      >
        {displayBand}
      </button>

      {/* Mode badge */}
      <button
        onClick={onModeClick}
        disabled={!onModeClick}
        className={`
          px-2.5 py-1 text-sm font-bold uppercase rounded-md border
          transition-colors
          ${modeColorClasses}
          ${onModeClick ? "cursor-pointer hover:bg-white/5" : "cursor-default"}
        `}
        type="button"
      >
        {displayMode}
      </button>

      {/* Divider */}
      <div className="h-8 w-px bg-white/10" />

      {/* Large frequency display */}
      <button
        onClick={onFrequencyClick}
        disabled={!onFrequencyClick}
        className={`
          font-mono text-2xl font-bold text-white tracking-wide
          transition-colors
          ${onFrequencyClick ? "cursor-pointer hover:text-plasma-orange" : "cursor-default"}
        `}
        title={`${frequency.toLocaleString()} Hz`}
        type="button"
      >
        {displayFrequency}
      </button>

      {/* Split indicator */}
      {showSplit && (
        <>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex flex-col items-center">
            <span className="text-plasma-orange text-xs font-bold uppercase">
              SPLIT
            </span>
            {status?.txFrequency && (
              <span className="text-[10px] text-gray-400 font-mono">
                TX: {formatFrequency(status.txFrequency)}
              </span>
            )}
          </div>
        </>
      )}

      {/* PTT indicator */}
      {status?.ptt && (
        <>
          <div className="h-8 w-px bg-white/10" />
          <span
            className={`
              px-2 py-1 text-xs font-bold uppercase rounded
              bg-alert-red/20 border border-alert-red/50 text-alert-red
              animate-pulse
            `}
          >
            TX
          </span>
        </>
      )}
    </div>
  );
}

export default RigStatusBar;

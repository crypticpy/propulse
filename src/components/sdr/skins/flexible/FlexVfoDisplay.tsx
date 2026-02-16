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
import {
  getModeTextClass,
  getModeBgClass,
  getModeAccentCss,
} from "@/lib/sdr/modeColors";
import { FrequencyDisplay } from "@/components/sdr/primitives/FrequencyDisplay";
import { SmeterBar } from "@/components/sdr/primitives/SmeterBar";
import { DspBadge } from "@/components/sdr/primitives/DspBadge";
import { RadioBadge } from "@/components/sdr/primitives/RadioBadge";
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
  const bandwidth = useMemo(
    () => formatBandwidth(filterLow, filterHigh),
    [filterLow, filterHigh],
  );

  const modeUpper = mode?.toUpperCase() ?? null;
  const accentColor = getModeAccentCss(mode);

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
        {antenna && <RadioBadge label={antenna} />}

        {/* DSP badges: NB, NR, AGC — interactive when callbacks provided */}
        <DspBadge label="NB" active={nbEnabled} onClick={onNbToggle} />
        <DspBadge label="NR" active={nrEnabled} onClick={onNrToggle} />
        <DspBadge label="AGC" active={agcEnabled} onClick={onAgcToggle} />

        {/* Bandwidth badge */}
        {bandwidth && <RadioBadge label={bandwidth} />}

        {/* TX / RX indicator */}
        {ptt ? (
          <RadioBadge label="TX" variant="danger" pulse />
        ) : (
          <RadioBadge label="RX" variant="success" />
        )}
      </div>

      {/* ── S-meter bar ──────────────────────────────────────────────── */}
      <SmeterBar dbm={smeterDbm} className="mb-0.5" />

      {/* ── Frequency row ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Segmented frequency display */}
        <FrequencyDisplay freqHz={freqHz} size="lg" glow />

        {/* Mode pill */}
        <div className="flex items-center gap-1.5 ml-auto">
          {modeUpper && (
            <span
              className={`
                px-2 py-0.5 rounded text-xs font-bold font-mono border
                ${getModeTextClass(modeUpper)} ${getModeBgClass(modeUpper)}
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

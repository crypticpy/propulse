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

import { memo, useMemo, useState, useCallback } from "react";
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

export type SliceFlagSize = "min" | "normal" | "max";

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

  // ── New radio state fields (Package 1) ──
  /** RIT state */
  rit?: { enabled: boolean; offsetHz: number };
  /** XIT state */
  xit?: { enabled: boolean; offsetHz: number };
  /** Split mode active */
  split?: boolean;
  /** Frequency lock (client-side) */
  lock?: boolean;
  /** Auto notch filter enabled */
  anf?: boolean;
  /** Full break-in CW */
  qsk?: boolean;
  /** Voice-operated transmit */
  vox?: boolean;
  /** TX antenna (when different from RX) */
  txAntenna?: string;
  /** TX meter readings (shown during transmit) */
  txMeter?: { powerW?: number; swr?: number; alc?: number };
  /** CW keyer speed in WPM */
  cwSpeed?: number;
  /** IF shift in Hz */
  ifShift?: number;

  // ── Interactive callbacks (optional — omit for display-only) ──
  /** Swap VFO A/B. Omit to render label as non-interactive. */
  onVfoSwap?: () => void;
  /** Toggle noise blanker. Omit to render NB as non-interactive. */
  onNbToggle?: () => void;
  /** Toggle noise reduction. */
  onNrToggle?: () => void;
  /** Toggle AGC. */
  onAgcToggle?: () => void;
  /** Toggle frequency lock. */
  onLockToggle?: () => void;

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

export const FlexVfoDisplay = memo(function FlexVfoDisplay({
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
  rit,
  xit,
  split = false,
  lock = false,
  anf = false,
  qsk = false,
  vox = false,
  txAntenna,
  txMeter,
  cwSpeed,
  ifShift,
  onVfoSwap,
  onNbToggle,
  onNrToggle,
  onAgcToggle,
  onLockToggle,
  slicePanels,
}: FlexVfoDisplayProps) {
  const [size, setSize] = useState<SliceFlagSize>("normal");

  const cycleSize = useCallback(() => {
    setSize((s) => (s === "min" ? "normal" : s === "normal" ? "max" : "min"));
  }, []);

  const bandwidth = useMemo(
    () => formatBandwidth(filterLow, filterHigh),
    [filterLow, filterHigh],
  );

  const modeUpper = mode?.toUpperCase() ?? null;
  const accentColor = getModeAccentCss(mode);
  const isCw = modeUpper === "CW" || modeUpper === "CWR";
  const ritActive = rit?.enabled && rit.offsetHz !== 0;
  const xitActive = xit?.enabled && xit.offsetHz !== 0;
  const showTxAntenna = txAntenna && txAntenna !== antenna;
  const isMin = size === "min";
  const isMax = size === "max";

  // ── Min mode: compact single-line display ─────────────────────────
  if (isMin) {
    return (
      <div
        className="backdrop-blur-sm rounded-lg px-2 py-1 select-none border border-white/10 cursor-pointer pointer-events-auto"
        style={{
          backgroundColor: bgColor,
          boxShadow: `inset 3px 0 0 ${accentColor}, 0 2px 12px rgba(0,0,0,0.5)`,
        }}
        onClick={cycleSize}
        title="Click to expand slice flag"
      >
        <div className="flex items-center gap-2">
          <FrequencyDisplay freqHz={freqHz} size="sm" glow />
          {modeUpper && (
            <span
              className={`
                px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border
                ${getModeTextClass(modeUpper)} ${getModeBgClass(modeUpper)}
              `}
            >
              {modeUpper}
            </span>
          )}
          {ptt ? (
            <RadioBadge label="TX" variant="danger" pulse size="xs" />
          ) : (
            <SmeterBar dbm={smeterDbm} size="compact" className="w-20" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="backdrop-blur-sm rounded-lg px-3 py-1.5 select-none min-w-[280px] border border-white/10 pointer-events-none"
      style={{
        backgroundColor: bgColor,
        boxShadow: `inset 3px 0 0 ${accentColor}, 0 4px 24px rgba(0,0,0,0.6), 0 1px 6px rgba(0,0,0,0.4)`,
      }}
    >
      {/* ── Row 1: VFO label + status badges ─────────────────────────── */}
      <div className="flex items-center gap-1 mb-0.5">
        {/* VFO label */}
        {onVfoSwap ? (
          <button
            onClick={onVfoSwap}
            className="pointer-events-auto text-[10px] font-bold tracking-wider hover:brightness-125 active:scale-95 transition-all cursor-pointer"
            style={{ color: accentColor }}
            title="Switch VFO"
          >
            VFO {vfo ?? "A"}
          </button>
        ) : (
          <span
            className="text-[10px] font-bold tracking-wider"
            style={{ color: accentColor }}
          >
            VFO {vfo ?? "A"}
          </span>
        )}

        <div className="flex-1" />

        {/* Antenna badge */}
        {antenna && <RadioBadge label={antenna} />}

        {/* TX antenna when different */}
        {showTxAntenna && (
          <RadioBadge label={`TX:${txAntenna}`} variant="warning" />
        )}

        {/* SPLIT badge */}
        {split && <RadioBadge label="SPLIT" variant="warning" />}

        {/* Frequency lock control */}
        {onLockToggle && (
          <span className="pointer-events-auto">
            <RadioBadge
              label={lock ? "LOCK" : "UNLOCKED"}
              variant={lock ? "accent" : "default"}
              onClick={onLockToggle}
              icon={
                <svg
                  className="w-2.5 h-2.5"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M8 1a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3zm-1.5 3a1.5 1.5 0 1 1 3 0v2h-3V4z" />
                </svg>
              }
            />
          </span>
        )}

        {/* Size toggle button */}
        <button
          onClick={cycleSize}
          className="pointer-events-auto text-[8px] font-bold text-gray-500 hover:text-gray-300 transition-colors px-0.5"
          title={isMax ? "Collapse to normal" : "Expand to max"}
        >
          {isMax ? "\u25B4" : "\u25BE"}
        </button>

        {/* TX / RX indicator */}
        {ptt ? (
          <RadioBadge label="TX" variant="danger" pulse />
        ) : (
          <RadioBadge label="RX" variant="success" />
        )}
      </div>

      {/* ── Row 2: DSP badges ────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-0.5">
        <span className={onNbToggle ? "pointer-events-auto" : undefined}>
          <DspBadge label="NB" active={nbEnabled} onClick={onNbToggle} />
        </span>
        <span className={onNrToggle ? "pointer-events-auto" : undefined}>
          <DspBadge label="NR" active={nrEnabled} onClick={onNrToggle} />
        </span>
        <span className={onAgcToggle ? "pointer-events-auto" : undefined}>
          <DspBadge label="AGC" active={agcEnabled} onClick={onAgcToggle} />
        </span>
        <DspBadge label="ANF" active={anf} />
        {qsk && <DspBadge label="QSK" active />}
        {vox && <DspBadge label="VOX" active />}

        <div className="flex-1" />

        {/* Bandwidth badge */}
        {bandwidth && <RadioBadge label={bandwidth} />}

        {/* CW speed — only in CW modes */}
        {isCw && cwSpeed != null && (
          <span className="text-[9px] font-mono text-signal-green/80">
            {cwSpeed} WPM
          </span>
        )}
      </div>

      {/* ── S-meter / TX meter bar ───────────────────────────────────── */}
      {ptt && txMeter ? (
        <TxMeterBar txMeter={txMeter} />
      ) : (
        <SmeterBar dbm={smeterDbm} size="compact" className="mb-0.5" />
      )}

      {/* ── Frequency row ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <FrequencyDisplay freqHz={freqHz} size="lg" glow />

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

      {/* ── RIT/XIT offset display ───────────────────────────────────── */}
      {(ritActive || xitActive || (ifShift != null && ifShift !== 0)) && (
        <div className="flex items-center gap-2 mt-0.5">
          {ritActive && (
            <span className="text-[9px] font-mono text-plasma-orange">
              RIT {rit.offsetHz >= 0 ? "+" : ""}
              {rit.offsetHz}
            </span>
          )}
          {xitActive && (
            <span className="text-[9px] font-mono text-cosmic-cyan">
              XIT {xit.offsetHz >= 0 ? "+" : ""}
              {xit.offsetHz}
            </span>
          )}
          {ifShift != null && ifShift !== 0 && (
            <span className="text-[9px] font-mono text-nebula-blue">
              IF {ifShift >= 0 ? "+" : ""}
              {ifShift}
            </span>
          )}
        </div>
      )}

      {/* ── Bottom info row ──────────────────────────────────────────── */}
      {bandwidth && !slicePanels && (
        <div className="mt-0.5 text-[10px] font-mono text-gray-500 tracking-wide">
          BW {bandwidth}
        </div>
      )}

      {/* ── Slice panel tabs (SmartSDR-style expandable controls) ──── */}
      {/* Max mode: panels always visible; Normal mode: still available */}
      {slicePanels && (
        <div className="pointer-events-auto">
          <SlicePanelTabs controls={slicePanels} />
        </div>
      )}
    </div>
  );
});

// ─── TX Meter Bar ─────────────────────────────────────────────────────────

function TxMeterBar({
  txMeter,
}: {
  txMeter: { powerW?: number; swr?: number; alc?: number };
}) {
  const { powerW, swr, alc } = txMeter;

  return (
    <div className="flex items-center gap-2 mb-0.5 h-4">
      {/* Power */}
      {powerW != null && (
        <div className="flex items-center gap-1 flex-1">
          <span className="text-[8px] font-semibold text-gray-500 w-6">
            PWR
          </span>
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-alert-red/80 rounded-full transition-[width] duration-75"
              style={{ width: `${Math.min(100, (powerW / 100) * 100)}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-alert-red/80 w-8 text-right">
            {powerW.toFixed(0)}W
          </span>
        </div>
      )}

      {/* SWR */}
      {swr != null && (
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-semibold text-gray-500">SWR</span>
          <span
            className={`text-[9px] font-mono font-semibold ${
              swr > 3
                ? "text-alert-red"
                : swr > 2
                  ? "text-caution-amber"
                  : "text-signal-green"
            }`}
          >
            {swr.toFixed(1)}
          </span>
        </div>
      )}

      {/* ALC */}
      {alc != null && (
        <div className="flex items-center gap-1">
          <span className="text-[8px] font-semibold text-gray-500">ALC</span>
          <div className="w-8 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-75 ${
                alc > 80 ? "bg-alert-red/80" : "bg-signal-green/70"
              }`}
              style={{ width: `${Math.min(100, alc)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

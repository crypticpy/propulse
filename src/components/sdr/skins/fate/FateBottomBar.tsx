/**
 * FateBottomBar — Status bar for the Fate (F8) FT8/FT4 skin.
 *
 * Displays VFO frequency, band pill, connection status, decode stats,
 * TX indicator, and a live UTC clock. Designed to be information-dense
 * yet scannable at a glance during FT8 operation.
 */

import { useState, useEffect } from "react";
import { BAND_COLORS } from "@/lib/utils/spotColors";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FateBottomBarProps {
  daemonConnected: boolean;
  radioName: string | null;
  freqHz: number | null;
  vfo: "A" | "B" | null;
  activeBand: string | null;
  ptt: boolean;
  ft8DecoderEnabled: boolean;
  ft8DecoderStats: {
    totalDecodes: number;
    cyclesCompleted: number;
    lastCycleDecodes: number;
    workerReady: boolean;
  };
}

// ─── UTC clock helper ────────────────────────────────────────────────────────

function formatUtc(): string {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}Z`;
}

// ─── Frequency display formatter ─────────────────────────────────────────────

function formatFreqDisplay(hz: number): string {
  // Format as XX.XXX.XXX (radio-style dotted notation)
  const khz = hz / 1000;
  const mhz = Math.floor(khz / 1000);
  const remainder = khz - mhz * 1000;
  const khzPart = Math.floor(remainder);
  const hzPart = Math.round((remainder - khzPart) * 1000);
  return `${mhz}.${String(khzPart).padStart(3, "0")}.${String(hzPart).padStart(3, "0")}`;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function FateBottomBar({
  daemonConnected,
  radioName,
  freqHz,
  vfo,
  activeBand,
  ptt,
  ft8DecoderEnabled,
  ft8DecoderStats,
}: FateBottomBarProps) {
  const [utc, setUtc] = useState(() => formatUtc());

  useEffect(() => {
    const id = setInterval(() => setUtc(formatUtc()), 1000);
    return () => clearInterval(id);
  }, []);

  const bandColor = activeBand
    ? (BAND_COLORS[activeBand] ?? BAND_COLORS.default)
    : BAND_COLORS.default;

  return (
    <div className="flex w-full items-center justify-between bg-[#0c0c16] border-t border-white/10 px-3 h-8 shrink-0">
      {/* Left section: VFO frequency + band pill + connection */}
      <div className="flex items-center gap-2">
        {/* VFO frequency */}
        <span className="font-mono text-[12px] font-medium text-cosmic-cyan tabular-nums tracking-wide">
          {freqHz ? `${formatFreqDisplay(freqHz)} MHz` : "—.———.——— MHz"}
        </span>

        {/* Band pill */}
        {activeBand && (
          <span
            className="px-1.5 py-0.5 text-[9px] font-bold rounded tracking-wide"
            style={{
              color: bandColor,
              backgroundColor: `${bandColor}18`,
              border: `1px solid ${bandColor}30`,
            }}
          >
            {activeBand}
          </span>
        )}

        {/* Separator */}
        <span className="text-white/10">|</span>

        {/* Connection dot + radio name */}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
              daemonConnected ? "bg-signal-green" : "bg-gray-600"
            }`}
          />
          <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
            {radioName ?? "No Radio"}
          </span>
        </div>

        {/* VFO badge */}
        {vfo && (
          <span className="px-1 py-0.5 text-[9px] font-mono font-semibold rounded bg-white/8 text-gray-300 border border-white/10">
            VFO {vfo}
          </span>
        )}
      </div>

      {/* Center section: Decode stats */}
      <div className="flex items-center gap-2">
        {ft8DecoderEnabled && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono">
            <span className="text-white/60">
              {ft8DecoderStats.totalDecodes}
            </span>
            <span className="text-white/20">decoded</span>
            <span className="text-white/10">|</span>
            <span className="text-white/60">
              {ft8DecoderStats.lastCycleDecodes}
            </span>
            <span className="text-white/20">/cycle</span>
            <span className="text-white/10">|</span>
            <span
              className={
                ft8DecoderStats.workerReady
                  ? "text-signal-green/60"
                  : "text-caution-amber/60"
              }
            >
              {ft8DecoderStats.workerReady ? "WASM ready" : "WASM loading"}
            </span>
          </div>
        )}
      </div>

      {/* Right section: Keyboard hints + TX badge + UTC clock */}
      <div className="flex items-center gap-3">
        {/* Compact keyboard shortcut legend */}
        <span className="text-[8px] text-gray-600 hidden sm:inline">
          F1-F11: Bands &middot; Space: Log &middot; C: CQ &middot; D: Decode
        </span>

        {/* TX badge */}
        {ptt && (
          <span className="animate-pulse rounded bg-alert-red px-1.5 py-0.5 text-[10px] font-bold text-white leading-none shadow-[0_0_8px_rgba(255,68,68,0.5)]">
            TX
          </span>
        )}

        {/* UTC clock */}
        <span className="font-mono text-[11px] text-gray-400 tabular-nums">
          {utc}
        </span>
      </div>
    </div>
  );
}

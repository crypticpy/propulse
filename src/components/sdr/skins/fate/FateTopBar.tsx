/**
 * FateTopBar — Header bar for the Fate (F8) FT8/FT4 skin.
 *
 * Displays decoder toggle, FT8/FT4 mode pills, cycle progress bar,
 * dial frequency switcher, error display, and skin switcher controls.
 * Purpose-built for dense digital-mode hunting workflows.
 */

import { FT8_DIAL_FREQUENCIES } from "./useFateDecodes";
import { BAND_COLORS } from "@/lib/utils/spotColors";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { FateBandAdvisor } from "./FateBandAdvisor";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FateTopBarProps {
  ft8DecoderEnabled: boolean;
  ft8DecoderMode: "FT8" | "FT4";
  ft8CycleProgress: number;
  ft8Error: string | null;
  freqHz: number | null;
  showCqOnly: boolean;
  isMobile: boolean;
  onCqFilterChange: (value: boolean) => void;
  onFt8Toggle: () => void;
  onFt8ModeChange: (mode: "FT8" | "FT4") => void;
  onPickFrequencyHz: (hz: number) => void;
}

// ─── Inline: Cycle progress bar ──────────────────────────────────────────────

function FateCycleBar({
  progress,
  mode,
  active,
}: {
  progress: number;
  mode: "FT8" | "FT4";
  active: boolean;
}) {
  if (!active) {
    return (
      <div className="flex-1 min-w-[80px] max-w-[200px]">
        <div className="h-1.5 w-full rounded-full bg-white/5" />
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, progress * 100));
  const cycleSec = mode === "FT8" ? "15s" : "7.5s";

  return (
    <div
      className="flex-1 min-w-[80px] max-w-[200px] flex flex-col gap-0.5"
      title={`${mode} cycle (${cycleSec}): ${pct.toFixed(0)}%`}
    >
      <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden relative">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cosmic-cyan to-signal-green transition-[width] duration-200 ease-linear"
          style={{ width: `${pct}%` }}
        />
        {/* Pulsing glow at leading edge */}
        {pct > 2 && (
          <div
            className="absolute top-0 bottom-0 w-2 rounded-full animate-pulse"
            style={{
              left: `calc(${pct}% - 4px)`,
              background:
                "radial-gradient(circle, rgba(0,255,136,0.6) 0%, transparent 70%)",
            }}
          />
        )}
      </div>
      <span className="text-[8px] text-white/30 font-mono text-center leading-none">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── Inline: Dial frequency switcher ─────────────────────────────────────────

function FateDialSwitcher({
  currentMode,
  freqHz,
  onPickFrequencyHz,
}: {
  currentMode: "FT8" | "FT4";
  freqHz: number | null;
  onPickFrequencyHz: (hz: number) => void;
}) {
  const filtered = FT8_DIAL_FREQUENCIES.filter((f) => f.mode === currentMode);

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
      {filtered.map((dial) => {
        // Match within +/- 1kHz
        const isActive =
          freqHz !== null && Math.abs(freqHz - dial.freqHz) <= 1000;
        const bandColor = BAND_COLORS[dial.band] ?? BAND_COLORS.default;

        return (
          <button
            key={`${dial.band}-${dial.mode}-${dial.freqHz}`}
            type="button"
            onClick={() => onPickFrequencyHz(dial.freqHz)}
            className={`
              shrink-0 px-2.5 py-1 rounded-md font-mono
              transition-all duration-150 border flex flex-col items-center leading-none gap-0.5
              ${
                isActive
                  ? "border-white/30 shadow-[0_0_8px_0px_rgba(255,255,255,0.2)]"
                  : "border-white/5 hover:border-white/15 hover:bg-white/[0.04]"
              }
            `}
            style={{
              backgroundColor: isActive ? `${bandColor}20` : undefined,
              color: isActive ? bandColor : "rgba(255,255,255,0.5)",
            }}
            title={`Tune to ${dial.band} ${dial.mode} — ${dial.label} MHz`}
          >
            <span className="text-[11px] font-bold">{dial.band}</span>
            <span
              className="text-[9px] tabular-nums"
              style={{ color: isActive ? bandColor : "rgba(255,255,255,0.3)" }}
            >
              {dial.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function FateTopBar({
  ft8DecoderEnabled,
  ft8DecoderMode,
  ft8CycleProgress,
  ft8Error,
  freqHz,
  showCqOnly,
  onCqFilterChange,
  onFt8Toggle,
  onFt8ModeChange,
  onPickFrequencyHz,
}: FateTopBarProps) {
  // Determine current band from frequency for context
  const currentBand = freqHz ? bandFromFreq(freqHz / 1000) : null;

  return (
    <div className="flex flex-col bg-[#0c0c16] border-b border-white/10 shrink-0">
      {/* Row 1: Controls bar */}
      <div className="flex w-full items-center gap-2 px-3 h-10">
        {/* 1. Decoder toggle */}
        <button
          type="button"
          onClick={onFt8Toggle}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold
            transition-all duration-200 border shrink-0
            ${
              ft8DecoderEnabled
                ? "border-signal-green/30 bg-signal-green/10 text-signal-green hover:bg-signal-green/15"
                : "border-white/10 bg-white/[0.03] text-gray-500 hover:text-gray-300 hover:border-white/15"
            }
          `}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full shrink-0 ${
              ft8DecoderEnabled
                ? "bg-signal-green animate-pulse shadow-[0_0_6px_rgba(0,255,136,0.5)]"
                : "bg-gray-600"
            }`}
          />
          {ft8DecoderEnabled ? "DECODING" : "DECODER OFF"}
        </button>

        {/* 2. FT8 / FT4 mode pills */}
        <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.02] p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onFt8ModeChange("FT8")}
            className={`
              px-2 py-0.5 rounded text-[10px] font-bold tracking-wide transition-colors
              ${
                ft8DecoderMode === "FT8"
                  ? "bg-signal-green/15 text-signal-green"
                  : "text-gray-500 hover:text-gray-300"
              }
            `}
          >
            FT8
          </button>
          <button
            type="button"
            onClick={() => onFt8ModeChange("FT4")}
            className={`
              px-2 py-0.5 rounded text-[10px] font-bold tracking-wide transition-colors
              ${
                ft8DecoderMode === "FT4"
                  ? "bg-cosmic-cyan/15 text-cosmic-cyan"
                  : "text-gray-500 hover:text-gray-300"
              }
            `}
          >
            FT4
          </button>
        </div>

        {/* 2b. CQ filter toggle */}
        <button
          type="button"
          onClick={() => onCqFilterChange(!showCqOnly)}
          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
            showCqOnly
              ? "bg-signal-green/15 text-signal-green"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          CQ
        </button>

        {/* 3. Cycle progress bar */}
        <FateCycleBar
          progress={ft8CycleProgress}
          mode={ft8DecoderMode}
          active={ft8DecoderEnabled}
        />

        {/* 4. Error display */}
        {ft8Error && (
          <span
            className="text-[10px] text-alert-red truncate max-w-[200px] shrink"
            title={ft8Error}
          >
            {ft8Error}
          </span>
        )}

        {/* Current band context (subtle) */}
        {currentBand && (
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0"
            style={{
              color: BAND_COLORS[currentBand] ?? BAND_COLORS.default,
              backgroundColor: `${BAND_COLORS[currentBand] ?? BAND_COLORS.default}10`,
            }}
          >
            {currentBand}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />
      </div>

      {/* Row 2: Band/Dial frequency selector — full-width, easy to hit */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-white/5 bg-[#0a0a14]">
        <span className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold shrink-0 mr-1">
          Tune
        </span>
        <FateDialSwitcher
          currentMode={ft8DecoderMode}
          freqHz={freqHz}
          onPickFrequencyHz={onPickFrequencyHz}
        />
      </div>

      {/* Row 3: Propagation band advisor */}
      <FateBandAdvisor currentBand={currentBand} freqHz={freqHz} />
    </div>
  );
}

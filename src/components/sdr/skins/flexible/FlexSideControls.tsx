/**
 * FlexSideControls -- Right sidebar (280px) control surface for the
 * FlexRadio SmartSDR-inspired Flexible SDR skin.
 *
 * DSP, filter, mode, RX gain, and audio controls have migrated to the
 * slice flag's expandable panels (SlicePanelTabs). This sidebar now
 * handles band/frequency tuning, TX controls, streams, FT8 decoder,
 * and notch filters.
 */

import { useMemo, useState, type KeyboardEvent } from "react";
import type { RadioState, DeviceInfo } from "@/lib/radio/protocol";
import { ALL_BANDS } from "@/types/user";
import type { BandId } from "@/types/user";
import { BAND_CENTER_FREQUENCIES } from "@/lib/data/feedlines";
import { BAND_COLORS } from "@/lib/utils/spotColors";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { SidebarAccordion } from "./SidebarAccordion";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface NotchFilter {
  id: string;
  freqHz: number;
  q: number;
  enabled: boolean;
}

export interface FlexSideControlsProps {
  effectiveState: RadioState | null;
  selectedDevice: DeviceInfo | null;
  canControlConnected: boolean;

  canStreamFft: boolean;
  canStreamAudio: boolean;
  fftEnabled: boolean;
  audioEnabled: boolean;

  freqInput: string;
  freqUnit: "MHz" | "kHz" | "Hz";

  // Notch filters
  notchFilters: NotchFilter[];
  onAddNotch: (freqHz: number, q: number) => void;
  onRemoveNotch: (id: string) => void;
  onUpdateNotch: (id: string, freqHz: number, q: number) => void;
  onToggleNotch: (id: string, enabled: boolean) => void;

  onTune: () => void;
  onFreqInputChange: (value: string) => void;
  onFreqUnitChange: (unit: "MHz" | "kHz" | "Hz") => void;
  onAntennaChange: (port: string) => void;
  onGainChange: (stage: string, value: number) => void;
  onToggleFft: () => void;
  onToggleAudio: () => void;

  // Tuning step
  tuningStepHz: number;
  onTuningStepChange: (stepHz: number) => void;

  // VFO
  vfo?: "A" | "B" | null;
  onVfoChange?: (vfo: "A" | "B") => void;

  // Band selection
  freqHz: number | null;
  onBandSelect: (freqHz: number) => void;

  // Antenna (for ANT cycling in sidebar)
  hasMultipleAntennas: boolean;
  antennas: string[];

  // FT8/FT4 Decoder
  ft8DecoderEnabled: boolean;
  ft8DecoderMode: "FT8" | "FT4";
  ft8CycleProgress: number;
  ft8DecoderStats: {
    totalDecodes: number;
    cyclesCompleted: number;
    lastCycleDecodes: number;
    workerReady: boolean;
  };
  ft8Error: string | null;
  onFt8Toggle: () => void;
  onFt8ModeChange: (mode: "FT8" | "FT4") => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FREQ_UNITS: Array<"MHz" | "kHz" | "Hz"> = ["MHz", "kHz", "Hz"];

const STEP_OPTIONS = [
  { label: "100 Hz", value: 100 },
  { label: "500 Hz", value: 500 },
  { label: "1K", value: 1000 },
  { label: "5K", value: 5000 },
  { label: "10K", value: 10000 },
  { label: "25K", value: 25000 },
] as const;

const MAX_NOTCH_FILTERS = 8;

const TX_STAGE_NAMES = ["RFPOWER", "MICGAIN", "COMP", "VOXGAIN"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
      {children}
    </div>
  );
}

function NotchFilterRow({
  notch,
  onUpdate,
  onToggle,
  onRemove,
}: {
  notch: NotchFilter;
  onUpdate: (freqHz: number, q: number) => void;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}) {
  const [localFreq, setLocalFreq] = useState(String(notch.freqHz));

  const commitFreq = () => {
    const parsed = parseInt(localFreq, 10);
    if (Number.isFinite(parsed) && parsed >= 20 && parsed <= 20000) {
      onUpdate(parsed, notch.q);
    } else {
      setLocalFreq(String(notch.freqHz));
    }
  };

  const handleFreqKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitFreq();
    }
  };

  return (
    <div
      className={`rounded border p-1.5 space-y-1 transition-opacity ${
        notch.enabled
          ? "border-plasma-orange/25 bg-plasma-orange/5"
          : "border-white/5 bg-white/[0.02] opacity-50"
      }`}
    >
      {/* Row 1: Freq label + toggle + remove */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-mono text-gray-300 truncate">
          {notch.freqHz} Hz
        </span>
        <span className="text-[10px] text-gray-500">Q: {notch.q}</span>
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button
            onClick={() => onToggle(!notch.enabled)}
            className={`px-1 py-0.5 text-[9px] font-semibold rounded border transition-colors ${
              notch.enabled
                ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
                : "bg-white/5 border-white/10 text-gray-500"
            }`}
            title={notch.enabled ? "Disable notch" : "Enable notch"}
          >
            {notch.enabled ? "On" : "Off"}
          </button>
          <button
            onClick={onRemove}
            className="px-1 py-0.5 text-[9px] font-semibold rounded border
              bg-alert-red/10 border-alert-red/25 text-alert-red/70
              hover:bg-alert-red/20 hover:text-alert-red transition-colors"
            title="Remove notch filter"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Row 2: Freq input */}
      <div className="flex items-center gap-1">
        <label className="text-[9px] text-gray-500 shrink-0 w-7">Freq</label>
        <input
          type="number"
          min={20}
          max={20000}
          step={1}
          value={localFreq}
          onChange={(e) => setLocalFreq(e.target.value)}
          onBlur={commitFreq}
          onKeyDown={handleFreqKeyDown}
          className="flex-1 min-w-0 px-1.5 py-0.5 text-[10px] font-mono text-white
            bg-black/40 border border-white/10 rounded
            focus:border-cosmic-cyan/50 focus:outline-none
            [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
            [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-[9px] text-gray-500 shrink-0">Hz</span>
      </div>

      {/* Row 3: Q slider */}
      <div className="flex items-center gap-1">
        <label className="text-[9px] text-gray-500 shrink-0 w-7">Q</label>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={notch.q}
          onChange={(e) => onUpdate(notch.freqHz, Number(e.target.value))}
          className="flex-1 h-1 accent-plasma-orange"
        />
        <span className="text-[10px] font-mono text-gray-400 shrink-0 w-5 text-right">
          {notch.q}
        </span>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FlexSideControls({
  effectiveState,
  selectedDevice,
  canControlConnected,
  canStreamFft,
  canStreamAudio,
  fftEnabled,
  audioEnabled,
  freqInput,
  freqUnit,
  notchFilters,
  onAddNotch,
  onRemoveNotch,
  onUpdateNotch,
  onToggleNotch,
  onTune,
  onFreqInputChange,
  onFreqUnitChange,
  onAntennaChange,
  onGainChange,
  onToggleFft,
  onToggleAudio,
  tuningStepHz,
  onTuningStepChange,
  vfo,
  onVfoChange,
  freqHz,
  onBandSelect,
  hasMultipleAntennas,
  antennas,
  ft8DecoderEnabled,
  ft8DecoderMode,
  ft8CycleProgress,
  ft8DecoderStats,
  ft8Error,
  onFt8Toggle,
  onFt8ModeChange,
}: FlexSideControlsProps) {
  const handleFreqKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onTune();
    }
  };

  // ─── Section: Antenna ────────────────────────────────────────────────────

  const antennaSection =
    hasMultipleAntennas && antennas.length > 1 ? (
      <div className="space-y-1">
        <SectionHeader>Antenna</SectionHeader>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const currentIdx = antennas.indexOf(
                effectiveState?.antenna ?? "",
              );
              const nextIdx = (currentIdx + 1) % antennas.length;
              onAntennaChange(antennas[nextIdx]);
            }}
            disabled={!canControlConnected}
            className="flex-1 px-2 py-0.5 text-[10px] font-medium rounded border
            bg-white/5 border-white/10 text-gray-300
            hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {effectiveState?.antenna ?? "\u2014"}
          </button>
        </div>
      </div>
    ) : null;

  // ─── Section: VFO A/B ──────────────────────────────────────────────────

  const vfoSection = onVfoChange ? (
    <div className="space-y-1">
      <SectionHeader>VFO</SectionHeader>

      <div className="flex gap-1">
        {(["A", "B"] as const).map((v) => (
          <button
            key={v}
            onClick={() => onVfoChange(v)}
            disabled={!canControlConnected}
            className={`flex-1 px-2 py-1 text-[10px] font-bold font-mono rounded border transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed ${
                vfo === v
                  ? "bg-cosmic-cyan/15 border-cosmic-cyan/30 text-cosmic-cyan"
                  : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
              }`}
          >
            VFO {v}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  // ─── Section: Band ──────────────────────────────────────────────────────

  const HF_BANDS: BandId[] = ALL_BANDS.filter(
    (b) => !["6m", "2m", "70cm"].includes(b),
  );
  const VHF_UHF_BANDS: BandId[] = ALL_BANDS.filter((b) =>
    ["6m", "2m", "70cm"].includes(b),
  );

  const activeBand = useMemo<string | null>(() => {
    if (freqHz == null || !Number.isFinite(freqHz)) return null;
    return bandFromFreq(freqHz / 1000);
  }, [freqHz]);

  const handleBandClick = (band: BandId) => {
    const centerMHz = BAND_CENTER_FREQUENCIES[band];
    if (centerMHz != null) onBandSelect(centerMHz * 1e6);
  };

  const bandSection = (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-1">
        {HF_BANDS.map((band) => {
          const isActive = activeBand === band;
          const bandColor = BAND_COLORS[band] ?? BAND_COLORS.default;
          return (
            <button
              key={band}
              type="button"
              onClick={() => handleBandClick(band)}
              disabled={!canControlConnected}
              className={`px-2 py-1.5 text-xs font-semibold rounded border transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed ${
                  isActive
                    ? "text-white border-white/20"
                    : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-200"
                }`}
              style={isActive ? { backgroundColor: bandColor } : undefined}
              title={band}
            >
              {band}
            </button>
          );
        })}
      </div>

      {VHF_UHF_BANDS.length > 0 && (
        <>
          <div className="my-0.5 border-t border-white/10" />
          <div className="grid grid-cols-2 gap-1">
            {VHF_UHF_BANDS.map((band) => {
              const isActive = activeBand === band;
              const bandColor = BAND_COLORS[band] ?? BAND_COLORS.default;
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => handleBandClick(band)}
                  disabled={!canControlConnected}
                  className={`px-2 py-1.5 text-xs font-semibold rounded border transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed ${
                      isActive
                        ? "text-white border-white/20"
                        : "bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-gray-200"
                    }`}
                  style={isActive ? { backgroundColor: bandColor } : undefined}
                  title={band}
                >
                  {band}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  // ─── Section: Frequency Input ────────────────────────────────────────────

  const frequencySection = (
    <div className="space-y-1">
      <input
        type="text"
        value={freqInput}
        onChange={(e) => onFreqInputChange(e.target.value)}
        onKeyDown={handleFreqKeyDown}
        placeholder="14.074"
        className="w-full px-2 py-1 font-mono text-sm text-white
          bg-black/40 border border-white/10 rounded
          focus:border-cosmic-cyan/50 focus:outline-none
          placeholder:text-gray-600"
      />

      <div className="flex gap-1">
        {FREQ_UNITS.map((unit) => (
          <button
            key={unit}
            onClick={() => onFreqUnitChange(unit)}
            className={`flex-1 px-1 py-0.5 text-[10px] font-semibold rounded-full border transition-colors ${
              freqUnit === unit
                ? "bg-cosmic-cyan/10 border-cosmic-cyan/30 text-cosmic-cyan"
                : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
            }`}
          >
            {unit}
          </button>
        ))}
      </div>
    </div>
  );

  // ─── Section: FT8/FT4 Decoder ──────────────────────────────────────────

  const ft8Section = (
    <div className="space-y-2">
      {/* Big ON/OFF toggle + mode indicator */}
      <div className="flex items-center gap-2">
        <button
          onClick={onFt8Toggle}
          className={`flex-1 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded border transition-all ${
            ft8DecoderEnabled
              ? "bg-signal-green/20 border-signal-green/40 text-signal-green ring-1 ring-signal-green/20"
              : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200"
          }`}
        >
          {ft8DecoderEnabled ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
              {ft8DecoderMode} Decoder ON
            </span>
          ) : (
            "Start Decoder"
          )}
        </button>
      </div>

      {/* FT8/FT4 mode pills */}
      <div className="flex gap-1">
        {(["FT8", "FT4"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onFt8ModeChange(m)}
            className={`flex-1 px-2 py-1.5 text-[11px] font-bold tracking-wide rounded border transition-colors ${
              ft8DecoderMode === m
                ? ft8DecoderEnabled
                  ? "bg-cosmic-cyan/20 text-cosmic-cyan border-cosmic-cyan/40 ring-1 ring-cosmic-cyan/20"
                  : "bg-cosmic-cyan/10 text-cosmic-cyan/70 border-cosmic-cyan/25"
                : "bg-white/5 text-gray-500 border-white/10 hover:bg-white/10 hover:text-gray-300"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Cycle progress + stats — only when enabled */}
      {ft8DecoderEnabled && (
        <>
          {/* Cycle progress bar */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-gray-500 uppercase tracking-wider">
                Cycle
              </span>
              <span className="text-[10px] font-mono text-gray-400">
                {Math.round(ft8CycleProgress * 100)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-cosmic-cyan/70 transition-[width] duration-300"
                style={{ width: `${ft8CycleProgress * 100}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: "Total", value: ft8DecoderStats.totalDecodes },
              { label: "Last", value: ft8DecoderStats.lastCycleDecodes },
              { label: "Cycles", value: ft8DecoderStats.cyclesCompleted },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded bg-white/[0.03] px-1.5 py-1 text-center"
              >
                <div className="text-sm font-mono font-semibold tabular-nums text-white/80">
                  {s.value.toLocaleString()}
                </div>
                <div className="text-[8px] uppercase tracking-wider text-white/30">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Status line */}
          <div className="text-[10px] text-gray-500 leading-snug">
            {ft8DecoderStats.workerReady
              ? `Decoding ${ft8DecoderMode} — filter auto-set to 0\u20133000 Hz`
              : "Initializing WASM decoder\u2026"}
          </div>

          {/* Error */}
          {ft8Error && (
            <div className="rounded bg-alert-red/10 border border-alert-red/20 px-2 py-1.5 text-[10px] leading-tight text-alert-red/90">
              {ft8Error}
            </div>
          )}
        </>
      )}
    </div>
  );

  // ─── Section: Step Size ──────────────────────────────────────────────────

  const stepSection = (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-1">
        {STEP_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onTuningStepChange(opt.value)}
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors ${
              tuningStepHz === opt.value
                ? "bg-plasma-orange/15 text-plasma-orange border-plasma-orange/30"
                : "bg-white/5 text-gray-400 border-white/10 hover:text-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  // ─── Section: TX Gain Stages ────────────────────────────────────────────

  const allGainStages = selectedDevice?.capabilities.gain_stages ?? [];
  const txStages = allGainStages.filter((s) =>
    (TX_STAGE_NAMES as readonly string[]).includes(s.name),
  );

  const txSection =
    txStages.length > 0 ? (
      <div className="space-y-1">
        {txStages.map((stage) => {
          const currentValue = effectiveState?.gains[stage.name] ?? stage.min;
          return (
            <div key={stage.name} className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">
                  {stage.label ?? stage.name}
                </span>
                <span className="text-[10px] text-gray-200 font-mono">
                  {stage.max <= 1
                    ? Math.round(currentValue * 100) + "%"
                    : currentValue}
                </span>
              </div>
              <input
                type="range"
                min={stage.min}
                max={stage.max}
                step={stage.step}
                value={currentValue}
                onChange={(e) =>
                  onGainChange(stage.name, Number(e.target.value))
                }
                disabled={!canControlConnected}
                className="w-full h-1 accent-cosmic-cyan disabled:opacity-40"
              />
            </div>
          );
        })}
      </div>
    ) : null;

  // ─── Section: FFT / Audio Toggle ────────────────────────────────────────

  const streamSection = (
    <div className="space-y-1">
      <SectionHeader>Streams</SectionHeader>

      <div className="flex gap-1">
        <button
          onClick={onToggleFft}
          disabled={!canStreamFft}
          className={`flex-1 px-1.5 py-1 text-[10px] font-semibold rounded border transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed ${
              fftEnabled
                ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-gray-200"
            }`}
        >
          {fftEnabled ? "Stop FFT" : "Start FFT"}
        </button>

        <button
          onClick={onToggleAudio}
          disabled={!canStreamAudio}
          className={`flex-1 px-1.5 py-1 text-[10px] font-semibold rounded border transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed ${
              audioEnabled
                ? "bg-plasma-orange/15 border-plasma-orange/30 text-plasma-orange"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-gray-200"
            }`}
        >
          {audioEnabled ? "Stop Audio" : "Start Audio"}
        </button>
      </div>
    </div>
  );

  // ─── Section: Notch Filters ──────────────────────────────────────────────

  const notchSection = (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          {notchFilters.length}/{MAX_NOTCH_FILTERS}
        </span>
        <button
          onClick={() => onAddNotch(1000, 10)}
          disabled={notchFilters.length >= MAX_NOTCH_FILTERS}
          className="px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors
            bg-cosmic-cyan/10 border-cosmic-cyan/30 text-cosmic-cyan
            hover:bg-cosmic-cyan/20
            disabled:opacity-40 disabled:cursor-not-allowed"
          title="Add notch filter"
        >
          + Add
        </button>
      </div>

      {notchFilters.length === 0 && (
        <div className="text-[9px] text-gray-600 leading-tight">
          Right-click spectrum to place a notch, or use + Add.
        </div>
      )}

      {notchFilters.map((notch) => (
        <NotchFilterRow
          key={notch.id}
          notch={notch}
          onUpdate={(fHz, q) => onUpdateNotch(notch.id, fHz, q)}
          onToggle={(enabled) => onToggleNotch(notch.id, enabled)}
          onRemove={() => onRemoveNotch(notch.id)}
        />
      ))}
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0d0d14]">
      <div className="overflow-y-auto flex-1 px-3 py-2 space-y-2">
        {/* Always visible — compact critical controls */}
        {antennaSection}
        {vfoSection}
        {streamSection}

        {/* Separator */}
        <div className="border-t border-white/5" />

        {/* Accordion sections — primary tuning (default open) */}
        <SidebarAccordion title="Band">{bandSection}</SidebarAccordion>

        <SidebarAccordion title="Frequency & Step">
          <div className="space-y-2">
            {frequencySection}
            {stepSection}
          </div>
        </SidebarAccordion>

        {/* Separator */}
        <div className="border-t border-white/5" />

        {/* Accordion sections — secondary (default collapsed) */}
        <SidebarAccordion title="Digital Decoder" defaultOpen={false}>
          {ft8Section}
        </SidebarAccordion>

        {txSection && (
          <SidebarAccordion title="TX Controls" defaultOpen={false}>
            {txSection}
          </SidebarAccordion>
        )}

        <SidebarAccordion
          title="Notch Filters"
          defaultOpen={false}
          badge={
            notchFilters.length > 0
              ? `${notchFilters.length}/${MAX_NOTCH_FILTERS}`
              : undefined
          }
        >
          {notchSection}
        </SidebarAccordion>
      </div>
    </div>
  );
}

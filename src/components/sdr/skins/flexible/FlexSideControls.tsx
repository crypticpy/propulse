/**
 * FlexSideControls -- Right sidebar (280px) control surface for the
 * FlexRadio SmartSDR-inspired Flexible SDR skin.
 *
 * DSP, filter, mode, RX gain, and audio controls have migrated to the
 * slice flag's expandable panels (SlicePanelTabs). This sidebar now
 * handles band/frequency tuning, TX controls, streams, FT8 decoder,
 * notch filters, and parametric EQ bands.
 */

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { RadioState, DeviceInfo } from "@/lib/radio/protocol";
import { ALL_BANDS } from "@/types/user";
import type { BandId } from "@/types/user";
import { BAND_CENTER_FREQUENCIES } from "@/lib/data/feedlines";
import { BAND_COLORS } from "@/lib/utils/spotColors";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { SidebarAccordion } from "./SidebarAccordion";
import type { EqBand, EqFilterType, EqBandCategory } from "@/lib/audio/eqTypes";
import {
  MAX_EQ_BANDS,
  EQ_FILTER_TYPES,
  EQ_FILTER_LABELS,
  filterTypeUsesGain,
} from "@/lib/audio/eqTypes";

// ─── Props ───────────────────────────────────────────────────────────────────

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

  // EQ bands (unified: notch + parametric EQ)
  eqBands: EqBand[];
  onAddEqBand: (
    freqHz: number,
    gainDb: number,
    category: EqBandCategory,
  ) => void;
  onRemoveEqBand: (id: string) => void;
  onUpdateEqBand: (
    id: string,
    freqHz: number,
    q: number,
    gainDb: number,
  ) => void;
  onUpdateEqBandType: (id: string, filterType: EqFilterType) => void;
  onToggleEqBand: (id: string, enabled: boolean) => void;
  onEqBandQChange: (id: string, q: number) => void;

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

  // Audio recording
  isRecording: boolean;
  recordingDurationSec: number;
  recordingEstimatedBytes: number;
  hasRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onExportRecording: () => void;
  onDiscardRecording: () => void;
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

const TX_STAGE_NAMES = ["RFPOWER", "MICGAIN", "COMP", "VOXGAIN"] as const;

// Abbreviated labels for compact filter type button grid
const FILTER_TYPE_SHORT: Record<EqFilterType, string> = {
  bell: "Bell",
  notch: "Notch",
  lowshelf: "LoSh",
  highshelf: "HiSh",
  lowpass: "LPF",
  highpass: "HPF",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
      {children}
    </div>
  );
}

function EqBandRow({
  band,
  onUpdate,
  onUpdateType,
  onToggle,
  onRemove,
}: {
  band: EqBand;
  onUpdate: (freqHz: number, q: number, gainDb: number) => void;
  onUpdateType: (filterType: EqFilterType) => void;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
}) {
  const [localFreq, setLocalFreq] = useState(String(band.freqHz));

  useEffect(() => {
    setLocalFreq(String(band.freqHz));
  }, [band.freqHz]);

  const isNotch = band.category === "notch";
  const showGain = filterTypeUsesGain(band.filterType);

  const commitFreq = () => {
    const parsed = parseInt(localFreq, 10);
    if (Number.isFinite(parsed) && parsed >= 20 && parsed <= 20000) {
      onUpdate(parsed, band.q, band.gainDb);
    } else {
      setLocalFreq(String(band.freqHz));
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
        band.enabled
          ? isNotch
            ? "border-plasma-orange/25 bg-plasma-orange/5"
            : "border-cosmic-cyan/25 bg-cosmic-cyan/5"
          : "border-white/5 bg-white/[0.02] opacity-50"
      }`}
    >
      {/* Row 1: Freq label + filter type badge + toggle + remove */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-mono text-gray-300 truncate">
          {band.freqHz} Hz
        </span>
        <span
          className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
            isNotch
              ? "bg-plasma-orange/15 text-plasma-orange"
              : "bg-cosmic-cyan/15 text-cosmic-cyan"
          }`}
        >
          {EQ_FILTER_LABELS[band.filterType]}
        </span>
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button
            onClick={() => onToggle(!band.enabled)}
            className={`px-1 py-0.5 text-[9px] font-semibold rounded border transition-colors ${
              band.enabled
                ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
                : "bg-white/5 border-white/10 text-gray-500"
            }`}
            title={band.enabled ? "Disable" : "Enable"}
          >
            {band.enabled ? "On" : "Off"}
          </button>
          <button
            onClick={onRemove}
            className="px-1 py-0.5 text-[9px] font-semibold rounded border
              bg-alert-red/10 border-alert-red/25 text-alert-red/70
              hover:bg-alert-red/20 hover:text-alert-red transition-colors"
            title="Remove"
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
          max={500}
          step={1}
          value={Math.round(band.q * 10)}
          onChange={(e) =>
            onUpdate(band.freqHz, Number(e.target.value) / 10, band.gainDb)
          }
          className={`flex-1 h-1 ${band.category === "notch" ? "accent-plasma-orange" : "accent-cosmic-cyan"}`}
        />
        <span className="text-[10px] font-mono text-gray-400 shrink-0 w-7 text-right">
          {band.q.toFixed(1)}
        </span>
      </div>

      {/* Row 4: Gain slider — only for filter types that use gain */}
      {showGain && (
        <div className="flex items-center gap-1">
          <label className="text-[9px] text-gray-500 shrink-0 w-7">Gain</label>
          <input
            type="range"
            min={-24}
            max={24}
            step={0.5}
            value={band.gainDb}
            onChange={(e) =>
              onUpdate(band.freqHz, band.q, Number(e.target.value))
            }
            className="flex-1 h-1 accent-cosmic-cyan"
          />
          <span className="text-[10px] font-mono text-gray-400 shrink-0 w-10 text-right">
            {band.gainDb > 0 ? "+" : ""}
            {band.gainDb.toFixed(1)}
          </span>
        </div>
      )}

      {/* Row 5: Filter type selector — compact 3x2 grid */}
      <div className="grid grid-cols-3 gap-0.5">
        {EQ_FILTER_TYPES.map((ft) => (
          <button
            key={ft}
            onClick={() => onUpdateType(ft)}
            className={`px-1 py-0.5 text-[8px] font-semibold rounded border transition-colors ${
              band.filterType === ft
                ? isNotch
                  ? "bg-plasma-orange/20 border-plasma-orange/40 text-plasma-orange"
                  : "bg-cosmic-cyan/20 border-cosmic-cyan/40 text-cosmic-cyan"
                : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
            }`}
            title={EQ_FILTER_LABELS[ft]}
          >
            {FILTER_TYPE_SHORT[ft]}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  eqBands,
  onAddEqBand,
  onRemoveEqBand,
  onUpdateEqBand,
  onUpdateEqBandType,
  onToggleEqBand,
  onEqBandQChange: _onEqBandQChange,
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
  isRecording,
  recordingDurationSec,
  recordingEstimatedBytes,
  hasRecording,
  onStartRecording,
  onStopRecording,
  onExportRecording,
  onDiscardRecording,
}: FlexSideControlsProps) {
  const handleFreqKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onTune();
    }
  };

  // ─── Filtered band lists ─────────────────────────────────────────────────
  const notchBands = useMemo(
    () => eqBands.filter((b) => b.category === "notch"),
    [eqBands],
  );
  const eqCategoryBands = useMemo(
    () => eqBands.filter((b) => b.category === "eq"),
    [eqBands],
  );
  const totalBands = eqBands.length;
  const poolFull = totalBands >= MAX_EQ_BANDS;

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

  // ─── Section: Notch Filters (category === "notch") ────────────────────

  const notchSection = (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          {totalBands}/{MAX_EQ_BANDS}
        </span>
        <button
          onClick={() => onAddEqBand(1000, 0, "notch")}
          disabled={poolFull}
          className="px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors
            bg-plasma-orange/10 border-plasma-orange/30 text-plasma-orange
            hover:bg-plasma-orange/20
            disabled:opacity-40 disabled:cursor-not-allowed"
          title="Add notch filter"
        >
          + Add
        </button>
      </div>

      {notchBands.length === 0 && (
        <div className="text-[9px] text-gray-600 leading-tight">
          Right-click spectrum to place, or use + Add.
        </div>
      )}

      {notchBands.map((band) => (
        <EqBandRow
          key={band.id}
          band={band}
          onUpdate={(fHz, q, gainDb) => onUpdateEqBand(band.id, fHz, q, gainDb)}
          onUpdateType={(ft) => onUpdateEqBandType(band.id, ft)}
          onToggle={(enabled) => onToggleEqBand(band.id, enabled)}
          onRemove={() => onRemoveEqBand(band.id)}
        />
      ))}
    </div>
  );

  // ─── Section: Parametric EQ (category === "eq") ───────────────────────

  const eqSection = (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">
          {totalBands}/{MAX_EQ_BANDS}
        </span>
        <button
          onClick={() => onAddEqBand(1000, 0, "eq")}
          disabled={poolFull}
          className="px-1.5 py-0.5 text-[10px] font-semibold rounded border transition-colors
            bg-cosmic-cyan/10 border-cosmic-cyan/30 text-cosmic-cyan
            hover:bg-cosmic-cyan/20
            disabled:opacity-40 disabled:cursor-not-allowed"
          title="Add EQ band"
        >
          + Add
        </button>
      </div>

      {eqCategoryBands.length === 0 && (
        <div className="text-[9px] text-gray-600 leading-tight">
          Right-click spectrum to place, or use + Add.
        </div>
      )}

      {eqCategoryBands.map((band) => (
        <EqBandRow
          key={band.id}
          band={band}
          onUpdate={(fHz, q, gainDb) => onUpdateEqBand(band.id, fHz, q, gainDb)}
          onUpdateType={(ft) => onUpdateEqBandType(band.id, ft)}
          onToggle={(enabled) => onToggleEqBand(band.id, enabled)}
          onRemove={() => onRemoveEqBand(band.id)}
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
          badge={notchBands.length > 0 ? `${notchBands.length}` : undefined}
        >
          {notchSection}
        </SidebarAccordion>

        <SidebarAccordion
          title="Parametric EQ"
          defaultOpen={false}
          badge={
            eqCategoryBands.length > 0 ? `${eqCategoryBands.length}` : undefined
          }
        >
          {eqSection}
        </SidebarAccordion>

        <SidebarAccordion
          title="Recording"
          defaultOpen={false}
          badge={isRecording ? "REC" : undefined}
        >
          <div className="space-y-2">
            {/* Record / Stop button */}
            <button
              onClick={isRecording ? onStopRecording : onStartRecording}
              disabled={!audioEnabled}
              className={`w-full px-3 py-2 text-xs font-bold uppercase tracking-wider rounded border transition-all
                disabled:opacity-40 disabled:cursor-not-allowed ${
                  isRecording
                    ? "bg-alert-red/20 border-alert-red/40 text-alert-red ring-1 ring-alert-red/20"
                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                }`}
            >
              {isRecording ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-alert-red animate-pulse" />
                  Stop Recording
                </span>
              ) : (
                "Start Recording"
              )}
            </button>

            {!audioEnabled && !isRecording && (
              <div className="text-[9px] text-gray-600 leading-tight">
                Start audio streaming to enable recording.
              </div>
            )}

            {/* Duration + size display — visible during and after recording */}
            {(isRecording || hasRecording) && (
              <div className="grid grid-cols-2 gap-1">
                <div className="rounded bg-white/[0.03] px-1.5 py-1 text-center">
                  <div className="text-sm font-mono font-semibold tabular-nums text-white/80">
                    {formatDuration(recordingDurationSec)}
                  </div>
                  <div className="text-[8px] uppercase tracking-wider text-white/30">
                    Duration
                  </div>
                </div>
                <div className="rounded bg-white/[0.03] px-1.5 py-1 text-center">
                  <div className="text-sm font-mono font-semibold tabular-nums text-white/80">
                    {formatBytes(recordingEstimatedBytes)}
                  </div>
                  <div className="text-[8px] uppercase tracking-wider text-white/30">
                    Size
                  </div>
                </div>
              </div>
            )}

            {/* Export / Discard — only when stopped with recording available */}
            {!isRecording && hasRecording && (
              <div className="flex gap-1">
                <button
                  onClick={onExportRecording}
                  className="flex-1 px-2 py-1.5 text-[10px] font-semibold rounded border transition-colors
                    bg-signal-green/10 border-signal-green/30 text-signal-green
                    hover:bg-signal-green/20"
                >
                  Export WAV
                </button>
                <button
                  onClick={onDiscardRecording}
                  className="flex-1 px-2 py-1.5 text-[10px] font-semibold rounded border transition-colors
                    bg-alert-red/10 border-alert-red/25 text-alert-red/70
                    hover:bg-alert-red/20 hover:text-alert-red"
                >
                  Discard
                </button>
              </div>
            )}
          </div>
        </SidebarAccordion>
      </div>
    </div>
  );
}

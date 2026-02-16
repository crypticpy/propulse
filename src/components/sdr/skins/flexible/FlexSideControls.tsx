/**
 * FlexSideControls -- Right sidebar (280px) control surface for the
 * FlexRadio SmartSDR-inspired Flexible SDR skin.
 *
 * Provides compact, flat-design controls for radio tuning, DSP, gain,
 * filters, and streaming toggles. Replaces the Classic skin's card-based
 * layout with a dense, scrollable column.
 */

import { useMemo, useState, type KeyboardEvent } from "react";
import type { RadioState, DeviceInfo } from "@/lib/radio/protocol";
import { ALL_BANDS } from "@/types/user";
import type { BandId } from "@/types/user";
import { BAND_CENTER_FREQUENCIES } from "@/lib/data/feedlines";
import { BAND_COLORS } from "@/lib/utils/spotColors";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";

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
  smeterDbm: number | undefined;

  canStreamFft: boolean;
  canStreamAudio: boolean;
  fftEnabled: boolean;
  audioEnabled: boolean;

  freqInput: string;
  freqUnit: "MHz" | "kHz" | "Hz";

  // Client-side noise gate
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
  onNoiseGateToggle: (enabled: boolean) => void;
  onNoiseGateThresholdChange: (threshold: number) => void;

  // Client-side noise reduction
  clientNrEnabled: boolean;
  clientNrLevel: number;
  onClientNrToggle: (enabled: boolean) => void;
  onClientNrLevelChange: (level: number) => void;

  // Notch filters
  notchFilters: NotchFilter[];
  onAddNotch: (freqHz: number, q: number) => void;
  onRemoveNotch: (id: string) => void;
  onUpdateNotch: (id: string, freqHz: number, q: number) => void;
  onToggleNotch: (id: string, enabled: boolean) => void;

  onTune: () => void;
  onFreqInputChange: (value: string) => void;
  onFreqUnitChange: (unit: "MHz" | "kHz" | "Hz") => void;
  onModeChange: (mode: string) => void;
  onPttChange: (active: boolean) => void;
  onAgcToggle: (enabled: boolean) => void;
  onAntennaChange: (port: string) => void;
  onGainChange: (stage: string, value: number) => void;
  onFilterChange: (low: number, high: number) => void;
  onNrChange: (enabled: boolean, level: number) => void;
  onNbChange: (enabled: boolean, threshold: number) => void;
  onToggleFft: () => void;
  onToggleAudio: () => void;

  // Tuning step
  tuningStepHz: number;
  onTuningStepChange: (stepHz: number) => void;

  // VFO
  vfo?: "A" | "B" | null;
  onVfoChange?: (vfo: "A" | "B") => void;

  // Device management
  onConnectRadio: () => void;
  onDisconnectRadio: () => void;

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

const GAIN_GROUPS = [
  { label: "RX Controls", stages: ["RF", "SQL", "PREAMP", "ATT"] },
  { label: "TX Controls", stages: ["RFPOWER", "MICGAIN", "COMP", "VOXGAIN"] },
  { label: "Audio", stages: ["AF", "MONITOR_GAIN"] },
] as const;

const DISCRETE_STAGES = new Set(["PREAMP", "ATT"]);
const DISCRETE_STEPS = [
  { label: "Off", value: 0 },
  { label: "10dB", value: 10 },
  { label: "20dB", value: 20 },
];

function nrLevelLabel(level: number): string {
  if (level === 0) return "Off";
  if (level <= 3) return "Mild";
  if (level <= 6) return "Moderate";
  return "Aggressive";
}

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
  noiseGateEnabled,
  noiseGateThreshold,
  onNoiseGateToggle,
  onNoiseGateThresholdChange,
  clientNrEnabled,
  clientNrLevel,
  onClientNrToggle,
  onClientNrLevelChange,
  notchFilters,
  onAddNotch,
  onRemoveNotch,
  onUpdateNotch,
  onToggleNotch,
  onTune,
  onFreqInputChange,
  onFreqUnitChange,
  onModeChange,
  onAgcToggle,
  onAntennaChange,
  onGainChange,
  onFilterChange,
  onNrChange,
  onNbChange,
  onToggleFft,
  onToggleAudio,
  tuningStepHz,
  onTuningStepChange,
  vfo,
  onVfoChange,
  onConnectRadio,
  onDisconnectRadio,
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
  const isConnected = effectiveState?.connected ?? false;

  const handleFreqKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onTune();
    }
  };

  // ─── Section: Device ─────────────────────────────────────────────────────

  const deviceSection = (
    <div className="space-y-1">
      <SectionHeader>Device</SectionHeader>

      <div className="text-xs text-gray-300 truncate">
        {isConnected && selectedDevice ? selectedDevice.name : "No Radio"}
      </div>

      {isConnected ? (
        <button
          onClick={onDisconnectRadio}
          disabled={!canControlConnected}
          className="w-full px-2 py-1 text-[10px] font-semibold rounded
            bg-alert-red/15 border border-alert-red/30 text-alert-red
            hover:bg-alert-red/25 transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Disconnect
        </button>
      ) : (
        <button
          onClick={onConnectRadio}
          disabled={!selectedDevice}
          className="w-full px-2 py-1 text-[10px] font-semibold rounded
            bg-cosmic-cyan/15 border border-cosmic-cyan/30 text-cosmic-cyan
            hover:bg-cosmic-cyan/25 transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Connect
        </button>
      )}

      {/* ANT cycling (when multiple antennas available) */}
      {hasMultipleAntennas && antennas.length > 1 && (
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[10px] text-gray-500 shrink-0">ANT</span>
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
      )}
    </div>
  );

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
      <SectionHeader>Band</SectionHeader>

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
      <SectionHeader>Frequency</SectionHeader>

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

  // ─── Section: Mode Selector ──────────────────────────────────────────────

  const modeSection = (
    <div className="space-y-1">
      <SectionHeader>Mode</SectionHeader>

      <select
        value={effectiveState?.mode ?? ""}
        onChange={(e) => onModeChange(e.target.value)}
        disabled={!canControlConnected || !selectedDevice}
        className="w-full px-2 py-1 text-xs text-white
          bg-black/40 border border-white/10 rounded
          focus:border-cosmic-cyan/50 focus:outline-none
          disabled:opacity-40 disabled:cursor-not-allowed
          [&>option]:bg-[#0d0d14]"
      >
        {!effectiveState?.mode && <option value="">--</option>}
        {selectedDevice?.capabilities.modes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );

  // ─── Section: FT8/FT4 Decoder ──────────────────────────────────────────

  const ft8Section = (
    <div className="space-y-2">
      <SectionHeader>Digital Decoder</SectionHeader>

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
      <SectionHeader>Step</SectionHeader>

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

  // ─── Section: Filter Width ───────────────────────────────────────────────

  const filterLow = effectiveState?.filter?.low ?? 300;
  const filterHigh = effectiveState?.filter?.high ?? 2700;

  const filterSection = (
    <div className="space-y-1">
      <SectionHeader>Filter</SectionHeader>

      <div className="font-mono text-[10px] text-gray-400 text-center">
        {filterLow}&mdash;{filterHigh} Hz
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-0.5">
          <label className="text-[10px] text-gray-500">Low</label>
          <input
            type="range"
            min={0}
            max={5000}
            step={50}
            value={filterLow}
            onChange={(e) => onFilterChange(Number(e.target.value), filterHigh)}
            disabled={!canControlConnected}
            className="w-full h-1 accent-cosmic-cyan disabled:opacity-40"
          />
        </div>
        <div className="flex-1 space-y-0.5">
          <label className="text-[10px] text-gray-500">High</label>
          <input
            type="range"
            min={500}
            max={15000}
            step={50}
            value={filterHigh}
            onChange={(e) => onFilterChange(filterLow, Number(e.target.value))}
            disabled={!canControlConnected}
            className="w-full h-1 accent-cosmic-cyan disabled:opacity-40"
          />
        </div>
      </div>
    </div>
  );

  // ─── Section: DSP Toggles ───────────────────────────────────────────────

  const nb = effectiveState?.nb;
  const nr = effectiveState?.nr;
  const agc = effectiveState?.agc ?? false;

  const dspSection = (
    <div className="space-y-1">
      <SectionHeader>DSP</SectionHeader>

      <div className="flex gap-1">
        <button
          onClick={() =>
            onNbChange(!(nb?.enabled ?? false), nb?.threshold ?? 50)
          }
          disabled={!canControlConnected}
          className={`flex-1 px-1.5 py-1 text-[10px] font-semibold rounded border transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed ${
              nb?.enabled
                ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
                : "bg-white/5 border-white/10 text-gray-400"
            }`}
        >
          NB
        </button>

        <button
          onClick={() => onNrChange(!(nr?.enabled ?? false), nr?.level ?? 3)}
          disabled={!canControlConnected}
          className={`flex-1 px-1.5 py-1 text-[10px] font-semibold rounded border transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed ${
              nr?.enabled
                ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
                : "bg-white/5 border-white/10 text-gray-400"
            }`}
        >
          NR
        </button>

        <button
          onClick={() => onAgcToggle(!agc)}
          disabled={!canControlConnected}
          className={`flex-1 px-1.5 py-1 text-[10px] font-semibold rounded border transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed ${
              agc
                ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
                : "bg-white/5 border-white/10 text-gray-400"
            }`}
        >
          AGC
        </button>
      </div>
    </div>
  );

  // ─── Sections: Gain Stages (RX / TX / Audio) ───────────────────────────

  const allGainStages = selectedDevice?.capabilities.gain_stages ?? [];

  const gainSections = GAIN_GROUPS.map((group) => {
    const matchedStages = allGainStages.filter((s) =>
      (group.stages as readonly string[]).includes(s.name),
    );
    if (matchedStages.length === 0) return null;

    return (
      <div key={group.label} className="space-y-1">
        <SectionHeader>{group.label}</SectionHeader>

        {matchedStages.map((stage) => {
          const currentValue = effectiveState?.gains[stage.name] ?? stage.min;

          if (DISCRETE_STAGES.has(stage.name)) {
            return (
              <div key={stage.name} className="space-y-0.5">
                <span className="text-[10px] text-gray-500">
                  {stage.label ?? stage.name}
                </span>
                <div className="flex gap-1">
                  {DISCRETE_STEPS.map((step) => (
                    <button
                      key={step.value}
                      onClick={() => onGainChange(stage.name, step.value)}
                      disabled={!canControlConnected}
                      className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors
                        disabled:opacity-40 disabled:cursor-not-allowed ${
                          currentValue === step.value
                            ? "bg-signal-green/15 text-signal-green border-signal-green/30"
                            : "bg-white/5 text-gray-500 border-white/10 hover:bg-white/10"
                        }`}
                    >
                      {step.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          }

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
    );
  });

  // ─── Section: RIT / XIT ─────────────────────────────────────────────────

  const ritXitSection = (
    <div
      className="space-y-1 opacity-40 cursor-not-allowed"
      title="Not yet available"
    >
      <SectionHeader>RIT / XIT</SectionHeader>

      <div className="flex gap-2">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-500">RIT</span>
            <span className="text-[9px] font-semibold text-gray-600 bg-white/5 px-1 rounded">
              N/A
            </span>
          </div>
          <input
            type="text"
            value="0 Hz"
            disabled
            className="w-full px-1.5 py-0.5 text-[10px] font-mono text-gray-500
              bg-black/30 border border-white/5 rounded cursor-not-allowed"
          />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-gray-500">XIT</span>
            <span className="text-[9px] font-semibold text-gray-600 bg-white/5 px-1 rounded">
              N/A
            </span>
          </div>
          <input
            type="text"
            value="0 Hz"
            disabled
            className="w-full px-1.5 py-0.5 text-[10px] font-mono text-gray-500
              bg-black/30 border border-white/5 rounded cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );

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

  // ─── Section: Notch Filters (always visible) ──────────────────────────

  const notchSection = (
    <div className="space-y-1">
      <SectionHeader>Notch Filters</SectionHeader>

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
          onUpdate={(freqHz, q) => onUpdateNotch(notch.id, freqHz, q)}
          onToggle={(enabled) => onToggleNotch(notch.id, enabled)}
          onRemove={() => onRemoveNotch(notch.id)}
        />
      ))}
    </div>
  );

  // ─── Section: Audio DSP (Noise Gate + NR) ─────────────────────────────

  const audioDspSection = (
    <div className="space-y-1">
      <SectionHeader>Audio DSP</SectionHeader>

      {!audioEnabled ? (
        <div className="text-[10px] text-gray-600 italic">
          Start audio stream to use DSP
        </div>
      ) : (
        <div className="space-y-2">
          {/* ── Noise Gate ─────────────────────────── */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Noise Gate</span>
              <button
                onClick={() => onNoiseGateToggle(!noiseGateEnabled)}
                className={`px-1.5 py-0.5 text-[9px] font-semibold rounded border transition-colors ${
                  noiseGateEnabled
                    ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
                    : "bg-white/5 border-white/10 text-gray-500"
                }`}
              >
                {noiseGateEnabled ? "On" : "Off"}
              </button>
            </div>
            {noiseGateEnabled && (
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-gray-500 shrink-0">
                  Threshold
                </label>
                <input
                  type="range"
                  min={-80}
                  max={-20}
                  step={1}
                  value={noiseGateThreshold}
                  onChange={(e) =>
                    onNoiseGateThresholdChange(Number(e.target.value))
                  }
                  className="flex-1 h-1 accent-plasma-orange"
                />
                <span className="text-[10px] font-mono text-gray-400 shrink-0 w-10 text-right">
                  {noiseGateThreshold} dB
                </span>
              </div>
            )}
          </div>

          {/* ── Noise Reduction ────────────────────── */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Noise Reduction</span>
              <button
                onClick={() => onClientNrToggle(!clientNrEnabled)}
                className={`px-1.5 py-0.5 text-[9px] font-semibold rounded border transition-colors ${
                  clientNrEnabled
                    ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
                    : "bg-white/5 border-white/10 text-gray-500"
                }`}
              >
                {clientNrEnabled ? "On" : "Off"}
              </button>
            </div>
            {clientNrEnabled && (
              <div className="flex items-center gap-1">
                <label className="text-[9px] text-gray-500 shrink-0">
                  Level
                </label>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={clientNrLevel}
                  onChange={(e) =>
                    onClientNrLevelChange(Number(e.target.value))
                  }
                  className="flex-1 h-1 accent-plasma-orange"
                />
                <span className="text-[10px] font-mono text-gray-400 shrink-0 w-16 text-right">
                  {clientNrLevel} {nrLevelLabel(clientNrLevel)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0d0d14]">
      <div className="overflow-y-auto flex-1 px-3 py-2 space-y-3">
        {deviceSection}
        {vfoSection}
        {bandSection}
        {frequencySection}
        {modeSection}
        {ft8Section}
        {stepSection}
        {filterSection}
        {notchSection}
        {dspSection}
        {gainSections}
        {ritXitSection}
        {streamSection}
        {audioDspSection}
      </div>
    </div>
  );
}

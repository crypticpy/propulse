/**
 * FlexSideControls -- Right sidebar (280px) control surface for the
 * FlexRadio SmartSDR-inspired Flexible SDR skin.
 *
 * Provides compact, flat-design controls for radio tuning, DSP, gain,
 * filters, and streaming toggles. Replaces the Classic skin's card-based
 * layout with a dense, scrollable column.
 */

import { useState, type KeyboardEvent } from "react";
import type { RadioState, DeviceInfo } from "@/lib/radio/protocol";

// ─── Props ───────────────────────────────────────────────────────────────────

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

  // Device management
  onConnectRadio: () => void;
  onDisconnectRadio: () => void;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
      {children}
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
  onTune,
  onFreqInputChange,
  onFreqUnitChange,
  onModeChange,
  onAgcToggle,
  onGainChange,
  onFilterChange,
  onNrChange,
  onNbChange,
  onToggleFft,
  onToggleAudio,
  onConnectRadio,
  onDisconnectRadio,
}: FlexSideControlsProps) {
  const [stepHz, setStepHz] = useState<number>(1000);

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

  // ─── Section: Step Size ──────────────────────────────────────────────────

  const stepSection = (
    <div className="space-y-1">
      <SectionHeader>Step</SectionHeader>

      <div className="grid grid-cols-2 gap-1">
        {STEP_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStepHz(opt.value)}
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors ${
              stepHz === opt.value
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

  // ─── Section: Gain Stages ───────────────────────────────────────────────

  const gainStages = selectedDevice?.capabilities.gain_stages ?? [];

  const gainSection = gainStages.length > 0 && (
    <div className="space-y-1">
      <SectionHeader>Gain</SectionHeader>

      {gainStages.map((stage) => {
        const currentValue = effectiveState?.gains[stage.name] ?? stage.min;
        return (
          <div key={stage.name} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500">{stage.name}</span>
              <span className="text-[10px] text-gray-200 font-mono">
                {currentValue}
              </span>
            </div>
            <input
              type="range"
              min={stage.min}
              max={stage.max}
              step={stage.step}
              value={currentValue}
              onChange={(e) => onGainChange(stage.name, Number(e.target.value))}
              disabled={!canControlConnected}
              className="w-full h-1 accent-cosmic-cyan disabled:opacity-40"
            />
          </div>
        );
      })}
    </div>
  );

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

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[#0d0d14]">
      <div className="overflow-y-auto flex-1 px-3 py-2 space-y-3">
        {deviceSection}
        {frequencySection}
        {modeSection}
        {stepSection}
        {filterSection}
        {dspSection}
        {gainSection}
        {ritXitSection}
        {streamSection}
      </div>
    </div>
  );
}

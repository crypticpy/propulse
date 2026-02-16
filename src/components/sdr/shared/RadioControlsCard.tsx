/**
 * RadioControlsCard -- Frequency input, mode, PTT, AGC, gain, DSP, S-meter,
 * FFT/Audio toggle buttons.
 * Shared between Classic and Flexible skins.
 */

import { Card } from "@/components/ui";
import type { RadioState, DeviceInfo } from "@/lib/radio/protocol";

export interface RadioControlsCardProps {
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
}

export function RadioControlsCard({
  effectiveState,
  selectedDevice,
  canControlConnected,
  smeterDbm,
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
  onPttChange,
  onAgcToggle,
  onAntennaChange,
  onGainChange,
  onFilterChange,
  onNrChange,
  onNbChange,
  onToggleFft,
  onToggleAudio,
}: RadioControlsCardProps) {
  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-semibold text-gray-200">Radio Controls</div>

      {/* ── Frequency input + unit selector + tune ── */}
      <div className="grid grid-cols-3 gap-2 items-end">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Frequency</label>
          <input
            type="text"
            value={freqInput}
            onChange={(e) => onFreqInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onTune();
            }}
            disabled={!canControlConnected}
            className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white text-sm font-mono"
          />
          <div className="mt-1 flex gap-1">
            {(["MHz", "kHz", "Hz"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => onFreqUnitChange(u)}
                disabled={!canControlConnected}
                className={`px-2 py-1 rounded text-[11px] border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  freqUnit === u
                    ? "bg-cosmic-cyan/10 border-cosmic-cyan/30 text-cosmic-cyan"
                    : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onTune}
          disabled={!canControlConnected}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Tune
        </button>
      </div>

      {/* ── Mode selector ── */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Mode</label>
        <select
          value={effectiveState?.mode ?? ""}
          onChange={(e) => onModeChange(e.target.value)}
          disabled={!canControlConnected || !selectedDevice}
          className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white text-sm"
        >
          {(selectedDevice?.capabilities.modes ?? []).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* ── Extended controls (PTT, AGC, antenna, gains, DSP) ── */}
      {selectedDevice && effectiveState && (
        <div className="space-y-3 pt-1">
          {/* TX / RX */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">Transmit</div>
            {selectedDevice.capabilities.can_transmit ? (
              <button
                type="button"
                onClick={() => onPttChange(!effectiveState.ptt)}
                disabled={!canControlConnected}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  effectiveState.ptt
                    ? "bg-alert-red/20 border-alert-red/40 text-alert-red"
                    : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
                }`}
                aria-pressed={!!effectiveState.ptt}
              >
                {effectiveState.ptt ? "PTT ON" : "PTT"}
              </button>
            ) : (
              <span className="text-[11px] px-2 py-1 rounded border border-white/10 bg-white/5 text-gray-400">
                RX Only
              </span>
            )}
          </div>

          {/* AGC */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">AGC</div>
            <button
              type="button"
              onClick={() => onAgcToggle(!effectiveState.agc)}
              disabled={!canControlConnected}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                effectiveState.agc
                  ? "bg-signal-green/10 border-signal-green/30 text-signal-green"
                  : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
              }`}
              aria-pressed={effectiveState.agc}
            >
              {effectiveState.agc ? "On" : "Off"}
            </button>
          </div>

          {/* Antenna */}
          {selectedDevice.capabilities.antennas.length > 1 ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Antenna
              </label>
              <select
                value={effectiveState.antenna ?? ""}
                onChange={(e) => onAntennaChange(e.target.value)}
                disabled={!canControlConnected}
                className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white text-sm"
              >
                {selectedDevice.capabilities.antennas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Gain stages */}
          {selectedDevice.capabilities.gain_stages.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-200">Gain</div>
              {selectedDevice.capabilities.gain_stages.map((st) => {
                const value = effectiveState.gains?.[st.name] ?? st.min;
                return (
                  <div key={st.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{st.label ?? st.name}</span>
                      <span className="text-gray-200 font-mono">
                        {Number.isFinite(value)
                          ? st.max <= 1
                            ? Math.round(value * 100) + "%"
                            : value
                          : "\u2014"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={st.min}
                      max={st.max}
                      step={st.step}
                      value={value}
                      onChange={(e) =>
                        onGainChange(st.name, Number(e.target.value))
                      }
                      disabled={!canControlConnected}
                      className="w-full"
                    />
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* DSP controls only when the device can stream audio (SDR) */}
          {selectedDevice.capabilities.can_stream_audio ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-200">DSP</div>

              {/* Filter */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Filter</span>
                  <span className="text-gray-200 font-mono">
                    {(effectiveState.filter?.low ?? 300).toFixed(0)}&ndash;
                    {(effectiveState.filter?.high ?? 2700).toFixed(0)} Hz
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="range"
                    min={0}
                    max={5000}
                    step={50}
                    value={effectiveState.filter?.low ?? 300}
                    onChange={(e) =>
                      onFilterChange(
                        Number(e.target.value),
                        effectiveState.filter?.high ?? 2700,
                      )
                    }
                    disabled={!canControlConnected}
                    className="w-full"
                    aria-label="Filter low cutoff"
                  />
                  <input
                    type="range"
                    min={500}
                    max={15000}
                    step={50}
                    value={effectiveState.filter?.high ?? 2700}
                    onChange={(e) =>
                      onFilterChange(
                        effectiveState.filter?.low ?? 300,
                        Number(e.target.value),
                      )
                    }
                    disabled={!canControlConnected}
                    className="w-full"
                    aria-label="Filter high cutoff"
                  />
                </div>
              </div>

              {/* NR */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>NR</span>
                  <button
                    type="button"
                    onClick={() =>
                      onNrChange(
                        !(effectiveState.nr?.enabled ?? false),
                        effectiveState.nr?.level ?? 3,
                      )
                    }
                    disabled={!canControlConnected}
                    className={`px-2 py-1 rounded border text-[11px] disabled:opacity-50 disabled:cursor-not-allowed ${
                      effectiveState.nr?.enabled
                        ? "bg-signal-green/10 border-signal-green/30 text-signal-green"
                        : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                    }`}
                    aria-pressed={effectiveState.nr?.enabled ?? false}
                  >
                    {effectiveState.nr?.enabled ? "On" : "Off"}
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={
                    effectiveState.nr?.enabled
                      ? (effectiveState.nr?.level ?? 3)
                      : 0
                  }
                  onChange={(e) =>
                    onNrChange(
                      Number(e.target.value) > 0,
                      Number(e.target.value),
                    )
                  }
                  disabled={!canControlConnected}
                  className="w-full"
                  aria-label="Noise reduction level"
                />
              </div>

              {/* NB */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>NB</span>
                  <button
                    type="button"
                    onClick={() =>
                      onNbChange(
                        !(effectiveState.nb?.enabled ?? false),
                        effectiveState.nb?.threshold ?? 50,
                      )
                    }
                    disabled={!canControlConnected}
                    className={`px-2 py-1 rounded border text-[11px] disabled:opacity-50 disabled:cursor-not-allowed ${
                      effectiveState.nb?.enabled
                        ? "bg-signal-green/10 border-signal-green/30 text-signal-green"
                        : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                    }`}
                    aria-pressed={effectiveState.nb?.enabled ?? false}
                  >
                    {effectiveState.nb?.enabled ? "On" : "Off"}
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={
                    effectiveState.nb?.enabled
                      ? (effectiveState.nb?.threshold ?? 50)
                      : 0
                  }
                  onChange={(e) =>
                    onNbChange(
                      Number(e.target.value) > 0,
                      Number(e.target.value),
                    )
                  }
                  disabled={!canControlConnected}
                  className="w-full"
                  aria-label="Noise blanker threshold"
                />
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ── S-meter ── */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>S-meter</span>
        <span className="text-gray-300 font-mono">
          {smeterDbm !== undefined ? `${smeterDbm.toFixed(1)} dBm` : "\u2014"}
        </span>
      </div>

      {/* ── FFT / Audio toggles ── */}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button
          type="button"
          onClick={onToggleFft}
          disabled={!canControlConnected || !canStreamFft}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            fftEnabled
              ? "bg-signal-green/10 border-signal-green/30 text-signal-green hover:bg-signal-green/20"
              : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
          }`}
        >
          {canStreamFft ? (fftEnabled ? "Stop FFT" : "Start FFT") : "FFT N/A"}
        </button>
        <button
          type="button"
          onClick={onToggleAudio}
          disabled={!canControlConnected || !canStreamAudio}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            audioEnabled
              ? "bg-plasma-orange/10 border-plasma-orange/30 text-plasma-orange hover:bg-plasma-orange/20"
              : "bg-white/5 border-white/10 text-gray-200 hover:bg-white/10"
          }`}
        >
          {canStreamAudio
            ? audioEnabled
              ? "Stop Audio"
              : "Start Audio"
            : "Audio N/A"}
        </button>
      </div>
    </Card>
  );
}

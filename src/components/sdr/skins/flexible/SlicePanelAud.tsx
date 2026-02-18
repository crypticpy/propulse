/**
 * SlicePanelAud — Comprehensive audio DSP tab for the slice flag.
 *
 * Contains all client-side audio processing controls:
 *   - AF Gain
 *   - Noise Control: Gate, Client NR, Expander
 *   - Tone Shaping: Sweetener, Spectral Taming
 *   - Dynamics: Compressor, Leveler
 *   - Fine Controls disclosure for advanced parameters
 */

import { useState } from "react";
import type { GainStage } from "@/lib/radio/protocol";
import { GainSlider } from "@/components/sdr/primitives/GainSlider";

// ─── Props ────────────────────────────────────────────────────────────────────

interface SlicePanelAudProps {
  afGainStage: GainStage | null;
  gains: Record<string, number>;
  onGainChange: (stage: string, value: number) => void;
  audioEnabled: boolean;
  // Noise gate
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
  onNoiseGateToggle: (enabled: boolean) => void;
  onNoiseGateThresholdChange: (threshold: number) => void;
  // Client NR
  clientNrEnabled: boolean;
  clientNrLevel: number;
  onClientNrToggle: (enabled: boolean) => void;
  onClientNrLevelChange: (level: number) => void;
  // Sweetener
  sweetenEnabled: boolean;
  sweetenAmount: number;
  onSweetenToggle: (enabled: boolean) => void;
  onSweetenAmountChange: (amount: number) => void;
  // Expander
  expanderEnabled: boolean;
  expanderThreshold: number;
  expanderRatio: number;
  expanderAttackMs: number;
  expanderReleaseMs: number;
  expanderRangeDb: number;
  onExpanderToggle: (enabled: boolean) => void;
  onExpanderThresholdChange: (threshold: number) => void;
  onExpanderRatioChange: (ratio: number) => void;
  onExpanderAttackMsChange: (attackMs: number) => void;
  onExpanderReleaseMsChange: (releaseMs: number) => void;
  onExpanderRangeDbChange: (rangeDb: number) => void;
  // Compressor
  compressorEnabled: boolean;
  compressorThreshold: number;
  compressorRatio: number;
  compressorAttackMs: number;
  compressorReleaseMs: number;
  compressorKnee: number;
  compressorMakeupDb: number;
  onCompressorToggle: (enabled: boolean) => void;
  onCompressorThresholdChange: (threshold: number) => void;
  onCompressorRatioChange: (ratio: number) => void;
  onCompressorAttackMsChange: (attackMs: number) => void;
  onCompressorReleaseMsChange: (releaseMs: number) => void;
  onCompressorKneeChange: (knee: number) => void;
  onCompressorMakeupDbChange: (makeupDb: number) => void;
  // Spectral Taming
  spectralTamingEnabled: boolean;
  spectralTamingTameAmount: number;
  spectralTamingRecoverAmount: number;
  spectralTamingSpeed: number;
  onSpectralTamingToggle: (enabled: boolean) => void;
  onSpectralTamingTameAmountChange: (amount: number) => void;
  onSpectralTamingRecoverAmountChange: (amount: number) => void;
  onSpectralTamingSpeedChange: (speed: number) => void;
  // Leveler
  levelerEnabled: boolean;
  levelerTargetLevel: number;
  levelerSpeed: number;
  levelerMaxGainDb: number;
  onLevelerToggle: (enabled: boolean) => void;
  onLevelerTargetLevelChange: (level: number) => void;
  onLevelerSpeedChange: (speed: number) => void;
  onLevelerMaxGainDbChange: (maxGainDb: number) => void;
  canControl: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nrLevelLabel(level: number): string {
  if (level === 0) return "Off";
  if (level <= 3) return "Mild";
  if (level <= 6) return "Moderate";
  return "Aggressive";
}

function DspSlider({
  label,
  value,
  displayValue,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-gray-500 w-9 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="flex-1 h-1 accent-plasma-orange disabled:opacity-40"
      />
      <span className="text-[9px] font-mono text-gray-400 w-12 text-right shrink-0">
        {displayValue}
      </span>
    </div>
  );
}

function DspToggle({
  label,
  active,
  onToggle,
  disabled,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`px-1.5 py-0.5 text-[9px] font-semibold rounded border transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed ${
          active
            ? "bg-signal-green/15 border-signal-green/30 text-signal-green"
            : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
        }`}
    >
      {label}
    </button>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div className="text-[8px] text-gray-600 uppercase tracking-widest pt-1 pb-0.5 border-t border-white/5">
      {title}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SlicePanelAud({
  afGainStage,
  gains,
  onGainChange,
  audioEnabled,
  noiseGateEnabled,
  noiseGateThreshold,
  onNoiseGateToggle,
  onNoiseGateThresholdChange,
  clientNrEnabled,
  clientNrLevel,
  onClientNrToggle,
  onClientNrLevelChange,
  sweetenEnabled,
  sweetenAmount,
  onSweetenToggle,
  onSweetenAmountChange,
  expanderEnabled,
  expanderThreshold,
  expanderRatio,
  expanderAttackMs,
  expanderReleaseMs,
  expanderRangeDb,
  onExpanderToggle,
  onExpanderThresholdChange,
  onExpanderRatioChange,
  onExpanderAttackMsChange,
  onExpanderReleaseMsChange,
  onExpanderRangeDbChange,
  compressorEnabled,
  compressorThreshold,
  compressorRatio,
  compressorAttackMs,
  compressorReleaseMs,
  compressorKnee,
  compressorMakeupDb,
  onCompressorToggle,
  onCompressorThresholdChange,
  onCompressorRatioChange,
  onCompressorAttackMsChange,
  onCompressorReleaseMsChange,
  onCompressorKneeChange,
  onCompressorMakeupDbChange,
  spectralTamingEnabled,
  spectralTamingTameAmount,
  spectralTamingRecoverAmount,
  spectralTamingSpeed,
  onSpectralTamingToggle,
  onSpectralTamingTameAmountChange,
  onSpectralTamingRecoverAmountChange,
  onSpectralTamingSpeedChange,
  levelerEnabled,
  levelerTargetLevel,
  levelerSpeed,
  levelerMaxGainDb,
  onLevelerToggle,
  onLevelerTargetLevelChange,
  onLevelerSpeedChange,
  onLevelerMaxGainDbChange,
  canControl,
}: SlicePanelAudProps) {
  const [showFine, setShowFine] = useState(false);

  const dspDisabled = !audioEnabled || !canControl;

  return (
    <div className="space-y-1.5">
      {/* AF Gain */}
      {afGainStage && (
        <GainSlider
          stage={afGainStage}
          value={gains[afGainStage.name] ?? afGainStage.min}
          onChange={(v) => onGainChange(afGainStage.name, v)}
          disabled={!canControl}
          size="compact"
        />
      )}

      {/* Audio required note */}
      {!audioEnabled && (
        <div className="text-[10px] text-gray-600 italic py-1">
          Start audio stream to use DSP
        </div>
      )}

      {audioEnabled && (
        <>
          <Section title="Noise Control" />

          {/* Gate row */}
          <div className="flex items-center gap-1.5">
            <DspToggle
              label={`Gate ${noiseGateEnabled ? "On" : "Off"}`}
              active={noiseGateEnabled}
              onToggle={() => onNoiseGateToggle(!noiseGateEnabled)}
              disabled={dspDisabled}
            />
            {noiseGateEnabled && (
              <DspSlider
                label="Thr"
                value={noiseGateThreshold}
                displayValue={`${noiseGateThreshold}dB`}
                min={-80}
                max={-20}
                step={1}
                onChange={onNoiseGateThresholdChange}
                disabled={dspDisabled}
              />
            )}
          </div>

          {/* NR row */}
          <div className="flex items-center gap-1.5">
            <DspToggle
              label={`NR ${clientNrEnabled ? "On" : "Off"}`}
              active={clientNrEnabled}
              onToggle={() => onClientNrToggle(!clientNrEnabled)}
              disabled={dspDisabled}
            />
            {clientNrEnabled && (
              <DspSlider
                label="Lvl"
                value={clientNrLevel}
                displayValue={`${clientNrLevel} ${nrLevelLabel(clientNrLevel)}`}
                min={0}
                max={10}
                step={1}
                onChange={onClientNrLevelChange}
                disabled={dspDisabled}
              />
            )}
          </div>

          {/* Expander row */}
          <div className="flex items-center gap-1.5">
            <DspToggle
              label={`EXP ${expanderEnabled ? "On" : "Off"}`}
              active={expanderEnabled}
              onToggle={() => onExpanderToggle(!expanderEnabled)}
              disabled={dspDisabled}
            />
            {expanderEnabled && (
              <DspSlider
                label="Thr"
                value={expanderThreshold}
                displayValue={`${expanderThreshold}dB`}
                min={-80}
                max={-10}
                step={1}
                onChange={onExpanderThresholdChange}
                disabled={dspDisabled}
              />
            )}
          </div>
          {expanderEnabled && (
            <DspSlider
              label="Ratio"
              value={expanderRatio}
              displayValue={`${expanderRatio.toFixed(1)}x`}
              min={1}
              max={6}
              step={0.1}
              onChange={onExpanderRatioChange}
              disabled={dspDisabled}
            />
          )}

          <Section title="Tone Shaping" />

          {/* Sweetener row */}
          <div className="flex items-center gap-1.5">
            <DspToggle
              label={`SWEET ${sweetenEnabled ? "On" : "Off"}`}
              active={sweetenEnabled}
              onToggle={() => onSweetenToggle(!sweetenEnabled)}
              disabled={dspDisabled}
            />
            {sweetenEnabled && (
              <DspSlider
                label="Amt"
                value={Math.round(sweetenAmount * 100)}
                displayValue={`${Math.round(sweetenAmount * 100)}%`}
                min={0}
                max={100}
                step={1}
                onChange={(v) => onSweetenAmountChange(v / 100)}
                disabled={dspDisabled}
              />
            )}
          </div>

          {/* Taming row */}
          <div className="flex items-center gap-1.5">
            <DspToggle
              label={`TAME ${spectralTamingEnabled ? "On" : "Off"}`}
              active={spectralTamingEnabled}
              onToggle={() => onSpectralTamingToggle(!spectralTamingEnabled)}
              disabled={dspDisabled}
            />
            {spectralTamingEnabled && (
              <DspSlider
                label="Tame"
                value={Math.round(spectralTamingTameAmount * 100)}
                displayValue={`${Math.round(spectralTamingTameAmount * 100)}%`}
                min={0}
                max={100}
                step={1}
                onChange={(v) => onSpectralTamingTameAmountChange(v / 100)}
                disabled={dspDisabled}
              />
            )}
          </div>
          {spectralTamingEnabled && (
            <DspSlider
              label="Rcvr"
              value={Math.round(spectralTamingRecoverAmount * 100)}
              displayValue={`${Math.round(spectralTamingRecoverAmount * 100)}%`}
              min={0}
              max={100}
              step={1}
              onChange={(v) => onSpectralTamingRecoverAmountChange(v / 100)}
              disabled={dspDisabled}
            />
          )}

          <Section title="Dynamics" />

          {/* Compressor row */}
          <div className="flex items-center gap-1.5">
            <DspToggle
              label={`COMP ${compressorEnabled ? "On" : "Off"}`}
              active={compressorEnabled}
              onToggle={() => onCompressorToggle(!compressorEnabled)}
              disabled={dspDisabled}
            />
            {compressorEnabled && (
              <DspSlider
                label="Thr"
                value={compressorThreshold}
                displayValue={`${compressorThreshold}dB`}
                min={-60}
                max={0}
                step={1}
                onChange={onCompressorThresholdChange}
                disabled={dspDisabled}
              />
            )}
          </div>
          {compressorEnabled && (
            <>
              <DspSlider
                label="Ratio"
                value={compressorRatio}
                displayValue={`${compressorRatio.toFixed(1)}x`}
                min={1}
                max={20}
                step={0.1}
                onChange={onCompressorRatioChange}
                disabled={dspDisabled}
              />
              <DspSlider
                label="Make"
                value={compressorMakeupDb}
                displayValue={`${compressorMakeupDb.toFixed(1)}dB`}
                min={-6}
                max={18}
                step={0.5}
                onChange={onCompressorMakeupDbChange}
                disabled={dspDisabled}
              />
            </>
          )}

          {/* Leveler row */}
          <div className="flex items-center gap-1.5">
            <DspToggle
              label={`LVL ${levelerEnabled ? "On" : "Off"}`}
              active={levelerEnabled}
              onToggle={() => onLevelerToggle(!levelerEnabled)}
              disabled={dspDisabled}
            />
            {levelerEnabled && (
              <DspSlider
                label="Tgt"
                value={levelerTargetLevel}
                displayValue={`${levelerTargetLevel}dBFS`}
                min={-40}
                max={-10}
                step={1}
                onChange={onLevelerTargetLevelChange}
                disabled={dspDisabled}
              />
            )}
          </div>

          {/* Fine Controls disclosure */}
          <button
            type="button"
            onClick={() => setShowFine((v) => !v)}
            className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded border bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200"
          >
            {showFine ? "Hide Fine Controls" : "Show Fine Controls"}
          </button>

          {showFine && (
            <div className="space-y-1.5">
              {/* Expander fine */}
              {expanderEnabled && (
                <>
                  <div className="text-[8px] text-gray-600 uppercase tracking-widest pt-0.5">
                    Expander Fine
                  </div>
                  <DspSlider
                    label="Atk"
                    value={expanderAttackMs}
                    displayValue={`${expanderAttackMs.toFixed(1)}ms`}
                    min={0.1}
                    max={50}
                    step={0.1}
                    onChange={onExpanderAttackMsChange}
                    disabled={dspDisabled}
                  />
                  <DspSlider
                    label="Rel"
                    value={expanderReleaseMs}
                    displayValue={`${expanderReleaseMs}ms`}
                    min={1}
                    max={500}
                    step={1}
                    onChange={onExpanderReleaseMsChange}
                    disabled={dspDisabled}
                  />
                  <DspSlider
                    label="Rng"
                    value={expanderRangeDb}
                    displayValue={`${expanderRangeDb}dB`}
                    min={0}
                    max={60}
                    step={1}
                    onChange={onExpanderRangeDbChange}
                    disabled={dspDisabled}
                  />
                </>
              )}

              {/* Compressor fine */}
              {compressorEnabled && (
                <>
                  <div className="text-[8px] text-gray-600 uppercase tracking-widest pt-0.5">
                    Compressor Fine
                  </div>
                  <DspSlider
                    label="Atk"
                    value={compressorAttackMs}
                    displayValue={`${compressorAttackMs}ms`}
                    min={0}
                    max={100}
                    step={1}
                    onChange={onCompressorAttackMsChange}
                    disabled={dspDisabled}
                  />
                  <DspSlider
                    label="Rel"
                    value={compressorReleaseMs}
                    displayValue={`${compressorReleaseMs}ms`}
                    min={1}
                    max={500}
                    step={1}
                    onChange={onCompressorReleaseMsChange}
                    disabled={dspDisabled}
                  />
                  <DspSlider
                    label="Knee"
                    value={compressorKnee}
                    displayValue={`${compressorKnee}dB`}
                    min={0}
                    max={40}
                    step={1}
                    onChange={onCompressorKneeChange}
                    disabled={dspDisabled}
                  />
                </>
              )}

              {/* Taming fine */}
              {spectralTamingEnabled && (
                <>
                  <div className="text-[8px] text-gray-600 uppercase tracking-widest pt-0.5">
                    Taming Fine
                  </div>
                  <DspSlider
                    label="Spd"
                    value={spectralTamingSpeed}
                    displayValue={spectralTamingSpeed.toFixed(3)}
                    min={0.005}
                    max={0.2}
                    step={0.005}
                    onChange={onSpectralTamingSpeedChange}
                    disabled={dspDisabled}
                  />
                </>
              )}

              {/* Leveler fine */}
              {levelerEnabled && (
                <>
                  <div className="text-[8px] text-gray-600 uppercase tracking-widest pt-0.5">
                    Leveler Fine
                  </div>
                  <DspSlider
                    label="Spd"
                    value={levelerSpeed}
                    displayValue={levelerSpeed.toFixed(3)}
                    min={0.005}
                    max={0.2}
                    step={0.005}
                    onChange={onLevelerSpeedChange}
                    disabled={dspDisabled}
                  />
                  <DspSlider
                    label="Max"
                    value={levelerMaxGainDb}
                    displayValue={`${levelerMaxGainDb}dB`}
                    min={0}
                    max={24}
                    step={1}
                    onChange={onLevelerMaxGainDbChange}
                    disabled={dspDisabled}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

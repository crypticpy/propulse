/**
 * GainSlider — Gain stage control: discrete buttons or continuous slider.
 *
 * Pure presentational component. Detects discrete stages (PREAMP, ATT)
 * and renders a button row; all other stages render as a range slider
 * with label and value readout.
 */

import type { GainStage } from "@/lib/radio/protocol";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface GainSliderProps {
  /** Gain stage definition from the radio. */
  stage: GainStage;
  /** Current value. */
  value: number;
  /** Value change handler. */
  onChange: (value: number) => void;
  /** Disable interaction (e.g. when radio is not controllable). */
  disabled?: boolean;
  /** Display size. Default "normal". */
  size?: "compact" | "normal";
  /** Accent color for the slider/active button. Default "cosmic-cyan". */
  accentColor?: string;
}

// ─── Discrete stage detection ────────────────────────────────────────────────

const DISCRETE_STAGES = new Set(["PREAMP", "ATT"]);

const DISCRETE_STEPS = [
  { label: "Off", value: 0 },
  { label: "10dB", value: 10 },
  { label: "20dB", value: 20 },
] as const;

// ─── Size mapping ────────────────────────────────────────────────────────────

const SIZE_CONFIG = {
  compact: { labelText: "text-[9px]", sliderH: "h-1" },
  normal: { labelText: "text-[10px]", sliderH: "h-1.5" },
} as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function GainSlider({
  stage,
  value,
  onChange,
  disabled = false,
  size = "normal",
  accentColor = "cosmic-cyan",
}: GainSliderProps) {
  const cfg = SIZE_CONFIG[size];
  const displayLabel = stage.label ?? stage.name;
  const isDiscrete = DISCRETE_STAGES.has(stage.name);

  // ── Discrete: button row ──
  if (isDiscrete) {
    return (
      <div className="space-y-0.5">
        <span className={`${cfg.labelText} text-gray-500`}>{displayLabel}</span>
        <div className="flex gap-1">
          {DISCRETE_STEPS.map((step) => (
            <button
              key={step.value}
              type="button"
              onClick={() => onChange(step.value)}
              disabled={disabled}
              className={`flex-1 px-1.5 py-0.5 ${cfg.labelText} font-medium rounded border transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed ${
                  value === step.value
                    ? `bg-signal-green/15 text-signal-green border-signal-green/30`
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

  // ── Continuous: range slider ──
  const displayValue =
    stage.max <= 1 ? `${Math.round(value * 100)}%` : String(value);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className={`${cfg.labelText} text-gray-500`}>{displayLabel}</span>
        <span className={`${cfg.labelText} text-gray-200 font-mono`}>
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={stage.min}
        max={stage.max}
        step={stage.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={`w-full ${cfg.sliderH} accent-${accentColor} disabled:opacity-40`}
      />
    </div>
  );
}

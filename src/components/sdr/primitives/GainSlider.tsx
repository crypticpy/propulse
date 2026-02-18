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

function stageToken(stage: GainStage): string {
  return `${stage.name} ${stage.label ?? ""}`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function isDiscreteStage(stage: GainStage): boolean {
  const token = stageToken(stage);
  return (
    token.includes("PREAMP") ||
    token === "PRE" ||
    token === "ATT" ||
    token.includes("ATTEN")
  );
}

function buildDiscreteSteps(stage: GainStage): Array<{ label: string; value: number }> {
  const values: number[] = [];
  const step = stage.step > 0 ? stage.step : 1;
  const maxSteps = 32;

  for (let i = 0; i <= maxSteps; i++) {
    const v = stage.min + i * step;
    if (v > stage.max + step * 0.001) break;
    values.push(Number(v.toFixed(6)));
  }
  if (!values.includes(stage.max)) values.push(Number(stage.max.toFixed(6)));

  const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
  return uniqueValues.map((value) => {
    if (Math.abs(value) < 0.0001) return { label: "Off", value };
    const compact =
      Math.abs(value - Math.round(value)) < 0.001
        ? String(Math.round(value))
        : value.toFixed(1);
    return { label: `${compact}dB`, value };
  });
}

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
  const isDiscrete = isDiscreteStage(stage);
  const discreteSteps = buildDiscreteSteps(stage);

  // ── Discrete: button row ──
  if (isDiscrete) {
    return (
      <div className="space-y-0.5">
        <span className={`${cfg.labelText} text-gray-500`}>{displayLabel}</span>
        <div className="flex gap-1">
          {discreteSteps.map((step) => (
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

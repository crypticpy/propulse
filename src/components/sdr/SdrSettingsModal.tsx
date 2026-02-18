/**
 * SdrSettingsModal — SmartSDR-inspired settings panel
 *
 * Tabbed modal providing direct access to all SDR visual settings
 * (Spectrum, Waterfall, Passband, Slice). Design inspired by FlexRadio
 * SmartSDR's instrument-panel aesthetic while matching Propulse UI conventions.
 * All changes are applied immediately via the settings store.
 */

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  DEFAULT_FFT_STREAM_FPS,
  computeEffectiveWaterfallRowsPerSecond,
} from "@/lib/sdr/fftStreamParams";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import {
  PALETTE_NAMES,
  getPaletteDisplayName,
  getWaterfallPaletteGradientCss,
} from "@/components/sdr/waterfallPalette";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SdrSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SdrSettingsTab = "spectrum" | "waterfall" | "passband" | "slice";

const TABS: { id: SdrSettingsTab; label: string }[] = [
  { id: "spectrum", label: "Spectrum" },
  { id: "waterfall", label: "Waterfall" },
  { id: "passband", label: "Passband" },
  { id: "slice", label: "Slice" },
];

const BLEND_MODES = [
  "screen",
  "overlay",
  "color-dodge",
  "color-burn",
  "soft-light",
  "none",
] as const;

// ─── Default values (for per-tab reset) ─────────────────────────────────────

const SPECTRUM_DEFAULTS = {
  sdrSpectrumBgColor: "#000000",
  sdrSpectrumGridLines: 3,
  sdrSpectrumVerticalGridLines: 6,
  sdrSpectrumGridOpacity: 0.08,
  sdrSpectrumSmoothing: 0,
  sdrSpectrumLineColor: "auto",
  sdrSpectrumLineWidth: 2,
  sdrSpectrumFillOpacity: 0.3,
  sdrSpectrumLineShadow: true,
  sdrSpectrumLineShadowBlur: 8,
  sdrSpectrumPeakHold: true,
  sdrSpectrumGradientFill: true,
  sdrTuningLineColor: "#00ebff",
  sdrTuningArrowColor: "#00ebff",
} as const;

const WATERFALL_DEFAULTS = {
  sdrWaterfallPalette: "classic",
  sdrWaterfallMinDb: -125,
  sdrWaterfallMaxDb: -40,
  sdrWaterfallSpeed: 1,
  sdrWaterfallInterpolation: "nearest",
  sdrWaterfallGamma: 1.0,
  sdrWaterfallRowHeight: 1,
} as const;

const PASSBAND_DEFAULTS = {
  sdrPassbandBlendMode: "screen",
  sdrPassbandOpacity: 0.08,
} as const;

const SLICE_DEFAULTS = {
  sdrSliceBgColor: "rgba(0, 40, 60, 0.85)",
} as const;

// ─── Inline UI Helpers ──────────────────────────────────────────────────────

/** Orange-pip section header matching the Propulse settings convention */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="w-[3px] h-3 rounded-full bg-plasma-orange/60" />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {children}
      </h3>
    </div>
  );
}

/** Range slider matching SettingSlider styling from the Settings page */
function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  description,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  description?: string;
  onChange: (v: number) => void;
}) {
  const display = format ? format(value) : String(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-300">{label}</span>
        <span className="text-sm text-gray-400 font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-void-black rounded-lg appearance-none cursor-pointer accent-plasma-orange"
      />
      {description && (
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      )}
    </div>
  );
}

/** Color picker with hex readout and conditional reset link */
function ColorPicker({
  label,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
}) {
  const hexValue = value.startsWith("#") ? value : "#002840";
  const isDefault = value === defaultValue;

  return (
    <div>
      <span className="text-sm font-medium text-gray-300">{label}</span>
      <div className="flex items-center gap-3 mt-1.5">
        <input
          type="color"
          value={hexValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/20 flex-shrink-0"
        />
        <span className="text-xs font-mono text-gray-500 min-w-0 truncate">
          {value}
        </span>
        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="text-[10px] text-gray-500 hover:text-plasma-orange underline underline-offset-2 flex-shrink-0 transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

/** Subtle reset link shown at the bottom of each tab */
function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="pt-4 border-t border-white/5">
      <button
        type="button"
        onClick={onClick}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        Reset tab to defaults
      </button>
    </div>
  );
}

// ─── Spectrum Tab ───────────────────────────────────────────────────────────

function SpectrumTab() {
  const bgColor = useSettingsStore((s) => s.sdrSpectrumBgColor ?? "#000000");
  const gridLines = useSettingsStore((s) => s.sdrSpectrumGridLines ?? 3);
  const verticalGridLines = useSettingsStore(
    (s) => s.sdrSpectrumVerticalGridLines ?? 6,
  );
  const gridOpacity = useSettingsStore((s) => s.sdrSpectrumGridOpacity ?? 0.08);
  const smoothing = useSettingsStore((s) => s.sdrSpectrumSmoothing ?? 0);
  const lineColor = useSettingsStore((s) => s.sdrSpectrumLineColor ?? "auto");
  const lineWidth = useSettingsStore((s) => s.sdrSpectrumLineWidth ?? 2);
  const fillOpacity = useSettingsStore((s) => s.sdrSpectrumFillOpacity ?? 0.3);
  const lineShadow = useSettingsStore((s) => s.sdrSpectrumLineShadow ?? true);
  const shadowBlur = useSettingsStore((s) => s.sdrSpectrumLineShadowBlur ?? 8);
  const peakHold = useSettingsStore((s) => s.sdrSpectrumPeakHold);
  const gradientFill = useSettingsStore((s) => s.sdrSpectrumGradientFill);
  const tuningLineColor = useSettingsStore(
    (s) => s.sdrTuningLineColor ?? "#00ebff",
  );
  const tuningArrowColor = useSettingsStore(
    (s) => s.sdrTuningArrowColor ?? "#00ebff",
  );
  const update = useSettingsStore((s) => s.updatePreferences);

  return (
    <div className="space-y-5">
      {/* ── Trace ──────────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Trace</SectionLabel>

        {/* Line Color — auto toggle + manual picker */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-300">
              Line Color
            </span>
            <span className="text-xs font-mono text-gray-500">
              {lineColor === "auto" ? "auto" : lineColor}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                update({
                  sdrSpectrumLineColor:
                    lineColor === "auto" ? "#00dcff" : "auto",
                })
              }
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors border ${
                lineColor === "auto"
                  ? "bg-plasma-orange/15 text-plasma-orange border-plasma-orange/30"
                  : "text-gray-400 border-white/10 hover:text-gray-200 hover:border-white/20"
              }`}
            >
              Auto
            </button>
            {lineColor === "auto" ? (
              <span className="text-xs text-gray-500">
                Derived from waterfall palette
              </span>
            ) : (
              <input
                type="color"
                value={lineColor}
                onChange={(e) =>
                  update({ sdrSpectrumLineColor: e.target.value })
                }
                className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/20"
              />
            )}
          </div>
        </div>

        <Slider
          label="Line Width"
          value={lineWidth}
          min={1}
          max={4}
          step={0.5}
          format={(v) => `${v}px`}
          onChange={(v) => update({ sdrSpectrumLineWidth: v })}
        />

        <ToggleSwitch
          checked={gradientFill}
          onChange={(v) => update({ sdrSpectrumGradientFill: v })}
          label="Gradient Fill"
          description="Show gradient fill under the trace line"
        />

        {gradientFill && (
          <div className="pl-4 border-l-2 border-white/5">
            <Slider
              label="Fill Opacity"
              value={fillOpacity}
              min={0}
              max={1}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => update({ sdrSpectrumFillOpacity: v })}
            />
          </div>
        )}
      </div>

      <div className="border-t border-white/10" />

      {/* ── Effects ────────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Effects</SectionLabel>

        <ToggleSwitch
          checked={peakHold}
          onChange={(v) => update({ sdrSpectrumPeakHold: v })}
          label="Peak Hold"
          description="Show a fading peak envelope above the live trace"
        />

        <ToggleSwitch
          checked={lineShadow}
          onChange={(v) => update({ sdrSpectrumLineShadow: v })}
          label="Drop Shadow"
          description="Glow effect on the trace line"
        />

        {lineShadow && (
          <div className="pl-4 border-l-2 border-white/5">
            <Slider
              label="Shadow Blur"
              value={shadowBlur}
              min={2}
              max={20}
              format={(v) => `${v}px`}
              onChange={(v) => update({ sdrSpectrumLineShadowBlur: v })}
            />
          </div>
        )}

        <Slider
          label="Smoothing"
          value={smoothing}
          min={0}
          max={10}
          format={(v) => (v === 0 ? "Off (raw)" : `${v} passes`)}
          description="Number of averaging passes applied to FFT data"
          onChange={(v) => update({ sdrSpectrumSmoothing: v })}
        />
      </div>

      <div className="border-t border-white/10" />

      {/* ── Tuning Indicator ──────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Tuning Indicator</SectionLabel>
        <p className="text-xs text-gray-500">
          Arrow points down from the top, leaning toward the active sideband.
          Line extends from the arrow tip to the frequency.
        </p>
        <ColorPicker
          label="Line Color"
          value={tuningLineColor}
          defaultValue="#00ebff"
          onChange={(v) => update({ sdrTuningLineColor: v })}
        />
        <ColorPicker
          label="Arrow Color"
          value={tuningArrowColor}
          defaultValue="#00ebff"
          onChange={(v) => update({ sdrTuningArrowColor: v })}
        />
      </div>

      <div className="border-t border-white/10" />

      {/* ── Grid & Background ─────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Grid & Background</SectionLabel>

        <ColorPicker
          label="Background"
          value={bgColor}
          defaultValue="#000000"
          onChange={(v) => update({ sdrSpectrumBgColor: v })}
        />

        <Slider
          label="Horizontal Grid Lines"
          value={gridLines}
          min={0}
          max={8}
          format={(v) => (v === 0 ? "None" : String(v))}
          onChange={(v) => update({ sdrSpectrumGridLines: v })}
        />

        <Slider
          label="Vertical Grid Lines"
          value={verticalGridLines}
          min={0}
          max={16}
          format={(v) => (v === 0 ? "None" : String(v))}
          onChange={(v) => update({ sdrSpectrumVerticalGridLines: v })}
        />

        {gridLines > 0 && (
          <div className="pl-4 border-l-2 border-white/5">
            <Slider
              label="Grid Opacity"
              value={gridOpacity}
              min={0}
              max={0.3}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(v) => update({ sdrSpectrumGridOpacity: v })}
            />
          </div>
        )}
      </div>

      <ResetButton onClick={() => update({ ...SPECTRUM_DEFAULTS })} />
    </div>
  );
}

// ─── Waterfall Tab ──────────────────────────────────────────────────────────

function WaterfallTab() {
  const palette = useSettingsStore((s) => s.sdrWaterfallPalette);
  const minDb = useSettingsStore((s) => s.sdrWaterfallMinDb);
  const maxDb = useSettingsStore((s) => s.sdrWaterfallMaxDb);
  const speed = useSettingsStore((s) => s.sdrWaterfallSpeed);
  const interpolation = useSettingsStore((s) => s.sdrWaterfallInterpolation);
  const gamma = useSettingsStore((s) => s.sdrWaterfallGamma);
  const rowHeight = useSettingsStore((s) => s.sdrWaterfallRowHeight);
  const update = useSettingsStore((s) => s.updatePreferences);

  return (
    <div className="space-y-5">
      {/* ── Color Palette ─────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Color Palette</SectionLabel>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {PALETTE_NAMES.map((name) => {
            const isActive = palette === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => update({ sdrWaterfallPalette: name })}
                className={`group flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all ${
                  isActive
                    ? "bg-plasma-orange/10 ring-1 ring-plasma-orange/40"
                    : "hover:bg-white/5"
                }`}
                title={getPaletteDisplayName(name)}
              >
                <div
                  className={`w-full h-5 rounded-sm border transition-colors ${
                    isActive
                      ? "border-plasma-orange/50"
                      : "border-white/10 group-hover:border-white/25"
                  }`}
                  style={{
                    background: getWaterfallPaletteGradientCss(name),
                  }}
                />
                <span
                  className={`text-[10px] leading-tight transition-colors ${
                    isActive
                      ? "text-plasma-orange font-medium"
                      : "text-gray-500 group-hover:text-gray-400"
                  }`}
                >
                  {getPaletteDisplayName(name)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-white/10" />

      {/* ── Dynamic Range ─────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Dynamic Range</SectionLabel>

        <Slider
          label="dB Floor"
          value={minDb}
          min={-160}
          max={maxDb - 5}
          step={5}
          format={(v) => `${v} dB`}
          description="Signal level mapped to black (bottom of palette)"
          onChange={(v) => update({ sdrWaterfallMinDb: v })}
        />

        <Slider
          label="dB Ceiling"
          value={maxDb}
          min={minDb + 5}
          max={0}
          step={5}
          format={(v) => `${v} dB`}
          description="Signal level mapped to brightest color (top of palette)"
          onChange={(v) => update({ sdrWaterfallMaxDb: v })}
        />

        <Slider
          label="Scroll Speed"
          value={speed}
          min={1}
          max={4}
          format={(v) => {
            const rowsPerSec = computeEffectiveWaterfallRowsPerSecond(
              v,
              rowHeight,
              DEFAULT_FFT_STREAM_FPS,
            );
            return `${v}× (~${Math.round(rowsPerSec)} rows/s)`;
          }}
          description={`Controls how many waterfall rows are appended per received FFT frame (stream is ${DEFAULT_FFT_STREAM_FPS} fps).`}
          onChange={(v) => update({ sdrWaterfallSpeed: v })}
        />
      </div>

      <div className="border-t border-white/10" />

      {/* ── Fidelity ──────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Fidelity</SectionLabel>

        {/* Interpolation — SegmentedButton style */}
        <div>
          <span className="text-sm font-medium text-gray-300">
            Interpolation
          </span>
          <div className="flex gap-1 p-1 mt-1.5 bg-void-black rounded-lg border border-white/10">
            {(["nearest", "linear"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => update({ sdrWaterfallInterpolation: mode })}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  interpolation === mode
                    ? "bg-plasma-orange text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {mode === "nearest" ? "Nearest (Sharp)" : "Linear (Smooth)"}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Nearest preserves sharp FFT bins. Linear smooths pixel edges.
          </p>
        </div>

        <Slider
          label="Gamma"
          value={gamma}
          min={0.3}
          max={3.0}
          step={0.1}
          format={(v) =>
            `${v.toFixed(1)}${Math.abs(v - 1.0) < 0.05 ? " (linear)" : ""}`
          }
          description="Controls the brightness curve of the palette mapping"
          onChange={(v) => update({ sdrWaterfallGamma: v })}
        />

        <Slider
          label="Row Height"
          value={rowHeight}
          min={1}
          max={4}
          format={(v) => `${v}px`}
          description="Pixels per FFT line — higher values stretch the display vertically"
          onChange={(v) => update({ sdrWaterfallRowHeight: v })}
        />
      </div>

      <ResetButton onClick={() => update({ ...WATERFALL_DEFAULTS })} />
    </div>
  );
}

// ─── Passband Tab ───────────────────────────────────────────────────────────

function PassbandTab() {
  const blendMode = useSettingsStore((s) => s.sdrPassbandBlendMode ?? "screen");
  const opacity = useSettingsStore((s) => s.sdrPassbandOpacity ?? 0.08);
  const update = useSettingsStore((s) => s.updatePreferences);

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500 leading-relaxed">
        The passband overlay highlights the receiver filter bandwidth on both
        the spectrum scope and waterfall. These settings control its visual
        appearance.
      </p>

      {/* ── Blend Mode ────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Blend Mode</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {BLEND_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => update({ sdrPassbandBlendMode: mode })}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                blendMode === mode
                  ? "bg-plasma-orange/15 text-plasma-orange border-plasma-orange/30"
                  : "bg-white/5 text-gray-400 border-white/10 hover:text-gray-200 hover:border-white/20"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          How the passband color composites with the waterfall beneath it
        </p>
      </div>

      <div className="border-t border-white/10" />

      {/* ── Opacity ───────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Opacity</SectionLabel>
        <Slider
          label="Passband Opacity"
          value={opacity}
          min={0}
          max={0.3}
          step={0.01}
          format={(v) => v.toFixed(2)}
          description="Higher values make the passband more visible but may obscure signals"
          onChange={(v) => update({ sdrPassbandOpacity: v })}
        />
      </div>

      <ResetButton onClick={() => update({ ...PASSBAND_DEFAULTS })} />
    </div>
  );
}

// ─── Slice Tab ──────────────────────────────────────────────────────────────

function SliceTab() {
  const sliceBgColor = useSettingsStore(
    (s) => s.sdrSliceBgColor ?? "rgba(0, 40, 60, 0.85)",
  );
  const update = useSettingsStore((s) => s.updatePreferences);

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500 leading-relaxed">
        The slice flag is the floating frequency display on the Flexible skin.
        Customize its background to match your preferences.
      </p>

      {/* ── Appearance ────────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Appearance</SectionLabel>
        <ColorPicker
          label="Background Color"
          value={sliceBgColor}
          defaultValue="rgba(0, 40, 60, 0.85)"
          onChange={(v) => update({ sdrSliceBgColor: v })}
        />
      </div>

      <div className="border-t border-white/10" />

      {/* ── Live Preview ──────────────────────── */}
      <div className="space-y-3">
        <SectionLabel>Preview</SectionLabel>
        <div className="p-4 rounded-lg bg-void-black border border-white/10">
          {/* Mini slice flag */}
          <div
            className="relative inline-flex flex-col gap-1.5 px-4 py-2.5 rounded-md border border-white/10"
            style={{
              backgroundColor: sliceBgColor,
              boxShadow: "inset 3px 0 0 rgba(0, 220, 255, 0.6)",
            }}
          >
            {/* Top row: label + badges */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-cyan-400 tracking-wider">
                Slice A
              </span>
              <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-gray-400">
                ANT1
              </span>
              <span className="text-[9px] px-1 py-0.5 rounded bg-signal-green/20 text-signal-green">
                RX
              </span>
            </div>
            {/* Segmented frequency */}
            <div className="flex items-baseline gap-0.5 font-mono">
              <span
                className="text-lg font-bold text-white"
                style={{ textShadow: "0 0 8px rgba(0,220,255,0.3)" }}
              >
                14
              </span>
              <span className="text-lg font-bold text-white/50">.</span>
              <span
                className="text-lg font-bold text-white"
                style={{ textShadow: "0 0 8px rgba(0,220,255,0.3)" }}
              >
                074
              </span>
              <span className="text-lg font-bold text-white/50">.</span>
              <span className="text-sm text-gray-400">000</span>
            </div>
            {/* Mode pill */}
            <span className="inline-flex self-start px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-500/20 text-green-400">
              USB
            </span>
          </div>
        </div>
      </div>

      <ResetButton onClick={() => update({ ...SLICE_DEFAULTS })} />
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────────

export function SdrSettingsModal({ isOpen, onClose }: SdrSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SdrSettingsTab>("spectrum");

  // Prevent background scroll while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 md:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal card */}
      <div
        className={
          "relative z-10 w-full max-w-2xl max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-3rem)] " +
          "flex flex-col rounded-2xl bg-black/90 backdrop-blur-md border border-white/15 " +
          "shadow-2xl shadow-black/50"
        }
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-0 flex-shrink-0">
          <div>
            <h2 className="font-orbitron text-lg font-bold text-gradient-orange">
              SDR Display
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Spectrum, waterfall & overlay configuration
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors -mr-2 -mt-1"
            aria-label="Close settings"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tab bar — SegmentedButton pattern */}
        <div className="flex gap-1 p-1 mx-6 mt-4 mb-1 bg-void-black rounded-lg border border-white/10 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-plasma-orange text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content (scrollable) */}
        <div className="overflow-y-auto flex-1 min-h-0 px-6 py-4">
          {activeTab === "spectrum" && <SpectrumTab />}
          {activeTab === "waterfall" && <WaterfallTab />}
          {activeTab === "passband" && <PassbandTab />}
          {activeTab === "slice" && <SliceTab />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default SdrSettingsModal;

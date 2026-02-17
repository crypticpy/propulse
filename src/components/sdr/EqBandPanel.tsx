/**
 * EqBandPanel — FabFilter-style floating control panel for editing EQ band
 * parameters on the SDR console's spectrum display.
 *
 * Appears when clicking/right-clicking an EQ band dot. Provides rotary knobs
 * for Freq / Q / Gain, filter type selection, slope selection, and band
 * management actions. Portal-rendered with viewport clamping.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EqBand, EqFilterType, EqSlope } from "@/lib/audio/eqTypes";
import {
  EQ_FILTER_TYPES,
  EQ_FILTER_LABELS,
  EQ_SLOPES,
  filterTypeUsesGain,
} from "@/lib/audio/eqTypes";
import { RotaryKnob } from "@/components/sdr/primitives/RotaryKnob";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface EqBandPanelProps {
  /** The EQ band being edited */
  band: EqBand;
  /** Screen X position of the dot (for panel anchoring) */
  anchorX: number;
  /** Screen Y position of the dot (for panel anchoring) */
  anchorY: number;
  /** Close the panel */
  onClose: () => void;
  /** Update frequency, Q, gain for the band */
  onUpdateBand: (id: string, freqHz: number, q: number, gainDb: number) => void;
  /** Change the filter type */
  onChangeType: (id: string, filterType: EqFilterType) => void;
  /** Change the slope */
  onChangeSlope: (id: string, slope: EqSlope) => void;
  /** Toggle enabled/disabled */
  onToggle: (id: string, enabled: boolean) => void;
  /** Remove the band */
  onRemove: (id: string) => void;
}

// ─── Layout constants ────────────────────────────────────────────────────────

const PANEL_WIDTH = 260;
const PANEL_HEIGHT_EST = 240;
const GAP = 16;

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatFreq(hz: number): string {
  if (hz >= 1000) {
    const kHz = hz / 1000;
    return kHz >= 10 ? `${kHz.toFixed(1)} kHz` : `${kHz.toFixed(2)} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

function formatQ(q: number): string {
  return q >= 10 ? q.toFixed(1) : q.toFixed(2);
}

function formatGain(db: number): string {
  const sign = db >= 0 ? "+" : "\u2212";
  return `${sign}${Math.abs(db).toFixed(1)} dB`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EqBandPanel({
  band,
  anchorX,
  anchorY,
  onClose,
  onUpdateBand,
  onChangeType,
  onChangeSlope,
  onToggle,
  onRemove,
}: EqBandPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>(
    () => {
      let left = anchorX - PANEL_WIDTH / 2;
      let top = anchorY + GAP;
      if (top + PANEL_HEIGHT_EST > window.innerHeight - 8) {
        top = anchorY - GAP - PANEL_HEIGHT_EST;
      }
      left = Math.max(8, Math.min(window.innerWidth - PANEL_WIDTH - 8, left));
      top = Math.max(8, top);
      return { left, top };
    },
  );

  // ─── Measure actual panel height and re-clamp ─────────────────────────────

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    let left = anchorX - PANEL_WIDTH / 2;
    let top = anchorY + GAP;

    if (top + rect.height > vh - 8) {
      top = anchorY - GAP - rect.height;
    }

    left = Math.max(8, Math.min(vw - PANEL_WIDTH - 8, left));
    top = Math.max(8, top);

    if (left !== position.left || top !== position.top) {
      setPosition({ left, top });
    }
    // Run once on mount to re-clamp with actual size
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Click-outside & Escape dismiss ───────────────────────────────────────

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // ─── Derived state ────────────────────────────────────────────────────────

  const isNotch = band.category === "notch";
  const accent = isNotch ? "#ff8c00" : "#00dcff";
  const gainEnabled = filterTypeUsesGain(band.filterType);

  // ─── Knob handlers ────────────────────────────────────────────────────────

  const handleFreqChange = useCallback(
    (freq: number) => onUpdateBand(band.id, freq, band.q, band.gainDb),
    [band.id, band.q, band.gainDb, onUpdateBand],
  );

  const handleQChange = useCallback(
    (q: number) => onUpdateBand(band.id, band.freqHz, q, band.gainDb),
    [band.id, band.freqHz, band.gainDb, onUpdateBand],
  );

  const handleGainChange = useCallback(
    (gain: number) => onUpdateBand(band.id, band.freqHz, band.q, gain),
    [band.id, band.freqHz, band.q, onUpdateBand],
  );

  // ─── Action handlers ──────────────────────────────────────────────────────

  const handleToggle = useCallback(
    () => onToggle(band.id, !band.enabled),
    [band.id, band.enabled, onToggle],
  );

  const handleRemove = useCallback(() => {
    onRemove(band.id);
    onClose();
  }, [band.id, onRemove, onClose]);

  // ─── Active button style helper ───────────────────────────────────────────

  const activeClasses = isNotch
    ? "bg-plasma-orange/20 border-plasma-orange/40 text-plasma-orange"
    : "bg-cosmic-cyan/20 border-cosmic-cyan/40 text-cosmic-cyan";

  const inactiveClasses =
    "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200";

  // ─── Render ───────────────────────────────────────────────────────────────

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="EQ band editor"
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        width: PANEL_WIDTH,
        zIndex: 9999,
      }}
      className="bg-gray-900/95 backdrop-blur-sm border border-white/10
        rounded-lg shadow-xl shadow-black/50 select-none"
    >
      {/* Filter type selector */}
      <div className="p-2.5">
        <div className="grid grid-cols-3 gap-1">
          {EQ_FILTER_TYPES.map((ft) => (
            <button
              key={ft}
              onClick={() => onChangeType(band.id, ft)}
              className={`px-1.5 py-1 text-[10px] font-medium rounded border transition-colors ${
                band.filterType === ft ? activeClasses : inactiveClasses
              }`}
            >
              {EQ_FILTER_LABELS[ft]}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10" />

      {/* Rotary knobs row */}
      <div className="flex items-center justify-around px-2.5 py-3">
        <RotaryKnob
          value={band.freqHz}
          min={20}
          max={20000}
          scale="log"
          onChange={handleFreqChange}
          label="Freq"
          formatValue={formatFreq}
          accentColor={accent}
          size={52}
        />
        <RotaryKnob
          value={band.q}
          min={0.1}
          max={50}
          scale="log"
          onChange={handleQChange}
          label="Q"
          formatValue={formatQ}
          accentColor={accent}
          size={52}
        />
        <RotaryKnob
          value={band.gainDb}
          min={-24}
          max={24}
          scale="linear"
          onChange={handleGainChange}
          label="Gain"
          formatValue={formatGain}
          accentColor={accent}
          size={52}
          disabled={!gainEnabled}
        />
      </div>

      <div className="border-t border-white/10" />

      {/* Slope selector */}
      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1">
          {EQ_SLOPES.map((s) => (
            <button
              key={s}
              onClick={() => onChangeSlope(band.id, s)}
              className={`px-2 py-1 text-[10px] font-medium rounded border transition-colors ${
                (band.slope ?? 12) === s ? activeClasses : inactiveClasses
              }`}
            >
              {s}
            </button>
          ))}
          <span className="ml-1 text-[10px] text-gray-500">dB/oct</span>
        </div>
      </div>

      <div className="border-t border-white/10" />

      {/* Action row */}
      <div className="flex gap-1.5 px-2.5 py-2">
        <button
          onClick={handleToggle}
          className={`flex-1 px-2 py-1.5 text-[11px] font-semibold rounded border transition-colors ${
            band.enabled
              ? "bg-signal-green/15 border-signal-green/30 text-signal-green hover:bg-signal-green/25"
              : "bg-white/5 border-white/10 text-gray-500 hover:bg-white/10 hover:text-gray-300"
          }`}
        >
          {band.enabled ? "Disable" : "Enable"}
        </button>
        <button
          onClick={handleRemove}
          className="flex-1 px-2 py-1.5 text-[11px] font-semibold rounded border transition-colors
            bg-alert-red/10 border-alert-red/25 text-alert-red/80
            hover:bg-alert-red/20 hover:text-alert-red"
        >
          Remove
        </button>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

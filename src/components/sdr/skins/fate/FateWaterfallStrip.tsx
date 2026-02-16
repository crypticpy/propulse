/**
 * FateWaterfallStrip -- Compact waterfall display for the Fate (F8) FT8/FT4 skin.
 *
 * A thin wrapper around the existing Waterfall component, constrained to 80px
 * height. Renders the audio-derived FFT waterfall with a subtle label overlay.
 * Designed to sit between the decode table and the bottom status bar.
 */

import { Waterfall } from "@/components/sdr/Waterfall";
import type {
  WaterfallPaletteName,
  WaterfallView,
  TuningOverlay,
} from "@/components/sdr/waterfallPalette";
import type { FftFrame, SdrFftDataProps } from "@/components/sdr/skins/types";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface FateWaterfallStripProps {
  frame: FftFrame | null;
  view: WaterfallView | null;
  palette: WaterfallPaletteName;
  tuning: TuningOverlay | null;
  minDb: number;
  maxDb: number;
  speed: number;
  overlays: SdrFftDataProps["waterfallOverlays"];
  onPickFrequencyHz: (hz: number) => void;
  onWheelTune: (direction: number) => void;
  interpolation: "nearest" | "linear";
  gamma: number;
  rowHeight: number;
}

// ─── Main component ──────────────────────────────────────────────────────────

export function FateWaterfallStrip({
  frame,
  view,
  palette,
  tuning,
  minDb,
  maxDb,
  speed,
  overlays,
  onPickFrequencyHz,
  onWheelTune,
  interpolation,
  gamma,
  rowHeight,
}: FateWaterfallStripProps) {
  return (
    <div className="relative h-[80px] border-t border-white/10 bg-black shrink-0">
      <Waterfall
        frame={frame}
        view={view}
        palette={palette}
        tuning={tuning}
        minDb={minDb}
        maxDb={maxDb}
        speed={speed}
        overlays={overlays}
        onPickFrequencyHz={onPickFrequencyHz}
        onWheelTune={onWheelTune}
        interpolation={interpolation}
        gamma={gamma}
        rowHeight={rowHeight}
        className="rounded-none border-0"
      />
      {/* Label overlay */}
      <span className="absolute top-1 left-2 text-[9px] text-white/30 uppercase tracking-wider pointer-events-none select-none">
        Audio Waterfall
      </span>
    </div>
  );
}

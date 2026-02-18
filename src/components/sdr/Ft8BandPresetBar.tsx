/**
 * Ft8BandPresetBar — Horizontal row of band pills for one-click FT8/FT4 tuning.
 *
 * Each pill shows a band (160m, 80m, etc). Clicking tunes the radio to that
 * band's FT8 or FT4 dial frequency. The current band is highlighted.
 */

import {
  getPresetsForMode,
  type Ft8BandPreset,
} from "@/lib/ft8/ft8BandPresets";

interface Ft8BandPresetBarProps {
  mode: "FT8" | "FT4";
  currentBand: string | null;
  onSelectPreset: (preset: Ft8BandPreset) => void;
}

export function Ft8BandPresetBar({
  mode,
  currentBand,
  onSelectPreset,
}: Ft8BandPresetBarProps) {
  const presets = getPresetsForMode(mode);

  return (
    <div className="flex flex-wrap gap-1 px-3 py-1.5">
      {presets.map((preset) => {
        const isActive = currentBand === preset.band;
        return (
          <button
            key={preset.label}
            onClick={() => onSelectPreset(preset)}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
              isActive
                ? "bg-signal-green/20 text-signal-green ring-1 ring-signal-green/40"
                : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
            }`}
            title={`${preset.label} — ${(preset.dialFreqHz / 1_000_000).toFixed(3)} MHz`}
          >
            {preset.band}
          </button>
        );
      })}
    </div>
  );
}

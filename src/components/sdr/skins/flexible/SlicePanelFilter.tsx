/**
 * SlicePanelFilter — Mode + filter width panel for the slice flag.
 *
 * SmartSDR-style grid of mode buttons and filter width presets.
 * Presets change based on the active mode category (SSB, CW, AM/FM, Digital).
 */

import { getModeTextClass, getModeBgClass } from "@/lib/sdr/modeColors";
import { dedupeModeTokens, normalizeModeDisplay } from "@/lib/sdr/modeTokens";

// ─── Filter presets by mode category ─────────────────────────────────────────

const SSB_PRESETS = [
  { label: "1.8K", low: 100, high: 1900 },
  { label: "2.1K", low: 100, high: 2200 },
  { label: "2.4K", low: 100, high: 2500 },
  { label: "2.7K", low: 100, high: 2800 },
  { label: "3.0K", low: 100, high: 3100 },
  { label: "3.3K", low: 50, high: 3350 },
  { label: "4.0K", low: 50, high: 4050 },
];

const CW_PRESETS = [
  { label: "100", low: 350, high: 450 },
  { label: "200", low: 300, high: 500 },
  { label: "400", low: 200, high: 600 },
  { label: "500", low: 150, high: 650 },
  { label: "800", low: 0, high: 800 },
  { label: "1K", low: 0, high: 1000 },
];

const AM_FM_PRESETS = [
  { label: "6K", low: 0, high: 6000 },
  { label: "8K", low: 0, high: 8000 },
  { label: "10K", low: 0, high: 10000 },
  { label: "12K", low: 0, high: 12000 },
];

const DIGI_PRESETS = [
  { label: "500", low: 200, high: 700 },
  { label: "1K", low: 200, high: 1200 },
  { label: "2K", low: 200, high: 2200 },
  { label: "3K", low: 0, high: 3000 },
  { label: "4K", low: 0, high: 4000 },
];

function getPresetsForMode(mode: string) {
  const m = normalizeModeDisplay(mode);
  if (m === "CW" || m === "CW-R") return CW_PRESETS;
  if (m === "AM" || m === "FM" || m === "NFM" || m === "WFM")
    return AM_FM_PRESETS;
  if (
    ["RTTY", "RTTY-R", "DIGI", "FT8", "FT4", "JS8", "PSK", "DIGU", "DIGL"].includes(
      m,
    )
  )
    return DIGI_PRESETS;
  return SSB_PRESETS;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface SlicePanelFilterProps {
  availableModes: string[];
  currentMode: string;
  filterLow: number;
  filterHigh: number;
  onModeChange: (mode: string) => void;
  onFilterChange: (low: number, high: number) => void;
  supportsMode: boolean;
  supportsFilter: boolean;
  canControl: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SlicePanelFilter({
  availableModes,
  currentMode,
  filterLow,
  filterHigh,
  onModeChange,
  onFilterChange,
  supportsMode,
  supportsFilter,
  canControl,
}: SlicePanelFilterProps) {
  const modeButtons = dedupeModeTokens(availableModes);
  const presets = getPresetsForMode(currentMode);
  const currentBw = filterHigh - filterLow;
  const normalizedCurrentMode = normalizeModeDisplay(currentMode);

  return (
    <div className="space-y-2">
      {/* Mode grid */}
      {supportsMode && modeButtons.length > 0 && (
        <div className="grid grid-cols-4 gap-1">
          {modeButtons.map((entry) => {
            const isActive = entry.display === normalizedCurrentMode;
            const colors = `${getModeBgClass(entry.display)} ${getModeTextClass(entry.display)}`;

            return (
              <button
                key={entry.display}
                type="button"
                onClick={() => onModeChange(entry.raw)}
                disabled={!canControl}
                className={`px-1 py-1 text-[10px] font-bold rounded border transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed ${
                    isActive
                      ? colors
                      : "bg-white/5 border-white/10 text-gray-500 hover:bg-white/10 hover:text-gray-300"
                  }`}
              >
                {entry.display}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter width presets */}
      {supportsFilter && (
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">
            Filter width
          </div>
          <div className="grid grid-cols-4 gap-1">
            {presets.map((preset) => {
              const presetBw = preset.high - preset.low;
              const isActive = Math.abs(currentBw - presetBw) < 100;

              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onFilterChange(preset.low, preset.high)}
                  disabled={!canControl}
                  className={`px-1 py-1 text-[10px] font-mono font-semibold rounded border transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed ${
                    isActive
                      ? "bg-cosmic-cyan/15 border-cosmic-cyan/30 text-cosmic-cyan"
                      : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Current filter readout */}
      <div className="flex items-center justify-between text-[9px] text-gray-500 font-mono">
        <span>
          {filterLow}&ndash;{filterHigh} Hz
        </span>
        <span>
          BW{" "}
          {currentBw >= 1000
            ? `${(currentBw / 1000).toFixed(1)}K`
            : `${currentBw} Hz`}
        </span>
      </div>
    </div>
  );
}

/**
 * SlicePanelFilter — Mode + filter width panel for the slice flag.
 *
 * SmartSDR-style grid of mode buttons and filter width presets.
 * Presets change based on the active mode category (SSB, CW, AM/FM, Digital).
 */

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
  const m = mode.toUpperCase();
  if (m === "CW" || m === "CWR") return CW_PRESETS;
  if (m === "AM" || m === "FM" || m === "NFM" || m === "WFM")
    return AM_FM_PRESETS;
  if (["RTTY", "DIGI", "FT8", "FT4", "JS8", "PSK", "DIGU", "DIGL"].includes(m))
    return DIGI_PRESETS;
  return SSB_PRESETS;
}

// ─── Mode color mapping ──────────────────────────────────────────────────────

const MODE_PILL_COLORS: Record<string, string> = {
  USB: "bg-signal-green/15 border-signal-green/30 text-signal-green",
  LSB: "bg-signal-green/15 border-signal-green/30 text-signal-green",
  CW: "bg-cosmic-cyan/15 border-cosmic-cyan/30 text-cosmic-cyan",
  CWR: "bg-cosmic-cyan/15 border-cosmic-cyan/30 text-cosmic-cyan",
  AM: "bg-caution-amber/15 border-caution-amber/30 text-caution-amber",
  FM: "bg-caution-amber/15 border-caution-amber/30 text-caution-amber",
  RTTY: "bg-purple-400/15 border-purple-400/30 text-purple-400",
  DIGI: "bg-purple-400/15 border-purple-400/30 text-purple-400",
  DIGU: "bg-purple-400/15 border-purple-400/30 text-purple-400",
  DIGL: "bg-purple-400/15 border-purple-400/30 text-purple-400",
  FT8: "bg-purple-400/15 border-purple-400/30 text-purple-400",
  FT4: "bg-purple-400/15 border-purple-400/30 text-purple-400",
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface SlicePanelFilterProps {
  availableModes: string[];
  currentMode: string;
  filterLow: number;
  filterHigh: number;
  onModeChange: (mode: string) => void;
  onFilterChange: (low: number, high: number) => void;
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
  canControl,
}: SlicePanelFilterProps) {
  const presets = getPresetsForMode(currentMode);
  const currentBw = filterHigh - filterLow;

  return (
    <div className="space-y-2">
      {/* Mode grid */}
      {availableModes.length > 0 && (
        <div className="grid grid-cols-4 gap-1">
          {availableModes.map((m) => {
            const isActive = m.toUpperCase() === currentMode.toUpperCase();
            const colors =
              MODE_PILL_COLORS[m.toUpperCase()] ??
              "bg-white/5 border-white/10 text-gray-400";

            return (
              <button
                key={m}
                type="button"
                onClick={() => onModeChange(m)}
                disabled={!canControl}
                className={`px-1 py-1 text-[10px] font-bold rounded border transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed ${
                    isActive
                      ? colors
                      : "bg-white/5 border-white/10 text-gray-500 hover:bg-white/10 hover:text-gray-300"
                  }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter width presets */}
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

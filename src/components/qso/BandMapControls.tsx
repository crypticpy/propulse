/**
 * BandMapControls — Control strip for the Band Map widget.
 *
 * Band selector pills, time range selector, and source badge
 * in a compact single-row layout.
 */

import { BAND_ORDER } from "@/lib/data/bandRanges";

// ── Types ───────────────────────────────────────────────────────────────────

export type ContestFilterMode = "all" | "hide_contest" | "contest_only";

export interface BandMapControlsProps {
  /** Currently selected band */
  band: string;
  /** Callback when band changes */
  onBandChange: (band: string) => void;
  /** Current time range in minutes */
  timeRange: number;
  /** Callback when time range changes */
  onTimeRangeChange: (minutes: number) => void;
  /** Active data source */
  source: "bridge" | "supabase" | "none";
  /** Current contest filter mode */
  contestFilter: ContestFilterMode;
  /** Callback when contest filter changes */
  onContestFilterChange: (filter: ContestFilterMode) => void;
  /** Whether contest sub-band markers are shown */
  showSubBands: boolean;
  /** Callback when sub-band toggle changes */
  onShowSubBandsChange: (show: boolean) => void;
}

// ── Time Range Options ──────────────────────────────────────────────────────

const TIME_RANGES = [
  { value: 5, label: "5m" },
  { value: 15, label: "15m" },
  { value: 30, label: "30m" },
  { value: 60, label: "1hr" },
] as const;

// ── Source Badge Colors ─────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<
  "bridge" | "supabase" | "none",
  { color: string; label: string }
> = {
  bridge: { color: "bg-signal-green", label: "Bridge" },
  supabase: { color: "bg-plasma-orange", label: "Cloud" },
  none: { color: "bg-gray-500", label: "No Source" },
};

// ── Compact HF bands for pills ──────────────────────────────────────────────

const HF_BANDS = BAND_ORDER.filter((b) => b !== "60m"); // Skip 60m (channelized)

// ── Component ───────────────────────────────────────────────────────────────

// ── Contest Filter Options ────────────────────────────────────────────────────

const CONTEST_FILTERS: { value: ContestFilterMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hide_contest", label: "No Contest" },
  { value: "contest_only", label: "Contest" },
];

// ── Component ───────────────────────────────────────────────────────────────

export function BandMapControls({
  band,
  onBandChange,
  timeRange,
  onTimeRangeChange,
  source,
  contestFilter,
  onContestFilterChange,
  showSubBands,
  onShowSubBandsChange,
}: BandMapControlsProps) {
  const sourceConfig = SOURCE_CONFIG[source];

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Band pills */}
      <div className="flex items-center gap-0.5 flex-wrap">
        {HF_BANDS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onBandChange(b)}
            className={`
              px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-all duration-150
              ${
                band === b
                  ? "bg-plasma-orange text-white shadow-sm shadow-plasma-orange/20"
                  : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
              }
            `}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Contest filter pills */}
      <div className="flex items-center gap-0.5 border-l border-white/10 pl-2">
        {CONTEST_FILTERS.map((cf) => (
          <button
            key={cf.value}
            type="button"
            onClick={() => onContestFilterChange(cf.value)}
            className={`
              px-1.5 py-0.5 rounded text-[10px] font-mono transition-all duration-150
              ${
                contestFilter === cf.value
                  ? "bg-caution-amber/20 text-caution-amber"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }
            `}
          >
            {cf.label}
          </button>
        ))}

        {/* Sub-bands toggle */}
        <button
          type="button"
          onClick={() => onShowSubBandsChange(!showSubBands)}
          title="Toggle contest sub-band markers"
          className={`
            px-1.5 py-0.5 rounded text-[10px] font-mono transition-all duration-150 ml-0.5
            ${
              showSubBands
                ? "bg-nebula-blue/20 text-nebula-blue"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            }
          `}
        >
          Bands
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-2" />

      {/* Time range selector */}
      <div className="flex items-center gap-0.5">
        {TIME_RANGES.map((tr) => (
          <button
            key={tr.value}
            type="button"
            onClick={() => onTimeRangeChange(tr.value)}
            className={`
              px-1.5 py-0.5 rounded text-[10px] font-mono transition-all duration-150
              ${
                timeRange === tr.value
                  ? "bg-white/15 text-white"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }
            `}
          >
            {tr.label}
          </button>
        ))}
      </div>

      {/* Source badge */}
      <div className="flex items-center gap-1 text-[10px] text-gray-400 font-mono shrink-0">
        <span
          className={`w-1.5 h-1.5 rounded-full ${sourceConfig.color} ${
            source === "bridge" ? "animate-pulse" : ""
          }`}
        />
        {sourceConfig.label}
      </div>
    </div>
  );
}

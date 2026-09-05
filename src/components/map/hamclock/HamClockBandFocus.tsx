import { HAMCLOCK_FOCUS_BANDS } from "@/stores/hamclockStore";
import { getBandColor } from "@/lib/utils/spotColors";

interface HamClockBandFocusProps {
  selected: string[];
  onToggle: (band: string) => void;
  onClear: () => void;
}

/** Multi-select HF/VHF band chips that drive map + list filtering. */
export function HamClockBandFocus({
  selected,
  onToggle,
  onClear,
}: HamClockBandFocusProps) {
  const selectedSet = new Set(selected);

  return (
    <div className="border-b border-white/10 px-2 py-2 shrink-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500">
          Band focus
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="font-mono text-[9px] text-gray-500 hover:text-white"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {HAMCLOCK_FOCUS_BANDS.map((band) => {
          const active = selectedSet.has(band);
          const color = getBandColor(band);
          return (
            <button
              key={band}
              type="button"
              aria-pressed={active}
              aria-label={band}
              onClick={() => onToggle(band)}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-plasma-orange ${
                active
                  ? "text-void-black"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
              style={
                active
                  ? { backgroundColor: color, color: "#0a0a0a" }
                  : undefined
              }
            >
              {band.replace("m", "")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

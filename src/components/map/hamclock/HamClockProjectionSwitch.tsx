import type { ViewMode } from "@/stores/mapStore";

const PROJECTIONS: Array<{ mode: ViewMode; label: string; shortLabel: string }> = [
  { mode: "flat", label: "Flat map", shortLabel: "Flat" },
  { mode: "azimuthal", label: "Azimuthal map", shortLabel: "AZ" },
  { mode: "globe", label: "3D globe", shortLabel: "3D" },
];

interface HamClockProjectionSwitchProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}
/** Compact projection selector sized for HamClock's 36px instrument header. */
export function HamClockProjectionSwitch({
  value,
  onChange,
}: HamClockProjectionSwitchProps) {
  return (
    <div
      className="flex items-center rounded border border-white/10 bg-black/40 p-0.5"
      role="group"
      aria-label="Map projection"
    >
      {PROJECTIONS.map(({ mode, label, shortLabel }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className={`min-h-6 min-w-6 rounded px-1.5 font-mono text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-plasma-orange ${
              active
                ? "bg-plasma-orange text-void-black"
                : "hc-dim-text hover:bg-white/10 hover:text-[var(--hc-fg)]"
            }`}
          >
            {shortLabel}
          </button>
        );
      })}
    </div>
  );
}

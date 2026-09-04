import type { HamClockMode } from "@/stores/hamclockStore";

const MODES: Array<{ mode: HamClockMode; label: string; shortLabel: string }> =
  [
    { mode: "traffic", label: "DX traffic", shortLabel: "Traffic" },
    { mode: "bands", label: "Band monitoring", shortLabel: "Bands" },
    { mode: "satellites", label: "Satellite theater", shortLabel: "Sats" },
    { mode: "weather", label: "Weather & alerts", shortLabel: "Wx" },
  ];

interface HamClockModeSwitchProps {
  value: HamClockMode;
  onChange: (mode: HamClockMode) => void;
}

/** Compact HamClock product-mode selector for the instrument header. */
export function HamClockModeSwitch({
  value,
  onChange,
}: HamClockModeSwitchProps) {
  return (
    <div
      className="flex items-center rounded border border-white/10 bg-black/40 p-0.5"
      role="group"
      aria-label="HamClock mode"
    >
      {MODES.map(({ mode, label, shortLabel }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className={`min-h-6 rounded px-1.5 font-mono text-[9px] font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-plasma-orange ${
              active
                ? "bg-signal-green text-void-black"
                : "text-gray-500 hover:bg-white/10 hover:text-white"
            }`}
          >
            {shortLabel}
          </button>
        );
      })}
    </div>
  );
}

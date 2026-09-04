import { useMapStore } from "@/stores/mapStore";

const CHIPS: Array<{
  key: "muf" | "aurora" | "drap" | "weather";
  label: string;
  title: string;
}> = [
  { key: "muf", label: "MUF", title: "Maximum usable frequency overlay" },
  { key: "aurora", label: "Aurora", title: "Auroral oval overlay" },
  { key: "drap", label: "DRAP", title: "D-region absorption overlay" },
  { key: "weather", label: "Wx", title: "NOAA weather alerts" },
];

/** One-tap solar/weather layer chips for the HamClock header. */
export function HamClockLayerChips() {
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);

  return (
    <div
      className="hidden lg:flex items-center gap-0.5"
      role="group"
      aria-label="Quick map layers"
    >
      {CHIPS.map(({ key, label, title }) => {
        const active = layers[key];
        return (
          <button
            key={key}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={active}
            onClick={() => toggleLayer(key)}
            className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-plasma-orange ${
              active
                ? "bg-plasma-orange/90 text-void-black"
                : "bg-white/5 text-gray-500 hover:bg-white/10 hover:text-white"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

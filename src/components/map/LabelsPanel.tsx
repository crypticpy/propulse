import { useMapStore } from "@/stores/mapStore";
import type { LabelOptions } from "@/stores/mapStore";

const LABEL_OPTIONS: { key: keyof LabelOptions; label: string }[] = [
  { key: "borders", label: "Country Borders" },
  { key: "countryNames", label: "Country Names" },
  { key: "cities", label: "Cities" },
  { key: "maidenheadGrid", label: "Maidenhead Grid" },
];

export function LabelsPanel({ className = "" }: { className?: string }) {
  const labelOptions = useMapStore((s) => s.labelOptions);
  const setLabelOption = useMapStore((s) => s.setLabelOption);

  return (
    <div
      className={`w-48 rounded-lg bg-deep-space/95 backdrop-blur-sm
                   border border-white/10 shadow-xl overflow-hidden ${className}`}
    >
      <div className="flex items-center px-3 py-2 border-b border-white/8">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          Labels
        </span>
      </div>
      <div className="p-1.5 space-y-0.5">
        {LABEL_OPTIONS.map(({ key, label }) => (
          <label
            key={key}
            className="flex items-center gap-2 px-2 py-1.5 rounded
                       hover:bg-white/5 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={labelOptions[key]}
              onChange={() => setLabelOption(key, !labelOptions[key])}
              className="sr-only"
            />
            <div
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center
                         transition-colors shrink-0 ${
                           labelOptions[key]
                             ? "bg-blue-500/80 border-blue-400"
                             : "border-white/20 bg-white/5"
                         }`}
            >
              {labelOptions[key] && (
                <svg
                  viewBox="0 0 12 12"
                  className="w-2.5 h-2.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M2 6l3 3 5-5" />
                </svg>
              )}
            </div>
            <span className="text-[11px] text-gray-300 select-none">
              {label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

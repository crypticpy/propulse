import { useState, useRef, useEffect, useCallback } from "react";
import { useMapStore } from "@/stores/mapStore";
import type { LabelOptions } from "@/stores/mapStore";

const LABEL_OPTIONS: { key: keyof LabelOptions; label: string }[] = [
  { key: "borders", label: "Country Borders" },
  { key: "stateBorders", label: "US State Borders" },
  { key: "countryNames", label: "Country Names" },
  { key: "cities", label: "Cities" },
  { key: "maidenheadGrid", label: "Maidenhead Grid" },
  { key: "wasOverlay", label: "WAS Progress (flat)" },
];

const COLLAPSE_DELAY_MS = 2000;

export function LabelsPanel({ className = "" }: { className?: string }) {
  const labelOptions = useMapStore((s) => s.labelOptions);
  const setLabelOption = useMapStore((s) => s.setLabelOption);
  const [expanded, setExpanded] = useState(true);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const startCollapseTimer = useCallback(() => {
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(() => {
      setExpanded(false);
      collapseTimerRef.current = null;
    }, COLLAPSE_DELAY_MS);
  }, [clearCollapseTimer]);

  // Auto-collapse after initial mount
  useEffect(() => {
    startCollapseTimer();
    return clearCollapseTimer;
  }, [startCollapseTimer, clearCollapseTimer]);

  const handleMouseEnter = useCallback(() => {
    clearCollapseTimer();
    setExpanded(true);
  }, [clearCollapseTimer]);

  const handleMouseLeave = useCallback(() => {
    startCollapseTimer();
  }, [startCollapseTimer]);

  return (
    <div
      className={`w-48 rounded-lg bg-deep-space/95 backdrop-blur-sm
                   border border-white/10 shadow-xl overflow-hidden ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header — always visible, acts as collapsed hover target */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
          Labels
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`w-3 h-3 text-gray-500 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Collapsible checkbox content */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          expanded ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-white/8 p-1.5 space-y-0.5">
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
    </div>
  );
}

/**
 * AspectRatioSlider — floating map aspect ratio control
 *
 * Small bottom-right overlay that lets users adjust the flat map's
 * display aspect ratio to correct vertical squishing on their screen.
 */

import { useCallback } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIInteractionPrefs } from "@/stores/userStore";

interface AspectRatioSliderProps {
  /** Override default positioning. When omitted, uses absolute bottom-3 right-3 z-30. */
  className?: string;
}

export function AspectRatioSlider({ className }: AspectRatioSliderProps = {}) {
  const uiPrefs = useUIInteractionPrefs();
  const mapAspectRatio = uiPrefs.mapAspectRatio ?? 2.0;
  const updateUIInteraction = useSettingsStore((s) => s.updateUIInteraction);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateUIInteraction({ mapAspectRatio: parseFloat(e.target.value) });
    },
    [updateUIInteraction],
  );

  return (
    <div
      className={
        className ??
        "absolute bottom-3 right-3 z-30 flex flex-col items-center gap-1 bg-void-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-2 py-2"
      }
    >
      {/* Ratio icon */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        className="text-white/50"
      >
        <rect x="1" y="3" width="12" height="8" rx="1" />
        <path d="M4 7h6M4 7l1.5-1.5M4 7l1.5 1.5M10 7l-1.5-1.5M10 7l-1.5 1.5" />
      </svg>

      {/* Vertical slider */}
      <input
        type="range"
        min="1.5"
        max="2.5"
        step="0.05"
        value={mapAspectRatio}
        onChange={handleChange}
        className="aspect-ratio-slider"
        aria-label="Map aspect ratio"
        style={{
          writingMode: "vertical-lr",
          direction: "rtl",
          width: "16px",
          height: "80px",
        }}
      />

      {/* Value label */}
      <span className="text-[9px] font-mono text-white/40 leading-none">
        {mapAspectRatio.toFixed(1)}
      </span>

      {/* Inline slider styles */}
      <style>{`
        .aspect-ratio-slider {
          -webkit-appearance: none;
          appearance: none;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          outline: none;
        }
        .aspect-ratio-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #d1d5db;
          cursor: pointer;
          border: none;
        }
        .aspect-ratio-slider::-webkit-slider-thumb:active {
          background: #ffffff;
        }
        .aspect-ratio-slider::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #d1d5db;
          cursor: pointer;
          border: none;
        }
        .aspect-ratio-slider::-moz-range-thumb:active {
          background: #ffffff;
        }
        .aspect-ratio-slider::-moz-range-track {
          width: 3px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          border: none;
        }
      `}</style>
    </div>
  );
}

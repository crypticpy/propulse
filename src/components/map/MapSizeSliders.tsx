/**
 * MapSizeSliders Component
 *
 * Compact floating panel for adjusting spot dot and map pin sizes
 * on all map views (Globe, FlatMap, Azimuthal).
 *
 * Reads/writes spotDotScale and mapPinScale via the settings store.
 * Starts collapsed as a small icon button; expands to show two sliders.
 */

import { useState, useCallback } from "react";
import { useUIInteractionPrefs } from "@/stores/userStore";
import { useSettingsStore } from "@/stores/settingsStore";

export function MapSizeSliders() {
  const [expanded, setExpanded] = useState(false);

  const prefs = useUIInteractionPrefs();
  const spotDotScale = prefs.spotDotScale ?? 1.0;
  const mapPinScale = prefs.mapPinScale ?? 1.0;

  const updateUIInteraction = useSettingsStore((s) => s.updateUIInteraction);

  const handleSpotChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateUIInteraction({ spotDotScale: parseFloat(e.target.value) });
    },
    [updateUIInteraction],
  );

  const handlePinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateUIInteraction({ mapPinScale: parseFloat(e.target.value) });
    },
    [updateUIInteraction],
  );

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="absolute bottom-3 left-3 z-10 w-7 h-7 flex items-center justify-center rounded-md bg-void-black/70 backdrop-blur-sm border border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20 transition-colors"
        title="Adjust spot & pin sizes"
        aria-label="Adjust spot and pin sizes"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          {/* Scaling/resize icon: two concentric circles with arrows */}
          <circle cx="7" cy="7" r="2.5" />
          <circle cx="7" cy="7" r="5.5" opacity="0.5" />
          <line x1="7" y1="0.5" x2="7" y2="2" />
          <line x1="7" y1="12" x2="7" y2="13.5" />
          <line x1="0.5" y1="7" x2="2" y2="7" />
          <line x1="12" y1="7" x2="13.5" y2="7" />
        </svg>
      </button>
    );
  }

  return (
    <div className="absolute bottom-3 left-3 z-10 bg-void-black/70 backdrop-blur-sm border border-white/10 rounded-lg px-2.5 py-2 select-none">
      {/* Header with close button */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">
          Size
        </span>
        <button
          onClick={() => setExpanded(false)}
          className="text-gray-500 hover:text-gray-300 transition-colors -mr-0.5"
          aria-label="Collapse size sliders"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <line x1="2" y1="2" x2="8" y2="8" />
            <line x1="8" y1="2" x2="2" y2="8" />
          </svg>
        </button>
      </div>

      {/* Spots slider */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium w-8 shrink-0">
          Spots
        </span>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={spotDotScale}
          onChange={handleSpotChange}
          className="map-size-slider flex-1"
          aria-label="Spot dot size scale"
        />
        <span className="text-[10px] font-mono text-gray-300 w-7 text-right shrink-0">
          {spotDotScale.toFixed(1)}&times;
        </span>
      </div>

      {/* Pins slider */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium w-8 shrink-0">
          Pins
        </span>
        <input
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={mapPinScale}
          onChange={handlePinChange}
          className="map-size-slider flex-1"
          aria-label="Map pin size scale"
        />
        <span className="text-[10px] font-mono text-gray-300 w-7 text-right shrink-0">
          {mapPinScale.toFixed(1)}&times;
        </span>
      </div>

      {/* Inline styles for the range slider */}
      <style>{`
        .map-size-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          outline: none;
          width: 80px;
        }
        .map-size-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #d1d5db;
          cursor: pointer;
          border: none;
          transition: background 0.15s;
        }
        .map-size-slider::-webkit-slider-thumb:active {
          background: #ffffff;
        }
        .map-size-slider::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #d1d5db;
          cursor: pointer;
          border: none;
          transition: background 0.15s;
        }
        .map-size-slider::-moz-range-thumb:active {
          background: #ffffff;
        }
        .map-size-slider::-moz-range-track {
          height: 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          border: none;
        }
      `}</style>
    </div>
  );
}

/**
 * MapSizeSliders Component
 *
 * Compact overlay panel for adjusting spot dot and map pin sizes
 * on all map views (Globe, FlatMap, Azimuthal).
 *
 * Reads/writes spotDotScale and mapPinScale via the settings store.
 * Starts collapsed as a small icon button; expands to show two sliders.
 *
 * Positioning belongs to the caller: each map view renders this inside the
 * one column it owns in its bottom-left corner, so the control cannot end up
 * anchored on top of chrome it does not know about (#930).
 */

import { useCallback } from "react";
import { useUIInteractionPrefs } from "@/stores/userStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useMapStore } from "@/stores/mapStore";
import { useMapChromeUiStore } from "@/stores/mapChromeUiStore";
import { MAP_PAGE_CHROME_Z } from "@/lib/map/globeRenderOrder";

export function MapSizeSliders() {
  const isFullscreen = useMapStore((s) => s.isFullscreen);
  // Session state, not component state: this control renders inside the map
  // view's corner column, and switching projection unmounts the view (#930).
  const expanded = useMapChromeUiStore((s) => s.sizePanelExpanded);
  const setExpanded = useMapChromeUiStore((s) => s.setSizePanelExpanded);

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

  // Hidden in fullscreen — size controls are in the ProToolbarRibbon
  if (isFullscreen) return null;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        // Operable chrome: must clear the map's overlay portal wherever the
        // corner column places it (#930).
        style={{ zIndex: MAP_PAGE_CHROME_Z.interactiveChrome }}
        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-su-line/40 bg-void-black/70 text-su-muted backdrop-blur-sm transition-colors hover:border-su-line/50 hover:text-su-text"
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
    <div
      style={{ zIndex: MAP_PAGE_CHROME_Z.interactiveChrome }}
      className="pointer-events-auto select-none rounded-lg border border-su-line/40 bg-void-black/70 px-2.5 py-2 backdrop-blur-sm"
    >
      {/* Header with close button */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs uppercase tracking-wider text-su-muted font-medium">
          Size
        </span>
        <button
          onClick={() => setExpanded(false)}
          className="text-su-muted hover:text-su-text transition-colors -mr-0.5"
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
        <span className="text-xs uppercase tracking-wider text-su-muted font-medium w-8 shrink-0">
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
        <span className="text-xs font-mono text-su-muted w-7 text-right shrink-0">
          {spotDotScale.toFixed(1)}&times;
        </span>
      </div>

      {/* Pins slider */}
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-su-muted font-medium w-8 shrink-0">
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
        <span className="text-xs font-mono text-su-muted w-7 text-right shrink-0">
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

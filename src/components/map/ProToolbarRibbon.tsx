/**
 * ProToolbarRibbon
 *
 * Unified collapsible toolbar ribbon for Pro mode fullscreen view.
 * Replaces the separate glass panel "bubbles" in the top bar with a single
 * horizontal ribbon bar that can collapse to a compact pill.
 */

import { useState, useEffect, useCallback } from "react";
import { useMapStore, LAYER_PRESETS, type PresetName } from "@/stores/mapStore";
import { useUserStore } from "@/stores/userStore";
import {
  useUIInteractionPrefs,
  useSettingsStore,
} from "@/stores/settingsStore";
import { useLiveSpots } from "@/hooks/useLiveSpots";
import { PRESET_CONFIG } from "@/constants/mapPresets";
import { TimeControl } from "@/components/map/TimeControl";
import { LayersPopover } from "@/components/map/LayersPopover";
import { WatchPopover } from "@/components/map/WatchPopover";
import { RegionPresetSelector } from "@/components/map/RegionPresetSelector";

/* ─── Props ──────────────────────────────────────────────────── */

interface ProToolbarRibbonProps {
  ambientMode: boolean;
  showTopBar: boolean;
  observatoryMode: boolean;
  onToggleAmbient: () => void;
  onExit: () => void;
  onResetLayout: () => void;
  onOpenPresetManager: () => void;
}

/* ─── Divider helper ─────────────────────────────────────────── */

function Divider() {
  return <div className="w-px h-6 bg-white/15 flex-shrink-0" />;
}

/* ─── Component ──────────────────────────────────────────────── */

export function ProToolbarRibbon({
  ambientMode,
  showTopBar,
  observatoryMode,
  onToggleAmbient,
  onExit,
  onResetLayout,
  onOpenPresetManager,
}: ProToolbarRibbonProps) {
  /* ── Store selectors ─────────────────────────────────────── */
  const proRibbonExpanded = useMapStore((s) => s.proRibbonExpanded);
  const toggleProRibbon = useMapStore((s) => s.toggleProRibbon);
  const viewMode = useMapStore((s) => s.viewMode);
  const setViewMode = useMapStore((s) => s.setViewMode);
  const activePreset = useMapStore((s) => s.activePreset);
  const applyPreset = useMapStore((s) => s.applyPreset);
  const enterObservatory = useMapStore((s) => s.enterObservatory);

  const { station } = useUserStore();

  const prefs = useUIInteractionPrefs();
  const spotDotScale = prefs.spotDotScale ?? 1.0;
  const mapPinScale = prefs.mapPinScale ?? 1.0;
  const updateUIInteraction = useSettingsStore((s) => s.updateUIInteraction);

  /* ── Live spots ──────────────────────────────────────────── */
  const { spots } = useLiveSpots({ grid: station?.grid, enabled: true });

  /* ── Collapsed UTC clock (only ticks when collapsed) ─────── */
  const [utcString, setUtcString] = useState(() =>
    new Date().toLocaleTimeString("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  );

  useEffect(() => {
    if (proRibbonExpanded) return; // only tick when collapsed to show time
    const id = setInterval(() => {
      setUtcString(
        new Date().toLocaleTimeString("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [proRibbonExpanded]);

  /* ── Slider handlers ─────────────────────────────────────── */
  const handleSpotDotScale = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateUIInteraction({ spotDotScale: parseFloat(e.target.value) });
    },
    [updateUIInteraction],
  );

  const handleMapPinScale = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateUIInteraction({ mapPinScale: parseFloat(e.target.value) });
    },
    [updateUIInteraction],
  );

  /* ── Ambient-mode opacity wrapper ────────────────────────── */
  const ambientOpacity =
    ambientMode && !showTopBar
      ? "opacity-0 pointer-events-none"
      : "opacity-100";

  /* ════════════════════════════════════════════════════════════
   *  COLLAPSED PILL
   * ════════════════════════════════════════════════════════════ */
  if (!proRibbonExpanded) {
    return (
      <div
        className={`fixed top-3 left-3 z-[211] transition-opacity duration-300 ${ambientOpacity}`}
      >
        <button
          type="button"
          onClick={toggleProRibbon}
          className="bg-black/60 backdrop-blur-md border border-white/20 rounded-lg px-3 py-2 pointer-events-auto flex items-center gap-2 text-xs text-gray-300 hover:text-white transition-colors"
        >
          {/* Hamburger / menu icon */}
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          <span className="font-mono text-xs text-gray-400">
            {utcString} UTC
          </span>
          <span className="text-white/30">·</span>
          <span className="text-cyan-400 text-xs">{spots.length} spots</span>
        </button>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
   *  EXPANDED RIBBON
   * ════════════════════════════════════════════════════════════ */

  const sliderClass =
    "w-14 h-1 bg-white/10 rounded appearance-none cursor-pointer " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 " +
    "[&::-webkit-slider-thumb]:bg-gray-300 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer";

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[210] pointer-events-none transition-opacity duration-300 ${ambientOpacity}`}
    >
      <div className="bg-black/60 backdrop-blur-md border-b border-white/20 flex items-center gap-2 px-3 py-2 pointer-events-auto">
        {/* ── 1. Toggle (collapse) button ─────────────────────── */}
        <button
          type="button"
          onClick={toggleProRibbon}
          className="p-1 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-white flex-shrink-0"
          title="Collapse toolbar"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <Divider />

        {/* ── 2. Station info ─────────────────────────────────── */}
        {station && (
          <>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-signal-green animate-pulse" />
              <span className="font-mono font-bold text-sm text-white">
                {station.callsign}
              </span>
              <span className="text-[10px] text-gray-500">{station.grid}</span>
              <span className="text-white/20">|</span>
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs text-cyan-400">
                {spots.length} spots
              </span>
            </div>
            <Divider />
          </>
        )}

        {/* ── 3. View mode buttons ────────────────────────────── */}
        <div className="flex gap-1 flex-shrink-0">
          {(["globe", "flat", "azimuthal"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-2 py-1 rounded text-xs font-medium transition-all capitalize ${
                viewMode === mode
                  ? "bg-plasma-orange text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {mode === "azimuthal" ? "Azim" : mode}
            </button>
          ))}
        </div>

        <Divider />

        {/* ── 4. Time control ─────────────────────────────────── */}
        <div className="w-40 flex-shrink-0">
          <TimeControl className="[&>*:first-child]:hidden [&>*:nth-child(2)]:hidden [&>*:last-child]:hidden" />
        </div>

        <Divider />

        {/* ── 5. Layers + Watch popovers ──────────────────────── */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <LayersPopover />
          <WatchPopover />
        </div>

        <Divider />

        {/* ── 6. Layer presets ────────────────────────────────── */}
        <div className="flex gap-1 flex-shrink-0">
          {(Object.keys(LAYER_PRESETS) as PresetName[]).map((preset) => {
            const cfg = PRESET_CONFIG[preset];
            const isActive = activePreset === preset;
            const activeStyles: Record<PresetName, string> = {
              "dx-hunter":
                "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/40",
              contest:
                "bg-caution-amber/20 text-caution-amber border-caution-amber/40",
              vhf: "bg-cosmic-cyan/20 text-cosmic-cyan border-cosmic-cyan/40",
              emergency: "bg-alert-red/20 text-alert-red border-alert-red/40",
            };
            return (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                title={`${cfg.description}\n${cfg.layerSummary}`}
                className={`px-2 py-1 text-[10px] rounded border transition-all flex items-center gap-1 ${
                  isActive
                    ? activeStyles[preset]
                    : "text-gray-400 hover:text-white hover:bg-white/10 border-transparent"
                }`}
              >
                <svg
                  className="w-3 h-3 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={cfg.iconPath} />
                </svg>
                {cfg.label}
              </button>
            );
          })}
        </div>

        <Divider />

        {/* ── 7. Region presets ───────────────────────────────── */}
        <div className="flex-shrink-0">
          <RegionPresetSelector onOpenManager={onOpenPresetManager} />
        </div>

        <Divider />

        {/* ── 8. Spot / Pin size sliders ─────────────────────── */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Spot size */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-gray-500 uppercase">Spots</span>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={spotDotScale}
              onChange={handleSpotDotScale}
              className={sliderClass}
            />
            <span className="text-[9px] font-mono text-gray-400">
              {spotDotScale.toFixed(1)}&times;
            </span>
          </div>
          {/* Pin size */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-gray-500 uppercase">Pins</span>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={mapPinScale}
              onChange={handleMapPinScale}
              className={sliderClass}
            />
            <span className="text-[9px] font-mono text-gray-400">
              {mapPinScale.toFixed(1)}&times;
            </span>
          </div>
        </div>

        <Divider />

        {/* ── 9. Observatory button ──────────────────────────── */}
        <button
          type="button"
          onClick={enterObservatory}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          title="Observatory Mode — fullscreen auto-rotating globe, zoom only"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
          Observatory
        </button>

        {/* ── 10. Spacer ─────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── 11. Reset layout button ────────────────────────── */}
        <button
          type="button"
          onClick={onResetLayout}
          className="px-2 py-1.5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white text-[10px] flex items-center gap-1 rounded flex-shrink-0"
          title="Reset panel positions"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Reset
        </button>

        <Divider />

        {/* ── 12. Ambient mode toggle ────────────────────────── */}
        {!observatoryMode && (
          <button
            type="button"
            onClick={onToggleAmbient}
            title={ambientMode ? "Show panels" : "Ambient mode"}
            className={`p-2 rounded transition-colors flex-shrink-0 ${
              ambientMode
                ? "bg-white/15 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {ambientMode ? (
                <>
                  {/* Eye open — show panels */}
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              ) : (
                <>
                  {/* Eye with slash — ambient / hide panels */}
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                  <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              )}
            </svg>
          </button>
        )}

        {/* ── 13. ESC hint + Exit button ─────────────────────── */}
        <div className="text-[10px] text-gray-600 pointer-events-none select-none whitespace-nowrap">
          <kbd className="px-1 py-0.5 bg-white/10 rounded text-gray-500">
            ESC
          </kbd>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="p-2 hover:bg-white/10 transition-colors text-gray-400 hover:text-white rounded flex-shrink-0"
          aria-label="Exit fullscreen"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

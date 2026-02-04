/**
 * DXConsole Component
 *
 * A comprehensive DX Operations Console that displays real-time DX cluster
 * spots with solar indices and a collapsible interface.
 */

import { useEffect, useState, useMemo } from "react";
import { DXSpotList } from "./DXSpotList";
import { BandMap } from "./BandMap";
import { InsightsBar } from "./InsightsBar";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useDXStore, selectAvailableBands } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useDXCluster } from "@/hooks/useDXCluster";

export interface DXConsoleProps {
  /** Current display time */
  displayTime: Date;
  /** Callback when the console is collapsed */
  onCollapse: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Get K-index severity color based on value
 */
function getKIndexColor(kp: number): { bg: string; text: string } {
  if (kp >= 7) {
    return { bg: "bg-alert-red/30", text: "text-alert-red" };
  }
  if (kp >= 5) {
    return { bg: "bg-orange-500/30", text: "text-orange-400" };
  }
  if (kp >= 4) {
    return { bg: "bg-yellow-500/30", text: "text-yellow-400" };
  }
  return { bg: "bg-signal-green/30", text: "text-signal-green" };
}

/**
 * Get SFI color based on value (higher is better for HF propagation)
 */
function getSFIColor(sfi: number): { bg: string; text: string } {
  if (sfi >= 150) {
    return { bg: "bg-signal-green/30", text: "text-signal-green" };
  }
  if (sfi >= 100) {
    return { bg: "bg-plasma-orange/30", text: "text-plasma-orange" };
  }
  if (sfi >= 70) {
    return { bg: "bg-yellow-500/30", text: "text-yellow-400" };
  }
  return { bg: "bg-gray-500/30", text: "text-gray-400" };
}

/**
 * DXConsole Component
 *
 * Provides a full-featured DX operations console with:
 * - Live indicator and solar indices in the header
 * - Collapsible interface
 * - Integrated DX spot list with filtering
 */
export function DXConsole({
  displayTime: _displayTime,
  onCollapse,
  className = "",
}: DXConsoleProps) {
  // displayTime reserved for future use (e.g., historical playback mode)
  void _displayTime;

  // DX Store state
  const store = useDXStore();
  const { selectedSpot } = store;
  const setTarget = useMapStore((state) => state.setTarget);

  // Fetch spots for BandMap
  const { spots } = useDXCluster();

  // Available bands from current spots
  const availableBands = useMemo(() => selectAvailableBands(store), [store]);

  // Selected band for BandMap filtering
  const [selectedBand, setSelectedBand] = useState<string | null>(null);

  // Auto-select first available band if none selected
  useEffect(() => {
    if (!selectedBand && availableBands.length > 0) {
      setSelectedBand(availableBands[0]);
    }
  }, [availableBands, selectedBand]);

  // When a spot is selected with valid coordinates, update the map target
  // This shows the propagation path from QTH to the DX station
  useEffect(() => {
    if (
      selectedSpot &&
      typeof selectedSpot.dxLat === "number" &&
      typeof selectedSpot.dxLon === "number"
    ) {
      setTarget({
        lat: selectedSpot.dxLat,
        lon: selectedSpot.dxLon,
        grid: selectedSpot.dxGrid,
        name: selectedSpot.dx, // callsign as name
      });
    }
  }, [selectedSpot, setTarget]);

  // Fetch solar data
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();

  // Get current K-index (most recent)
  const currentKIndex = kIndexData?.[kIndexData.length - 1]?.kp_index ?? null;
  const kIndexColors =
    currentKIndex !== null ? getKIndexColor(currentKIndex) : null;

  // Get current Solar Flux Index (most recent)
  const currentSFI = solarFluxData?.[solarFluxData.length - 1]?.flux ?? null;
  const sfiColors = currentSFI !== null ? getSFIColor(currentSFI) : null;

  return (
    <div
      className={`flex flex-col h-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden ${className}`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-white/10 flex-shrink-0">
        {/* Left: Title */}
        <h2 className="font-sans text-sm font-semibold text-white uppercase tracking-wide">
          DX Operations Console
        </h2>

        {/* Center: Live indicator + indices OR selected frequency */}
        <div className="flex items-center gap-3">
          {selectedSpot ? (
            // Show selected frequency prominently
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">FREQ:</span>
              <span className="font-mono text-lg font-bold text-plasma-orange tracking-wider">
                {selectedSpot.frequency?.toFixed(1) ?? "--"}
              </span>
              <span className="text-xs text-gray-500">kHz</span>
            </div>
          ) : (
            // Show LIVE indicator and badges
            <>
              {/* LIVE indicator */}
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-signal-green opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-signal-green" />
                </span>
                <span className="text-xs font-medium text-signal-green uppercase tracking-wide">
                  Live
                </span>
              </div>

              {/* K-index badge */}
              {currentKIndex !== null && kIndexColors && (
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded ${kIndexColors.bg}`}
                  title={`K-index: ${currentKIndex} - Geomagnetic activity indicator`}
                >
                  <span className="text-[10px] text-gray-400 uppercase">K</span>
                  <span className={`text-xs font-bold ${kIndexColors.text}`}>
                    {currentKIndex}
                  </span>
                </div>
              )}

              {/* SFI badge */}
              {currentSFI !== null && sfiColors && (
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded ${sfiColors.bg}`}
                  title={`Solar Flux Index: ${currentSFI} - Higher values indicate better HF propagation`}
                >
                  <span className="text-[10px] text-gray-400 uppercase">
                    SFI
                  </span>
                  <span className={`text-xs font-bold ${sfiColors.text}`}>
                    {currentSFI}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Collapse button */}
        <button
          onClick={onCollapse}
          className="p-1.5 text-gray-500 hover:text-white transition-colors rounded hover:bg-white/5"
          title="Collapse console"
          aria-label="Collapse DX console"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {/* Band Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10 overflow-x-auto">
        {availableBands.map((band) => (
          <button
            key={band}
            onClick={() => setSelectedBand(band)}
            className={`px-3 py-1 text-xs font-medium rounded transition-all whitespace-nowrap ${
              selectedBand === band
                ? "bg-plasma-orange text-white"
                : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {band}
          </button>
        ))}
      </div>

      {/* Content Area - Split View */}
      <div className="flex-1 flex min-h-0 gap-4 p-4">
        {/* Left: DX Spot List (40%) */}
        <div className="w-2/5 flex flex-col min-h-0">
          <DXSpotList
            showHeader={false}
            showFilters={true}
            maxHeight="100%"
            className="flex-1"
          />
        </div>

        {/* Right: Band Map (60%) - fills available height */}
        <div className="w-3/5 flex flex-col min-h-0">
          <BandMap
            spots={spots}
            selectedBand={selectedBand}
            className="flex-1 min-h-[250px]"
          />
        </div>
      </div>

      {/* Insights Bar - Full width at bottom */}
      <div className="flex-shrink-0 px-4 pb-4">
        <InsightsBar displayTime={new Date()} />
      </div>
    </div>
  );
}

DXConsole.displayName = "DXConsole";

export default DXConsole;

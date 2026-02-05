/**
 * DXConsole Component
 *
 * A comprehensive DX Operations Console that displays real-time DX cluster
 * spots with solar indices and a collapsible interface.
 */

import { useEffect, useState, useMemo } from "react";
import { DXSpotList } from "./DXSpotList";
import { BandMap } from "./BandMap";
import { BandActivityBar } from "./BandActivityBar";
import { InsightsBar } from "./InsightsBar";
import { TrendSparkline } from "./TrendSparkline";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useDXStore, selectAvailableBands } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useDXCluster } from "@/hooks/useDXCluster";
import { BAND_COLORS } from "@/lib/utils/spotColors";

export interface DXConsoleProps {
  /** Current display time */
  displayTime: Date;
  /** Callback when the console is collapsed */
  onCollapse: () => void;
  /** Whether to show the header bar (default: true) */
  showHeader?: boolean;
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
  showHeader = true,
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

  // Extract trend data for sparklines
  const kIndexTrend = useMemo(
    () => kIndexData?.map((d) => d.kp_index) ?? [],
    [kIndexData],
  );
  const sfiTrend = useMemo(
    () => solarFluxData?.map((d) => d.flux) ?? [],
    [solarFluxData],
  );

  return (
    <div
      className={`flex flex-col h-full bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden ${className}`}
    >
      {/* Header Bar */}
      {showHeader && (
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

                {/* K-index badge with trend */}
                {currentKIndex !== null && kIndexColors && (
                  <div
                    className={`flex items-center gap-1 px-2 py-0.5 rounded ${kIndexColors.bg}`}
                    title={`K-index: ${currentKIndex} - Geomagnetic activity indicator`}
                  >
                    <span className="text-[10px] text-gray-400 uppercase">
                      K
                    </span>
                    <span className={`text-xs font-bold ${kIndexColors.text}`}>
                      {currentKIndex}
                    </span>
                    <TrendSparkline
                      data={kIndexTrend}
                      color={
                        kIndexColors.text.includes("red")
                          ? "#ef4444"
                          : kIndexColors.text.includes("orange")
                            ? "#fb923c"
                            : kIndexColors.text.includes("yellow")
                              ? "#eab308"
                              : "#22c55e"
                      }
                    />
                  </div>
                )}

                {/* SFI badge with trend */}
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
                    <TrendSparkline
                      data={sfiTrend}
                      color={
                        sfiColors.text.includes("green")
                          ? "#22c55e"
                          : sfiColors.text.includes("orange")
                            ? "#ff6b35"
                            : sfiColors.text.includes("yellow")
                              ? "#eab308"
                              : "#9ca3af"
                      }
                    />
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
            type="button"
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
      )}

      {/* Band Activity Bar — global overview at top */}
      <div className="px-4 py-2 flex-shrink-0 border-b border-white/10">
        <BandActivityBar
          spots={spots}
          activeBands={selectedBand ? [selectedBand] : []}
          onBandClick={(band) =>
            setSelectedBand(selectedBand === band ? null : band)
          }
        />
      </div>

      {/* Content Area - Split View */}
      <div className="flex-1 flex min-h-0 gap-4 p-4">
        {/* Left: DX Spot List (50%) */}
        <div className="w-1/2 flex flex-col min-h-0">
          <DXSpotList
            showHeader={false}
            showFilters={true}
            maxHeight="100%"
            className="flex-1"
          />
        </div>

        {/* Right: Band Map (50%) - fills available height */}
        <div className="w-1/2 flex flex-col min-h-0">
          {/* Band Tabs — directly above the BandMap they control */}
          <div className="flex items-center gap-1 pb-2 overflow-x-auto flex-shrink-0">
            {availableBands.map((band) => (
              <button
                key={band}
                onClick={() =>
                  setSelectedBand(selectedBand === band ? null : band)
                }
                className={
                  selectedBand === band
                    ? "px-3 py-1 text-xs font-bold rounded border transition-all whitespace-nowrap"
                    : "px-3 py-1 text-xs font-medium rounded border border-transparent transition-all whitespace-nowrap bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                }
                style={
                  selectedBand === band
                    ? {
                        backgroundColor: `${BAND_COLORS[band.toLowerCase()] ?? BAND_COLORS.default}33`,
                        borderColor:
                          BAND_COLORS[band.toLowerCase()] ??
                          BAND_COLORS.default,
                        color:
                          BAND_COLORS[band.toLowerCase()] ??
                          BAND_COLORS.default,
                      }
                    : undefined
                }
              >
                {band}
              </button>
            ))}
          </div>
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

/**
 * HamClockSpotsSidebar -- DX and portable-activation spots for HamClock
 *
 * Wraps the existing DXSpotList component inside a compact vertical layout
 * and adds normalized POTA/SOTA/WWFF feeds without disturbing the richer DX
 * workflow. A header shows the active feed count and an optional target bar
 * appears when a DX or activation target is set on the map.
 *
 * No props needed -- reads everything from stores.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { filterMapSpots } from "@/lib/map/filterMapSpots";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { useOperatingMonitor } from "@/hooks/useOperatingMonitor";
import { HamClockRecentContacts } from "./HamClockRecentContacts";
import { DXSpotList } from "@/components/dx/DXSpotList/DXSpotList";
import { useActivationSpots } from "@/hooks/useActivationSpots";
import { useDXCluster } from "@/hooks/useDXCluster";
import { getBandFromFrequency } from "@/lib/api/dxcluster";
import { getBandColor } from "@/lib/utils/spotColors";
import { useMapStore } from "@/stores/mapStore";
import { useHamClockStore, type HamClockMode } from "@/stores/hamclockStore";
import { HamClockBandFocus } from "./HamClockBandFocus";
import {
  ACTIVATION_PROGRAM_META,
  type ActivationProgram,
  type ActivationSpot,
  type ActivationSourceStatus,
} from "@/types/activationSpots";

type SpotTab = "DX" | ActivationProgram;

const SPOT_TABS: readonly SpotTab[] = ["DX", "POTA", "SOTA", "WWFF"];

// ---------------------------------------------------------------------------
// Crosshair SVG (target indicator icon)
// ---------------------------------------------------------------------------

function CrosshairIcon() {
  return (
    <svg
      className="w-3 h-3 text-plasma-orange shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

function formatSpotAge(spottedAt: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(spottedAt).getTime()) / 60_000),
  );
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
}

function formatFrequency(frequencyKHz: number): string {
  return frequencyKHz >= 1_000
    ? `${(frequencyKHz / 1_000).toFixed(3)} MHz`
    : `${frequencyKHz.toFixed(1)} kHz`;
}

interface ActivationSpotRowProps {
  spot: ActivationSpot;
  onSelect: (spot: ActivationSpot) => void;
}

function ActivationSpotRow({ spot, onSelect }: ActivationSpotRowProps) {
  const hasCoordinates =
    spot.latitude !== undefined && spot.longitude !== undefined;
  const band = getBandFromFrequency(spot.frequencyKHz);
  const content = (
    <>
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className="w-1.5 h-5 rounded-full shrink-0"
          style={{ backgroundColor: getBandColor(band) }}
          aria-hidden="true"
        />
        <span className="font-mono text-[11px] font-bold text-white truncate">
          {spot.callsign}
        </span>
        <span className="font-mono text-[9px] text-plasma-orange truncate">
          {spot.reference}
        </span>
        <span className="ml-auto font-mono text-[9px] text-gray-500 shrink-0">
          {formatSpotAge(spot.spottedAt)}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 pl-3 min-w-0 text-[9px]">
        <span className="font-mono text-gray-300 shrink-0">
          {band !== "Unknown" ? band : "—"}
        </span>
        <span className="font-mono text-cyan-300 shrink-0">
          {formatFrequency(spot.frequencyKHz)}
        </span>
        <span className="font-mono text-gray-400 shrink-0">{spot.mode}</span>
        <span className="text-gray-500 truncate">
          {spot.comments ||
            spot.referenceName ||
            `spotted by ${spot.spotter || "—"}`}
        </span>
      </div>
    </>
  );

  if (!hasCoordinates) {
    return (
      <div
        className="w-full px-2.5 py-1.5 border-b border-white/5"
        title="Location unavailable"
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="w-full px-2.5 py-1.5 text-left border-b border-white/5 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-plasma-orange"
      onClick={() => onSelect(spot)}
      aria-label={`Target ${spot.callsign} at ${spot.reference}`}
    >
      {content}
    </button>
  );
}

interface ActivationSpotListProps {
  program: ActivationProgram;
  spots: ActivationSpot[];
  status: ActivationSourceStatus | undefined;
  isLoading: boolean;
  error: Error | null;
  onSelect: (spot: ActivationSpot) => void;
}

function ActivationSpotList({
  program,
  spots,
  status,
  isLoading,
  error,
  onSelect,
}: ActivationSpotListProps) {
  const meta = ACTIVATION_PROGRAM_META[program];
  let message: string | null = null;
  if (isLoading && spots.length === 0) {
    message = `Loading ${program} activations…`;
  } else if ((error && spots.length === 0) || status === "unavailable") {
    message = `${program} feed unavailable`;
  } else if (status === "invalid") {
    message = `${program} feed returned invalid data`;
  } else if (spots.length === 0) {
    message = `No live ${program} activations`;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {message ? (
          <div className="px-3 py-6 text-center text-[10px] text-gray-500">
            {message}
          </div>
        ) : (
          spots.map((spot) => (
            <ActivationSpotRow key={spot.id} spot={spot} onSelect={onSelect} />
          ))
        )}
      </div>
      <a
        href={meta.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 border-t border-white/10 px-2.5 py-1 font-mono text-[8px] uppercase tracking-wider text-gray-600 hover:text-gray-400"
      >
        Source: {meta.source}
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HamClockSpotsSidebarProps {
  mode?: HamClockMode;
}

export function HamClockSpotsSidebar({
  mode = "traffic",
}: HamClockSpotsSidebarProps) {
  const [activeTab, setActiveTab] = useState<SpotTab>("DX");
  const tabRefs = useRef<Partial<Record<SpotTab, HTMLButtonElement | null>>>(
    {},
  );

  // Spot counts drive both the live indicator and compact per-tab badges.
  const { allSpots } = useDXCluster();
  const spotFilters = useMapStore((s) => s.spotFilters);
  const dxSpotCount = filterMapSpots(allSpots ?? [], spotFilters).length;
  const {
    spotsByProgram,
    sources,
    isLoading: activationsLoading,
    error: activationsError,
  } = useActivationSpots();
  const tabCounts: Record<SpotTab, number> = {
    DX: dxSpotCount,
    POTA: spotsByProgram.POTA.length,
    SOTA: spotsByProgram.SOTA.length,
    WWFF: spotsByProgram.WWFF.length,
  };
  const activeCount = tabCounts[activeTab];

  // Current DX/activation target (if any)
  const target = useMapStore((s) => s.target);
  const setTarget = useMapStore((s) => s.setTarget);
  const setSpotFilters = useMapStore((s) => s.setSpotFilters);
  const [expanded, setExpanded] = useState(true);
  const setBandFocus = useHamClockStore((s) => s.setBandFocus);

  const display = useHamClockDisplayStore();
  const followRadio = display.followRadio;
  const radio = useOperatingMonitor();
  const showBandFocus =
    (mode === "bands" || mode === "traffic") && activeTab === "DX";
  const spotsHidden = display.hiddenPanels.includes("spots");
  useEffect(() => {
    if (!followRadio || !radio) return;
    const filters = useMapStore.getState().spotFilters;
    if (
      filters.bands.length !== 1 ||
      filters.bands[0] !== radio.band ||
      filters.modes.length !== 1 ||
      filters.modes[0] !== radio.mode
    ) {
      setSpotFilters({ bands: [radio.band], modes: [radio.mode] });
    }
  }, [followRadio, radio, setSpotFilters]);

  const handleToggleBand = (band: string) => {
    const next = spotFilters.bands.includes(band)
      ? spotFilters.bands.filter((b) => b !== band)
      : [...spotFilters.bands, band];
    display.setFollowRadio(false);
    setBandFocus(next);
    setSpotFilters({ ...spotFilters, bands: next });
  };

  const handleClearBands = () => {
    display.setFollowRadio(false);
    setBandFocus([]);
    setSpotFilters({ ...spotFilters, bands: [] });
  };

  const selectActivation = (spot: ActivationSpot) => {
    if (spot.latitude === undefined || spot.longitude === undefined) return;
    setTarget({
      lat: spot.latitude,
      lon: spot.longitude,
      grid: spot.grid,
      name: `${spot.callsign} · ${spot.reference}`,
    });
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: SpotTab,
  ) => {
    const currentIndex = SPOT_TABS.indexOf(currentTab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % SPOT_TABS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + SPOT_TABS.length) % SPOT_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = SPOT_TABS.length - 1;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = SPOT_TABS[nextIndex];
    setActiveTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div className="hamclock-ui flex flex-col h-full min-h-0">
      {!spotsHidden && (
        <section
          data-hamclock-scroll
          className="flex min-h-0 flex-col overflow-y-auto"
          aria-label="DX Spots"
          style={{ flex: expanded ? "1 1 60%" : "0 0 auto" }}
        >
          {/* ── Header ── */}
          <button
            type="button"
            aria-label="DX Spots"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0"
          >
            <div className="flex items-center gap-2">
              {activeCount > 0 && (
                <div className="w-2 h-2 rounded-full bg-signal-green animate-pulse" />
              )}
              <span className="text-xs font-medium text-gray-300 uppercase tracking-wider">
                {activeTab === "DX" ? "DX Spots" : `${activeTab} Activations`}
              </span>
            </div>
            <span className="text-xs text-gray-500 font-mono">
              {activeCount} {expanded ? "▾" : "▸"}
            </span>
          </button>
          {expanded && (
            <>
              {/* ── Feed tabs ── */}
              <div
                role="tablist"
                aria-label="Spot feeds"
                className="grid grid-cols-4 border-b border-white/10 shrink-0"
              >
                {SPOT_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    id={`spots-tab-${tab.toLowerCase()}`}
                    aria-controls="spots-tab-panel"
                    aria-selected={activeTab === tab}
                    tabIndex={activeTab === tab ? 0 : -1}
                    ref={(node) => {
                      tabRefs.current[tab] = node;
                    }}
                    className={`px-1 py-1.5 font-mono text-[9px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-plasma-orange ${
                      activeTab === tab
                        ? "bg-plasma-orange/10 text-plasma-orange"
                        : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                    }`}
                    onClick={() => setActiveTab(tab)}
                    onKeyDown={(event) => handleTabKeyDown(event, tab)}
                  >
                    {tab}{" "}
                    <span className="text-[8px] opacity-70">
                      {tabCounts[tab]}
                    </span>
                  </button>
                ))}
              </div>

              {showBandFocus && (
                <label className="flex shrink-0 items-center gap-2 px-3 py-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={followRadio}
                    disabled={!radio && !followRadio}
                    onChange={(e) => display.setFollowRadio(e.target.checked)}
                  />
                  Follow radio
                  <span className="ml-auto text-gray-500">
                    {radio
                      ? `${radio.band} ${radio.mode}`
                      : followRadio
                        ? "Paused · no live radio"
                        : "No live radio"}
                  </span>
                </label>
              )}
              {showBandFocus && (
                <HamClockBandFocus
                  selected={spotFilters.bands}
                  onToggle={handleToggleBand}
                  onClear={handleClearBands}
                />
              )}

              {/* ── Target indicator (shown only when a target is set) ── */}
              {target && (
                <div className="px-3 py-1.5 border-b border-plasma-orange/30 bg-plasma-orange/5 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <CrosshairIcon />
                    <span className="text-xs text-plasma-orange font-medium truncate">
                      {target.name || "Target"}
                    </span>
                    {target.grid && (
                      <span className="text-[10px] text-gray-500 shrink-0">
                        {target.grid}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* ── Spot list (fills remaining space) ── */}
              <div
                id="spots-tab-panel"
                role="tabpanel"
                aria-labelledby={`spots-tab-${activeTab.toLowerCase()}`}
                className="flex-1 min-h-[160px] overflow-hidden"
              >
                {activeTab === "DX" ? (
                  <DXSpotList
                    compact
                    showFilters={mode !== "satellites"}
                    showHeader={false}
                    maxHeight="100%"
                    className="!bg-transparent !border-0 !rounded-none"
                  />
                ) : (
                  <ActivationSpotList
                    program={activeTab}
                    spots={spotsByProgram[activeTab]}
                    status={
                      sources.find((source) => source.program === activeTab)
                        ?.status
                    }
                    isLoading={activationsLoading}
                    error={activationsError}
                    onSelect={selectActivation}
                  />
                )}
              </div>
            </>
          )}
        </section>
      )}
      <HamClockRecentContacts />
    </div>
  );
}

/**
 * DXSpotList Component
 *
 * Displays a scrollable list of DX cluster spots with filtering controls.
 * Features glassmorphism styling consistent with the rest of the app.
 * Includes worked status indicators and alert highlighting.
 *
 * This is the main orchestrator component that composes the modular pieces.
 */

import { useCallback, useMemo, useRef } from "react";
import { useSpotPage } from "./useSpotPage";
import { useVisibleRows } from "@/components/map/hamclock/wall/useVisibleRows";
import { HamClockButton } from "@/components/map/hamclock/wall/controls";
import { Card, LoadingSpinner } from "@/components/ui";
import { SpotContextMenu } from "@/components/map/SpotContextMenu";
import { SpotDetailPanel } from "../SpotDetailPanel";
import { SpotRow } from "./SpotRow";
import { FilterControls } from "./FilterControls";
import { useDXSpotListState } from "./useDXSpotListState";
import { formatTime } from "./utils";
import type { DXSpotListProps } from "./types";
import type { DXSpot } from "@/types/dxcluster";
import { useDXStore } from "@/stores/dxStore";
import type { DXSpotSource } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useWatchStore, formatCriteriaSummary } from "@/stores/watchStore";
import { useContestWatch } from "@/hooks/useContestWatch";
import { applyLogIntent } from "@/lib/qso/logIntent";
import { resolveMapSpotSelection } from "@/hooks/useMapSpotSelection";
import { useOptionalViewRuntime } from "@/components/views/ViewRuntimeContext";
import {
  useOptionalViewEffectiveSpots,
  useOptionalViewSpotFilterPatch,
} from "@/hooks/useViewClusterSpots";
import {
  allModesSelection,
  modeMatchesSelection,
  normalizeMode,
  normalizeModeSelection,
  summarizeModeSelection,
} from "@/lib/spots/presentation/modes";

/** Source badge styling map */
const SOURCE_BADGE_STYLES: Record<
  DXSpotSource,
  { label: string; bg: string; text: string; border: string; pulse: boolean }
> = {
  bridge: {
    label: "LIVE",
    bg: "bg-green-500/20",
    text: "text-green-400",
    border: "border-green-500/30",
    pulse: true,
  },
  rest: {
    label: "REST",
    bg: "bg-blue-500/20",
    text: "text-blue-400",
    border: "border-blue-500/30",
    pulse: false,
  },
};

/**
 * DXSpotList Component
 *
 * Displays a scrollable, filterable list of DX cluster spots.
 * Includes worked status indicators from logbook and alert highlighting.
 */
export function DXSpotList({
  compact = false,
  wallPaging = false,
  maxHeight = "400px",
  showFilters = true,
  showHeader = true,
  className = "",
  onExpand,
  onResearchGrid,
}: DXSpotListProps) {
  const spotSource = useDXStore((s) => s.spotSource);
  // Band/mode filters come from the bound view's own runtime (SP-09 round 3),
  // not the retired `mapStore.spotFilters`. This list also mounts bare on the
  // `/map/ops` popout window (no `ViewProvider` above it there); that is a
  // deliberate "unbound reader sees everything" fallback (#615's PR body),
  // not a gap, so the optional variant falls back to unfiltered spots there
  // instead of throwing (#756).
  const viewSpots = useOptionalViewEffectiveSpots();
  const spotFilters = useMemo(
    () => ({ bands: viewSpots.filters.bands, modes: viewSpots.filters.modes }),
    [viewSpots.filters.bands, viewSpots.filters.modes],
  );
  const modeSelection = useMemo(
    () => normalizeModeSelection(spotFilters.modes),
    [spotFilters.modes],
  );
  const hasModeFilter = !modeSelection.all;
  const activeProfile = useMapStore((s) => s.activeProfile);
  const watchCriteria = useWatchStore((s) => s.criteria);
  const matchedSpotIds = useWatchStore((s) => s.matchedSpotIds);
  const watchMatchCount = useWatchStore((s) => s.matchCount);
  const clearWatch = useWatchStore((s) => s.clearWatch);
  // ── Contest watch integration ──
  const contestWatch = useContestWatch();
  const runtime = useOptionalViewRuntime();
  const clearViewSpotFilters = useOptionalViewSpotFilterPatch();
  // With follow-radio on, `config.spots.filters` is already `{bands: [],
  // modes: all}` -- the chip's active filter comes from the radio overlay in
  // `effectiveSpots()`, not the configured value. Patching bands/modes back
  // to their already-empty configured values is therefore a no-op that
  // `updateWorkingView`'s own follow-radio auto-clear never sees (it only
  // fires when the *configured* filters actually change). Clearing the
  // filter must also turn follow-radio off directly, or the click does
  // nothing (#756 group 3).
  const handleClearFilter = useCallback(() => {
    clearViewSpotFilters({ bands: [], modes: allModesSelection() });
    if (!runtime) return;
    const snapshot = runtime.getSnapshot();
    if (snapshot.config.context.followRadio) {
      runtime.updateWorkingView({
        context: { ...snapshot.config.context, followRadio: false },
      });
    }
  }, [clearViewSpotFilters, runtime]);

  const state = useDXSpotListState(onResearchGrid);

  const {
    displaySpots,
    isLoading,
    isFetching,
    lastUpdated,
    feedState,
    stats,
    selectedSpot,
    hoveredSpot,
    contextMenu,
    highlightedSpotId,
    workedStatusMap,
    neededStatusMap,
    distanceMap,
    alertMatchSet,
    filters,
    availableBands,
    availableModes,
    activeBandFilter,
    alertMatchCount,
    neededCount,
    totalSpots,
    spotAgePrefs,
    bandPresets,
    listContainerRef,
    handleSearchChange,
    handleBandToggle,
    handleBandBadgeClick,
    handleModeToggle,
    handleSourceToggle,
    handleGridFilterChange,
    handleMaxAgeChange,
    handleSelectSpot,
    handleNeededOnlyToggle,
    handleSortByNeededToggle,
    handleSavePreset,
    handleApplyPreset,
    handleDeletePreset,
    handleContextMenu,
    handleContextMenuClose,
    handleContextAction,
    setHoveredSpot,
    refetch,
  } = state;

  // ── Profile-based spot filtering ───────────────────────────────────────────
  const profileFilteredSpots = useMemo(() => {
    const hasBandFilter = spotFilters.bands.length > 0;

    // No profile filters active — pass through all spots
    if (!hasBandFilter && !hasModeFilter) {
      return displaySpots;
    }

    const bandSet = new Set(spotFilters.bands.map((b) => b.toLowerCase()));

    return displaySpots.filter((spot) => {
      if (hasBandFilter && spot.band) {
        if (!bandSet.has(spot.band.toLowerCase())) return false;
      }
      if (hasModeFilter && !modeMatchesSelection(normalizeMode(spot.mode), modeSelection)) {
        return false;
      }
      return true;
    });
  }, [displaySpots, spotFilters.bands, hasModeFilter, modeSelection]);

  // ── New multiplier spot IDs for contest mode ──────────────────────────────
  const newMultSpotIds = useMemo(() => {
    const ids = new Set<string>();
    for (const ms of contestWatch.newMultiplierSpots) {
      ids.add(ms.spotId);
    }
    return ids;
  }, [contestWatch.newMultiplierSpots]);

  // ── Watch-aware spot ordering: pin matched spots to top ──────────────────
  const watchSortedSpots = useMemo(() => {
    if (!watchCriteria || matchedSpotIds.size === 0) {
      return profileFilteredSpots;
    }
    const newMult: DXSpot[] = [];
    const matched: DXSpot[] = [];
    const rest: DXSpot[] = [];
    for (const spot of profileFilteredSpots) {
      if (newMultSpotIds.has(spot.id)) {
        newMult.push(spot);
      } else if (matchedSpotIds.has(spot.id)) {
        matched.push(spot);
      } else {
        rest.push(spot);
      }
    }
    // New multipliers first, then other watch matches, then the rest
    return [...newMult, ...matched, ...rest];
  }, [profileFilteredSpots, watchCriteria, matchedSpotIds, newMultSpotIds]);

  const profileFilterActive = spotFilters.bands.length > 0 || hasModeFilter;

  // Quick action: set map target from row button
  const handleSetTarget = useCallback(
    (spot: DXSpot) => {
      handleContextAction("setTarget", spot);
    },
    [handleContextAction],
  );

  // Quick action: watch callsign from row button
  const handleWatchCallsign = useCallback(
    (spot: DXSpot) => {
      handleContextAction("watchCallsign", spot);
    },
    [handleContextAction],
  );

  // Quick action: hide spot from row button
  const handleHideSpot = useCallback(
    (spot: DXSpot) => {
      handleContextAction("hideSpot", spot);
    },
    [handleContextAction],
  );

  const handleWorkSpot = useCallback(
    (spot: DXSpot) => {
      const result = applyLogIntent("work", spot);
      if (result.status === "ignored") return;
      const resolved = resolveMapSpotSelection(spot);
      runtime?.selectSpot(
        spot.id,
        resolved ? { lat: resolved.target.lat, lon: resolved.target.lon } : null,
      );
    },
    [runtime],
  );

  // --- QoL1: Keyboard-first DX spot navigation ---
  const spotListRef = useRef<HTMLDivElement>(null);
  const [pageRowsRef, measuredSize] = useVisibleRows<HTMLDivElement>(watchSortedSpots.length);
  const pageSize = Math.max(1, measuredSize);
  const { start: pageStart, end: pageEnd, focusedIndex, setFocusedIndex, changePage } =
    useSpotPage(watchSortedSpots, pageSize, selectedSpot?.id, wallPaging);
  const visibleSpots = wallPaging
    ? watchSortedSpots.slice(pageStart, pageEnd)
    : watchSortedSpots;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const len = watchSortedSpots.length;
      if (len === 0) return;

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev < 0 && wallPaging ? pageStart : prev + 1, len - 1));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setFocusedIndex((prev) => prev < 0 && wallPaging ? Math.max(pageStart, pageEnd - 1) : Math.max(prev - 1, 0));
          break;
        }
        case "PageDown": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min((prev < 0 && wallPaging ? pageStart : prev) + (wallPaging ? pageSize : 10), len - 1));
          break;
        }
        case "PageUp": {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max((prev < 0 && wallPaging ? pageStart : prev) - (wallPaging ? pageSize : 10), 0));
          break;
        }
        case "Home": {
          e.preventDefault();
          setFocusedIndex(0);
          break;
        }
        case "End": {
          e.preventDefault();
          setFocusedIndex(len - 1);
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < len) {
            const spot = watchSortedSpots[focusedIndex];
            handleSelectSpot(spot);
            handleSetTarget(spot);
          }
          break;
        }
        case "w":
        case "W": {
          if (focusedIndex >= 0 && focusedIndex < len) {
            e.preventDefault();
            handleWatchCallsign(watchSortedSpots[focusedIndex]);
          }
          break;
        }
        case "b":
        case "B": {
          if (focusedIndex >= 0 && focusedIndex < len) {
            e.preventDefault();
            handleSetTarget(watchSortedSpots[focusedIndex]);
          }
          break;
        }
        case "l":
        case "L": {
          if (focusedIndex >= 0 && focusedIndex < len) {
            e.preventDefault();
            handleWorkSpot(watchSortedSpots[focusedIndex]);
          }
          break;
        }
        case "t":
        case "T": {
          if (focusedIndex >= 0 && focusedIndex < len) {
            e.preventDefault();
            applyLogIntent("tune", watchSortedSpots[focusedIndex]);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          setFocusedIndex(-1);
          handleSelectSpot(null);
          break;
        }
      }
    },
    [
      watchSortedSpots,
      wallPaging,
      pageStart,
      pageEnd,
      pageSize,
      focusedIndex,
      setFocusedIndex,
      handleSelectSpot,
      handleSetTarget,
      handleWatchCallsign,
      handleWorkSpot,
    ],
  );

  // Scroll focused row into view
  const scrollFocusedIntoView = useCallback((index: number) => {
    if (wallPaging || index < 0 || !spotListRef.current) return;
    const rows = spotListRef.current.querySelectorAll(
      '[role="row"]:not(:first-child)',
    );
    rows[index]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [wallPaging]);

  // Effect: scroll when focused index changes
  const prevFocusedRef = useRef(focusedIndex);
  if (prevFocusedRef.current !== focusedIndex) {
    prevFocusedRef.current = focusedIndex;
    scrollFocusedIntoView(focusedIndex);
  }

  return (
    <Card className={`h-full ${wallPaging ? "min-h-0" : ""} flex flex-col ${className}`}>
      {/* Header */}
      {showHeader && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h2 className="font-sans text-lg font-semibold text-su-text tracking-wide">
              DX CLUSTER
            </h2>
            <span className="text-xs text-su-muted">
              {profileFilteredSpots.length}
              {(filters.neededOnly &&
                profileFilteredSpots.length !== totalSpots) ||
              profileFilterActive
                ? ` / ${totalSpots}`
                : ""}{" "}
              spots
            </span>
            {/* Data source indicator badge */}
            <span
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full border flex items-center gap-1 ${SOURCE_BADGE_STYLES[spotSource].bg} ${SOURCE_BADGE_STYLES[spotSource].text} ${SOURCE_BADGE_STYLES[spotSource].border}`}
            >
              {SOURCE_BADGE_STYLES[spotSource].pulse && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
                </span>
              )}
              {SOURCE_BADGE_STYLES[spotSource].label} · {feedState.state}
            </span>
            {alertMatchCount > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-alert-red/20 text-alert-red border border-alert-red/30 animate-pulse">
                {alertMatchCount} alert{alertMatchCount !== 1 ? "s" : ""}
              </span>
            )}
            {neededCount > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  fill="currentColor"
                  stroke="none"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z" />
                </svg>
                {neededCount} needed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(isLoading || isFetching) && <LoadingSpinner size="sm" />}
            <button
              onClick={refetch}
              className="p-1.5 text-su-muted hover:text-su-text transition-colors rounded hover:bg-su-line/10"
              title="Refresh spots"
            >
              <svg
                className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
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
            </button>
            {onExpand && (
              <button
                onClick={onExpand}
                className="p-1.5 text-su-muted hover:text-su-text transition-colors rounded hover:bg-su-line/10"
                title="Expand"
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
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Profile filter indicator */}
      {profileFilterActive && (
        <div className="mb-1.5 px-2 py-1 rounded bg-su-line/10 border border-su-line/40 text-[11px] text-su-muted flex items-center gap-1.5">
          <svg
            className="w-3 h-3 text-cyan-400 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span>
            {activeProfile ? (
              <>
                Profile{" "}
                <span className="text-cyan-400 font-medium">
                  {activeProfile.name}
                </span>
              </>
            ) : (
              <span className="text-cyan-400 font-medium">Custom filter</span>
            )}
            {spotFilters.bands.length > 0 && (
              <> — {spotFilters.bands.join(", ")}</>
            )}
            {hasModeFilter && (
              <> — {summarizeModeSelection(spotFilters.modes)}</>
            )}
            <span className="text-su-muted ml-1">
              — Showing {profileFilteredSpots.length} of {displaySpots.length}{" "}
              spots
            </span>
          </span>
          <button
            onClick={handleClearFilter}
            className="ml-auto text-su-text/80 hover:text-su-text text-[10px]"
            title="Clear filter"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Controls */}
      {showFilters && (
        <FilterControls
          searchText={filters.searchText || ""}
          onSearchChange={handleSearchChange}
          gridFilter={filters.gridFilter || ""}
          onGridFilterChange={handleGridFilterChange}
          maxAge={filters.maxAge || 30}
          onMaxAgeChange={handleMaxAgeChange}
          selectedBands={filters.bands || []}
          onBandToggle={handleBandToggle}
          selectedModes={filters.modes || []}
          onModeToggle={handleModeToggle}
          selectedSources={filters.sources || []}
          onSourceToggle={handleSourceToggle}
          availableBands={availableBands}
          availableModes={availableModes}
          neededOnly={filters.neededOnly || false}
          onNeededOnlyToggle={handleNeededOnlyToggle}
          sortByNeeded={filters.sortByNeeded || false}
          onSortByNeededToggle={handleSortByNeededToggle}
          neededCount={neededCount}
          bandPresets={bandPresets}
          onSavePreset={handleSavePreset}
          onApplyPreset={handleApplyPreset}
          onDeletePreset={handleDeletePreset}
        />
      )}

      {/* Spot List with sticky header — QoL1: keyboard navigable */}
      <div
        ref={(el) => {
          // Combine both refs
          (
            listContainerRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = el;
          (
            spotListRef as React.MutableRefObject<HTMLDivElement | null>
          ).current = el;
        }}
        className={wallPaging ? "flex-1 min-h-0 flex flex-col overflow-hidden focus:outline-none" : "flex-1 overflow-y-auto divide-y divide-su-line/20 focus:outline-none"}
        style={wallPaging ? undefined : { maxHeight }}
        role="table"
        aria-label="DX Spots"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-activedescendant={
          focusedIndex >= 0
            ? `spot-row-${watchSortedSpots[focusedIndex]?.id}`
            : undefined
        }
      >
        {/* Column Headers - sticky at top of scroll container */}
        {!compact && (
          <div
            className={`sticky top-0 z-10 bg-nebula-blue grid ${spotAgePrefs.showAgeColumn ? "grid-cols-[46px_40px_52px_66px_1fr_50px_62px_1fr_72px]" : "grid-cols-[46px_52px_66px_1fr_50px_62px_1fr_72px]"} gap-1.5 px-2 py-1.5 border-b border-su-line/40 text-[10px] font-semibold text-su-muted uppercase tracking-wider`}
            role="row"
            style={{ borderLeft: "3px solid transparent" }}
          >
            <div>Time</div>
            {spotAgePrefs.showAgeColumn && <div>Age</div>}
            <div>Band</div>
            <div>Freq</div>
            <div>DX</div>
            <div className="text-right">Dist-km</div>
            <div>Spotter</div>
            <div>Info</div>
            <div></div>
          </div>
        )}
        {/* Watch filter banner — sticky below column headers */}
        {watchCriteria !== null && (
          <div className={`sticky ${compact ? "top-0" : "top-[29px]"} z-10 bg-signal-green/10 border-b border-signal-green/20 px-2 py-1.5 flex items-center justify-between text-[11px]`}>
            <div className="flex items-center gap-1.5 text-signal-green min-w-0">
              <svg
                className="w-3.5 h-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              <span className="truncate">
                <span className="font-medium">Watching:</span>{" "}
                {formatCriteriaSummary(watchCriteria)}
                <span className="text-signal-green/70 ml-1">
                  &middot; {watchMatchCount} match
                  {watchMatchCount !== 1 ? "es" : ""}
                </span>
              </span>
            </div>
            <button
              onClick={clearWatch}
              className="ml-2 shrink-0 text-signal-green/60 hover:text-signal-green transition-colors p-0.5 rounded hover:bg-signal-green/10"
              title="Clear watch"
              aria-label="Clear watch"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}
        <div ref={wallPaging ? pageRowsRef : undefined} className={wallPaging ? "flex-1 min-h-0 overflow-hidden divide-y divide-su-line/20" : undefined}>
        {isLoading && watchSortedSpots.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : watchSortedSpots.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-su-muted">
            {profileFilterActive
              ? "No spots match profile filters"
              : "No spots match your filters"}
          </div>
        ) : (
          visibleSpots.map((spot, localIndex) => {
            const index = pageStart + localIndex;
            const isWatchMatch =
              watchCriteria !== null && matchedSpotIds.has(spot.id);
            const isNewMult = newMultSpotIds.has(spot.id);
            return (
              <div
                key={spot.id}
                className={`relative ${
                  isNewMult
                    ? "bg-caution-amber/10 border-l-2 border-caution-amber"
                    : isWatchMatch
                      ? "bg-signal-green/10 border-l-2 border-signal-green"
                      : ""
                }`}
              >
                {isNewMult && (
                  <span className="absolute top-1 right-1 z-10 px-1 py-0.5 rounded bg-caution-amber/20 text-caution-amber text-[8px] font-bold leading-none uppercase tracking-wider">
                    NEW MULT
                  </span>
                )}
                <SpotRow
                  compact={compact}
                  spot={spot}
                  index={index}
                  isSelected={selectedSpot?.id === spot.id}
                  isHovered={hoveredSpot?.id === spot.id}
                  isFocused={focusedIndex === index}
                  workedStatus={
                    workedStatusMap.get(spot.id) || {
                      isWorked: false,
                      workedOnBand: false,
                      workedBands: [],
                      isATNO: false,
                    }
                  }
                  isAlertMatch={alertMatchSet.has(spot.id)}
                  isNeeded={neededStatusMap.get(spot.id) ?? true}
                  distanceKm={distanceMap.get(spot.id) ?? null}
                  onSelect={wallPaging ? (selected) => { setFocusedIndex(index); handleSelectSpot(selected); } : handleSelectSpot}
                  onHover={setHoveredSpot}
                  onContextMenu={handleContextMenu}
                  onGridClick={handleGridFilterChange}
                  onBandClick={handleBandBadgeClick}
                  onSetTarget={handleSetTarget}
                  onWork={handleWorkSpot}
                  onWatchCallsign={handleWatchCallsign}
                  onHideSpot={handleHideSpot}
                  showAgeColumn={spotAgePrefs.showAgeColumn}
                  ageVisualizationEnabled={spotAgePrefs.enabled}
                  activeBandFilter={activeBandFilter}
                  isHighlighted={highlightedSpotId === spot.id}
                />
              </div>
            );
          })
        )}
        </div>
      </div>

      {wallPaging && (
        <div className="hcr-cluster-pages">
          <HamClockButton disabled={pageStart === 0} onClick={() => changePage(Math.max(0, pageStart - pageSize))}>PREVIOUS</HamClockButton>
          <span aria-live="polite">ROWS {watchSortedSpots.length ? pageStart + 1 : 0}–{pageEnd} / {watchSortedSpots.length}</span>
          <HamClockButton disabled={pageEnd >= watchSortedSpots.length} onClick={() => changePage(pageEnd)}>NEXT</HamClockButton>
        </div>
      )}

      {/* Spot Detail Panel - shows when a spot is selected */}
      <SpotDetailPanel spot={selectedSpot} />

      {/* Footer */}
      <div className="mt-2 pt-2 border-t border-su-line/40 flex items-center justify-between text-xs text-su-muted">
        <div>
          <span aria-label="Cluster source status">{feedState.state}{feedState.windowMinutes !== null ? ` · ${feedState.windowMinutes} MIN LOADED SAMPLE` : ""}</span>
          {lastUpdated && <span> · {spotSource === "bridge" ? "Last spot" : "Fetched"} {formatTime(lastUpdated)} UTC</span>}
        </div>
        <div className="flex items-center gap-3">
          <span>{stats.total} total</span>
          {Object.keys(stats.byMode).length > 0 && (
            <span className="text-su-muted">
              Top:{" "}
              {Object.entries(stats.byMode).sort((a, b) => b[1] - a[1])[0]?.[0]}
            </span>
          )}
        </div>
      </div>

      {/* Context Menu (Feature 2.6) */}
      {contextMenu && (
        <SpotContextMenu
          spot={contextMenu.spot}
          position={contextMenu.position}
          onClose={handleContextMenuClose}
          onAction={handleContextAction}
        />
      )}
    </Card>
  );
}

DXSpotList.displayName = "DXSpotList";

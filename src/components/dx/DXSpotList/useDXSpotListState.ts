/**
 * useDXSpotListState Hook
 *
 * Custom hook that encapsulates all the complex state management for DXSpotList.
 * Handles filtering, sorting, worked status, alert matching, and distance calculations.
 */

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { useDXCluster, useDXSpotStats } from "@/hooks/useDXCluster";
import { useLogbook } from "@/hooks/useLogbook";
import {
  useDXStore,
  selectAvailableBands,
  selectAvailableModes,
} from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useWatchStore } from "@/stores/watchStore";
import { useUndoStore } from "@/stores/undoStore";
import {
  useUserStore,
  useSpotAgePrefs,
  useBandPresets,
} from "@/stores/userStore";
import { getAllAlertRules } from "@/lib/db/alertStore";
import { matchesRule } from "@/lib/utils/alertMatcher";
import { gridToLatLon } from "@/lib/utils/grid";
import { calculateGreatCircleDistance } from "@/lib/utils/bands";
import type { DXSpot, SpotSourceType } from "@/types/dxcluster";
import type { AlertRule } from "@/lib/db/types";
import type { LiveSpot } from "@/types/livespot";
import type { SpotContextAction } from "@/components/map/SpotContextMenu";
import type { WorkedStatus, ContextMenuState } from "./types";
import {
  GRID_PREFIX_LENGTH,
  HIGHLIGHT_TIMEOUT_MS,
  ALERT_RULES_RELOAD_INTERVAL_MS,
} from "./constants";

/**
 * Return type for the useDXSpotListState hook
 */
export interface DXSpotListState {
  // Data
  displaySpots: DXSpot[];
  isLoading: boolean;
  isFetching: boolean;
  lastUpdated: Date | null;
  stats: ReturnType<typeof useDXSpotStats>;

  // Selection state
  selectedSpot: DXSpot | null;
  hoveredSpot: DXSpot | null;
  contextMenu: ContextMenuState | null;
  highlightedSpotId: string | null;

  // Computed data maps
  workedStatusMap: Map<string, WorkedStatus>;
  neededStatusMap: Map<string, boolean>;
  distanceMap: Map<string, number | null>;
  alertMatchSet: Set<string>;

  // Filter state
  filters: {
    searchText?: string;
    gridFilter?: string;
    maxAge?: number;
    bands?: string[];
    modes?: string[];
    sources?: SpotSourceType[];
    neededOnly?: boolean;
    sortByNeeded?: boolean;
  };
  availableBands: string[];
  availableModes: string[];
  syncMode: boolean;
  syncedBand: string | null;
  activeBandFilter: string | null;

  // Counts
  alertMatchCount: number;
  neededCount: number;
  totalSpots: number;

  // Preferences
  spotAgePrefs: ReturnType<typeof useSpotAgePrefs>;
  bandPresets: ReturnType<typeof useBandPresets>;

  // Refs
  listContainerRef: React.RefObject<HTMLDivElement>;

  // Handlers
  handleSearchChange: (text: string) => void;
  handleBandToggle: (band: string) => void;
  handleBandBadgeClick: (band: string) => void;
  handleModeToggle: (mode: string) => void;
  handleSourceToggle: (source: SpotSourceType) => void;
  handleGridFilterChange: (grid: string) => void;
  handleMaxAgeChange: (age: number) => void;
  handleSelectSpot: (spot: DXSpot | null) => void;
  handleNeededOnlyToggle: () => void;
  handleSortByNeededToggle: () => void;
  handleSavePreset: (name: string) => void;
  handleApplyPreset: (bands: string[]) => void;
  handleDeletePreset: (id: string) => void;
  handleContextMenu: (spot: DXSpot, position: { x: number; y: number }) => void;
  handleContextMenuClose: () => void;
  handleContextAction: (action: SpotContextAction, spot: DXSpot) => void;
  toggleSyncMode: () => void;
  setHoveredSpot: (spot: DXSpot | null) => void;
  refetch: () => void;
}

/**
 * Custom hook for DXSpotList state management
 */
export function useDXSpotListState(
  onResearchGrid?: (grid: string) => void,
): DXSpotListState {
  const { spots, isLoading, isFetching, refetch, lastUpdated } = useDXCluster();
  const {
    selectedSpot,
    setSelectedSpot,
    hoveredSpot,
    setHoveredSpot,
    filters,
    updateFilter,
    syncMode,
    syncedBand,
    toggleSyncMode,
    setSyncedBand,
    hideSpot,
  } = useDXStore();
  const stats = useDXSpotStats();

  // Context menu state (Feature 2.6)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Q8: Ref for the spot list container (for scroll-to-selected)
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Q8: State for highlighting a recently scrolled-to row
  const [highlightedSpotId, setHighlightedSpotId] = useState<string | null>(
    null,
  );
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Get map store for setting targets
  const { setTarget } = useMapStore();

  // Get watch store for watch actions
  const watchStore = useWatchStore();

  // Get undo store for tracking undoable actions
  const { pushAction } = useUndoStore();

  // Get user's station location for distance calculation
  const { station, addBandPreset, removeBandPreset } = useUserStore();

  // Get spot age visualization preferences
  const spotAgePrefs = useSpotAgePrefs();

  // Band presets (Q11)
  const bandPresets = useBandPresets();

  // Get logbook data for worked status
  const { isWorked, getWorkedBands } = useLogbook();

  // Load alert rules for alert matching
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadRules() {
      try {
        const rules = await getAllAlertRules();
        if (mounted) {
          setAlertRules(rules);
        }
      } catch (err) {
        console.error("Failed to load alert rules:", err);
      }
    }

    loadRules();

    // Reload rules periodically
    const interval = setInterval(loadRules, ALERT_RULES_RELOAD_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Q8: Scroll to selected spot and highlight it briefly
  useEffect(() => {
    if (!selectedSpot?.id || !listContainerRef.current) {
      return;
    }

    // Find the row element with the matching spot id
    const row = listContainerRef.current.querySelector(
      `[data-spot-id="${selectedSpot.id}"]`,
    );
    if (row) {
      // Smooth scroll to bring the row into view
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });

      // Set highlight state for brief visual feedback
      setHighlightedSpotId(selectedSpot.id);

      // Clear any existing highlight timeout
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }

      // Remove highlight after brief visual feedback
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedSpotId(null);
        highlightTimeoutRef.current = null;
      }, HIGHLIGHT_TIMEOUT_MS);
    }
  }, [selectedSpot?.id]);

  // Q8: Cleanup highlight timeout on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Get available bands and modes from store
  const store = useDXStore();
  const availableBands = useMemo(() => selectAvailableBands(store), [store]);
  const availableModes = useMemo(() => selectAvailableModes(store), [store]);

  // Pre-compute worked status for all spots
  const workedStatusMap = useMemo(() => {
    const map = new Map<string, WorkedStatus>();

    for (const spot of spots) {
      const worked = isWorked(spot.dx);
      const workedBands = getWorkedBands(spot.dx);
      const workedOnBand = spot.band ? workedBands.includes(spot.band) : false;

      map.set(spot.id, {
        isWorked: worked,
        workedOnBand,
        workedBands,
      });
    }

    return map;
  }, [spots, isWorked, getWorkedBands]);

  // Pre-compute distance for all spots (from user's QTH to DX station)
  const distanceMap = useMemo(() => {
    const map = new Map<string, number | null>();

    if (!station?.lat || !station?.lon) {
      // No station location - all distances unknown
      for (const spot of spots) {
        map.set(spot.id, null);
      }
      return map;
    }

    for (const spot of spots) {
      if (spot.dxLat != null && spot.dxLon != null) {
        const distance = calculateGreatCircleDistance(
          station.lat,
          station.lon,
          spot.dxLat,
          spot.dxLon,
        );
        map.set(spot.id, distance);
      } else {
        map.set(spot.id, null);
      }
    }

    return map;
  }, [spots, station]);

  // Pre-compute alert matches for all spots
  const alertMatchSet = useMemo(() => {
    const matchSet = new Set<string>();

    // Only process if we have enabled rules
    const enabledRules = alertRules.filter((r) => r.enabled);
    if (enabledRules.length === 0) {
      return matchSet;
    }

    for (const spot of spots) {
      // Convert DXSpot to LiveSpot format for matching
      const liveSpot: LiveSpot = {
        ...spot,
        source: "Cluster" as const,
      };

      // Check if any enabled rule matches this spot
      for (const rule of enabledRules) {
        if (matchesRule(liveSpot, rule)) {
          matchSet.add(spot.id);
          break; // One match is enough
        }
      }
    }

    return matchSet;
  }, [spots, alertRules]);

  // Pre-compute needed status for all spots (Feature 2.1)
  const neededStatusMap = useMemo(() => {
    const map = new Map<string, boolean>();

    for (const spot of spots) {
      const workedStatus = workedStatusMap.get(spot.id);
      // Spot is needed if never worked OR not worked on this band
      const isNeeded = workedStatus
        ? !workedStatus.isWorked || !workedStatus.workedOnBand
        : true;
      map.set(spot.id, isNeeded);
    }

    return map;
  }, [spots, workedStatusMap]);

  // Count needed spots for display
  const neededCount = useMemo(() => {
    let count = 0;
    for (const isNeeded of neededStatusMap.values()) {
      if (isNeeded) {
        count++;
      }
    }
    return count;
  }, [neededStatusMap]);

  // Q15: Compute active band filter for badge highlighting
  const activeBandFilter = useMemo(() => {
    const currentBands = filters.bands || [];
    // Only show active state when exactly one band is selected
    return currentBands.length === 1 ? currentBands[0] : null;
  }, [filters.bands]);

  // Apply needed filtering and sorting (Feature 2.1)
  const displaySpots = useMemo(() => {
    let result = [...spots];

    // Filter to needed only if enabled
    if (filters.neededOnly) {
      result = result.filter((spot) => neededStatusMap.get(spot.id) === true);
    }

    // Sort needed spots to top if enabled
    if (filters.sortByNeeded) {
      result.sort((a, b) => {
        const aNeeded = neededStatusMap.get(a.id) ? 1 : 0;
        const bNeeded = neededStatusMap.get(b.id) ? 1 : 0;
        // Sort needed spots first (descending), then by time (newest first)
        if (bNeeded !== aNeeded) {
          return bNeeded - aNeeded;
        }
        return b.time.getTime() - a.time.getTime();
      });
    }

    return result;
  }, [spots, filters.neededOnly, filters.sortByNeeded, neededStatusMap]);

  // Handlers
  const handleSearchChange = useCallback(
    (text: string) => {
      updateFilter("searchText", text);
    },
    [updateFilter],
  );

  const handleBandToggle = useCallback(
    (band: string) => {
      const currentBands = filters.bands || [];
      const newBands = currentBands.includes(band)
        ? currentBands.filter((b) => b !== band)
        : [...currentBands, band];
      updateFilter("bands", newBands);
    },
    [filters.bands, updateFilter],
  );

  // Q15: Handle band badge click in spot row - toggle single band filter
  const handleBandBadgeClick = useCallback(
    (band: string) => {
      const currentBands = filters.bands || [];
      // If this band is already the only filter, clear it (toggle off)
      if (currentBands.length === 1 && currentBands[0] === band) {
        updateFilter("bands", []);
      } else {
        // Otherwise, set this as the only band filter
        updateFilter("bands", [band]);
      }
    },
    [filters.bands, updateFilter],
  );

  const handleModeToggle = useCallback(
    (mode: string) => {
      const currentModes = filters.modes || [];
      const newModes = currentModes.includes(mode)
        ? currentModes.filter((m) => m !== mode)
        : [...currentModes, mode];
      updateFilter("modes", newModes);
    },
    [filters.modes, updateFilter],
  );

  const handleSourceToggle = useCallback(
    (source: SpotSourceType) => {
      const currentSources = filters.sources || [];
      const newSources = currentSources.includes(source)
        ? currentSources.filter((s) => s !== source)
        : [...currentSources, source];
      updateFilter("sources", newSources);
    },
    [filters.sources, updateFilter],
  );

  const handleGridFilterChange = useCallback(
    (grid: string) => {
      updateFilter("gridFilter", grid);
    },
    [updateFilter],
  );

  const handleMaxAgeChange = useCallback(
    (age: number) => {
      updateFilter("maxAge", age);
    },
    [updateFilter],
  );

  const handleSelectSpot = useCallback(
    (spot: DXSpot | null) => {
      if (!spot) {
        setSelectedSpot(null);
        return;
      }
      const isDeselecting = selectedSpot?.id === spot.id;
      setSelectedSpot(isDeselecting ? null : spot);

      // When sync mode is enabled, set the synced band to the spot's band
      if (syncMode && !isDeselecting && spot.band) {
        setSyncedBand(spot.band);
      }
    },
    [selectedSpot, setSelectedSpot, syncMode, setSyncedBand],
  );

  const handleNeededOnlyToggle = useCallback(() => {
    updateFilter("neededOnly", !filters.neededOnly);
  }, [filters.neededOnly, updateFilter]);

  const handleSortByNeededToggle = useCallback(() => {
    updateFilter("sortByNeeded", !filters.sortByNeeded);
  }, [filters.sortByNeeded, updateFilter]);

  const handleSavePreset = useCallback(
    (name: string) => {
      const currentBands = filters.bands || [];
      if (currentBands.length > 0) {
        const result = addBandPreset(name, currentBands);
        if (!result.ok) {
          console.warn("Failed to save band preset:", result.error);
        }
      }
    },
    [filters.bands, addBandPreset],
  );

  const handleApplyPreset = useCallback(
    (bands: string[]) => {
      updateFilter("bands", [...bands]);
    },
    [updateFilter],
  );

  const handleDeletePreset = useCallback(
    (id: string) => {
      removeBandPreset(id);
    },
    [removeBandPreset],
  );

  const handleContextMenu = useCallback(
    (spot: DXSpot, position: { x: number; y: number }) => {
      setContextMenu({ spot, position });
    },
    [],
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleContextAction = useCallback(
    (action: SpotContextAction, spot: DXSpot) => {
      switch (action) {
        case "setTarget": {
          // Set the spot's location as the map target
          if (spot.dxLat != null && spot.dxLon != null) {
            setTarget({
              lat: spot.dxLat,
              lon: spot.dxLon,
              grid: spot.dxGrid || undefined,
              name: spot.dx,
            });
          } else if (spot.dxGrid) {
            // Fall back to grid conversion
            const coords = gridToLatLon(spot.dxGrid);
            if (coords) {
              setTarget({
                lat: coords.lat,
                lon: coords.lon,
                grid: spot.dxGrid,
                name: spot.dx,
              });
            }
          }
          break;
        }
        case "researchGrid": {
          // Open grid research panel for this grid
          if (spot.dxGrid && onResearchGrid) {
            onResearchGrid(spot.dxGrid);
          }
          break;
        }
        case "watchCallsign": {
          // Add a watch for this callsign
          watchStore.addWatch("callsign", spot.dx, `Callsign: ${spot.dx}`);
          break;
        }
        case "watchGrid": {
          // Add a watch for the grid prefix (e.g., "EM73" from "EM73vk")
          if (spot.dxGrid) {
            const gridPrefix = spot.dxGrid.slice(0, GRID_PREFIX_LENGTH);
            watchStore.addWatch("grid", gridPrefix, `Grid: ${gridPrefix}`);
          }
          break;
        }
        case "copyFrequency": {
          // Copy frequency to clipboard
          const freqKhz = spot.frequency.toFixed(1);
          navigator.clipboard.writeText(freqKhz).catch(console.error);
          break;
        }
        case "copyCallsign": {
          // Copy callsign to clipboard
          navigator.clipboard.writeText(spot.dx).catch(console.error);
          break;
        }
        case "openQRZ": {
          // Open QRZ page for this callsign
          window.open(`https://www.qrz.com/db/${spot.dx}`, "_blank");
          break;
        }
        case "openClubLog": {
          // Open ClubLog search for this callsign
          window.open(`https://clublog.org/logsearch/${spot.dx}`, "_blank");
          break;
        }
        case "hideSpot": {
          // Record the action for undo before hiding
          pushAction({
            type: "HIDE_SPOT",
            spotId: spot.id,
            spotData: spot,
            description: `Hidden spot ${spot.dx} on ${spot.frequency.toFixed(1)} kHz`,
          });
          // Hide this spot from the list
          hideSpot(spot.id);
          break;
        }
      }
    },
    [setTarget, watchStore, hideSpot, onResearchGrid, pushAction],
  );

  return {
    // Data
    displaySpots,
    isLoading,
    isFetching,
    lastUpdated,
    stats,

    // Selection state
    selectedSpot,
    hoveredSpot,
    contextMenu,
    highlightedSpotId,

    // Computed data maps
    workedStatusMap,
    neededStatusMap,
    distanceMap,
    alertMatchSet,

    // Filter state
    filters,
    availableBands,
    availableModes,
    syncMode,
    syncedBand,
    activeBandFilter,

    // Counts
    alertMatchCount: alertMatchSet.size,
    neededCount,
    totalSpots: spots.length,

    // Preferences
    spotAgePrefs,
    bandPresets,

    // Refs
    listContainerRef,

    // Handlers
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
    toggleSyncMode,
    setHoveredSpot,
    refetch,
  };
}

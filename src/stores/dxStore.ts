/**
 * Zustand store for DX Cluster state management
 * Manages spots, filters, and UI state for DX cluster integration
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DXSpot, DXClusterFilters } from "@/types/dxcluster";

/** Primary source for spot data */
export type DXSpotSource = "bridge" | "rest";

/**
 * Live cluster link state, mirrored from the bridge's `cluster.status`
 * broadcast. `null` means the bridge has not reported yet.
 */
export interface ClusterLinkStatus {
  connected: boolean;
  /** Node name the bridge is attached to, when it reports one */
  node?: string;
  spotsReceived: number;
  /** ISO timestamp of the most recent spot */
  lastSpotTime?: string;
}

interface DXState {
  // Spot data
  spots: DXSpot[];
  setSpots: (spots: DXSpot[]) => void;
  addSpot: (spot: DXSpot) => void;
  clearSpots: () => void;

  // Spot source
  spotSource: DXSpotSource;
  setSpotSource: (source: DXSpotSource) => void;

  // Cluster link status (from the bridge)
  clusterStatus: ClusterLinkStatus | null;
  /** Advances on every status report, so a repeat of an identical one is visible. */
  clusterStatusSeq: number;
  setClusterStatus: (status: ClusterLinkStatus | null) => void;

  // Hidden spots (filtered from display)
  hiddenSpotIds: Set<string>;
  hideSpot: (id: string) => void;
  unhideSpot: (id: string) => void;
  clearHiddenSpots: () => void;

  // Filters
  filters: DXClusterFilters;
  setFilters: (filters: DXClusterFilters) => void;
  updateFilter: <K extends keyof DXClusterFilters>(
    key: K,
    value: DXClusterFilters[K],
  ) => void;
  clearFilters: () => void;

  // UI state
  selectedSpot: DXSpot | null;
  setSelectedSpot: (spot: DXSpot | null) => void;
  hoveredSpot: DXSpot | null;
  setHoveredSpot: (spot: DXSpot | null) => void;

  // Display settings
  maxSpots: number;
  setMaxSpots: (max: number) => void;
  showPaths: boolean;
  setShowPaths: (show: boolean) => void;

  // Panel visibility
  isPanelOpen: boolean;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
}

const DEFAULT_FILTERS: DXClusterFilters = {
  bands: [],
  modes: [],
  sources: [],
  maxAge: 30, // 30 minutes default
  searchText: "",
  neededOnly: false,
  sortByNeeded: false,
};

const DEFAULT_MAX_SPOTS = 50;

/** Field-wise equality for cluster status, to suppress redundant updates. */
function sameClusterStatus(
  a: ClusterLinkStatus | null,
  b: ClusterLinkStatus | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.connected === b.connected &&
    a.node === b.node &&
    a.spotsReceived === b.spotsReceived &&
    a.lastSpotTime === b.lastSpotTime
  );
}

// Keys from filters that should be persisted (excluding transient searchText)
type PersistedFilterKeys =
  "bands" | "modes" | "maxAge" | "neededOnly" | "sortByNeeded";
type PersistedFilters = Pick<DXClusterFilters, PersistedFilterKeys>;

interface PersistedState {
  filters: PersistedFilters;
}

export const useDXStore = create<DXState>()(
  persist(
    (set, get) => ({
      // Spot data
      spots: [],
      spotSource: "rest",
      setSpotSource: (source) => set({ spotSource: source }),

      // Cluster link status. `useDXCluster` is mounted by several surfaces at
      // once and every instance sees the same broadcast, so identical updates
      // are dropped rather than re-rendering each subscriber.
      clusterStatus: null,
      clusterStatusSeq: 0,
      setClusterStatus: (status) =>
        set((state) => ({
          // The sequence advances on every report the bridge makes, including
          // one identical to the last. Retrying a bad node yields a byte-for-byte
          // repeat of the previous failure, and a UI waiting on the link has to
          // see that as an answer — otherwise it sits on "Connecting..." until
          // the timeout. The status object itself stays referentially stable so
          // selector-based subscribers still skip the redundant render.
          clusterStatusSeq: state.clusterStatusSeq + 1,
          clusterStatus: sameClusterStatus(state.clusterStatus, status)
            ? state.clusterStatus
            : status,
        })),
      setSpots: (spots) => set({ spots }),
      addSpot: (spot) =>
        set((state) => {
          const newSpots = [spot, ...state.spots];
          // Keep only maxSpots
          newSpots.length = Math.min(newSpots.length, state.maxSpots);
          return { spots: newSpots };
        }),
      clearSpots: () =>
        set({ spots: [], selectedSpot: null, hoveredSpot: null }),

      // Hidden spots
      hiddenSpotIds: new Set<string>(),
      hideSpot: (id) =>
        set((state) => ({
          hiddenSpotIds: new Set([...state.hiddenSpotIds, id]),
        })),
      unhideSpot: (id) =>
        set((state) => {
          const newHidden = new Set(state.hiddenSpotIds);
          newHidden.delete(id);
          return { hiddenSpotIds: newHidden };
        }),
      clearHiddenSpots: () => set({ hiddenSpotIds: new Set<string>() }),

      // Filters
      filters: DEFAULT_FILTERS,
      setFilters: (filters) =>
        set({
          filters: {
            ...filters,
            bands: Array.isArray(filters.bands)
              ? filters.bands.map((band) => band.toLowerCase())
              : filters.bands,
          },
        }),
      updateFilter: (key, value) =>
        set((state) => ({
          filters: {
            ...state.filters,
            [key]:
              key === "bands" && Array.isArray(value)
                ? value.map((band) =>
                    typeof band === "string" ? band.toLowerCase() : band,
                  )
                : value,
          },
        })),
      clearFilters: () => set({ filters: DEFAULT_FILTERS }),

      // UI state
      selectedSpot: null,
      setSelectedSpot: (spot) => set({ selectedSpot: spot }),
      hoveredSpot: null,
      setHoveredSpot: (spot) => set({ hoveredSpot: spot }),

      // Display settings
      maxSpots: DEFAULT_MAX_SPOTS,
      setMaxSpots: (max) => {
        set({ maxSpots: Math.max(10, Math.min(200, max)) });
        // Trim existing spots if needed
        const state = get();
        if (state.spots.length > max) {
          set({ spots: state.spots.slice(0, max) });
        }
      },
      showPaths: false,
      setShowPaths: (show) => set({ showPaths: show }),

      // Panel visibility
      isPanelOpen: false,
      togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
      setPanelOpen: (open) => set({ isPanelOpen: open }),
    }),
    {
      name: "propulse-dx-filters",
      partialize: (state): PersistedState => ({
        filters: {
          bands: state.filters.bands,
          modes: state.filters.modes,
          maxAge: state.filters.maxAge,
          neededOnly: state.filters.neededOnly,
          sortByNeeded: state.filters.sortByNeeded,
        },
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as PersistedState | undefined;
        if (!persisted?.filters) {
          return currentState;
        }
        const bands = Array.isArray(persisted.filters.bands)
          ? persisted.filters.bands.map((band) => band.toLowerCase())
          : DEFAULT_FILTERS.bands;
        return {
          ...currentState,
          filters: {
            ...DEFAULT_FILTERS,
            ...persisted.filters,
            bands,
          },
        };
      },
    },
  ),
);

/**
 * Selector for getting filtered spots count by band
 */
export function selectSpotCountByBand(state: DXState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const spot of state.spots) {
    if (spot.band) {
      counts[spot.band] = (counts[spot.band] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Selector for getting unique modes from current spots
 */
export function selectAvailableModes(state: DXState): string[] {
  const modes = new Set<string>();
  for (const spot of state.spots) {
    if (spot.mode) {
      modes.add(spot.mode);
    }
  }
  return Array.from(modes).sort();
}

/**
 * Selector for getting unique bands from current spots
 */
export function selectAvailableBands(state: DXState): string[] {
  const bands = new Set<string>();
  for (const spot of state.spots) {
    if (spot.band) {
      bands.add(spot.band.toLowerCase());
    }
  }
  // Sort bands by frequency order
  const bandOrder = [
    "160m",
    "80m",
    "60m",
    "40m",
    "30m",
    "20m",
    "17m",
    "15m",
    "12m",
    "10m",
    "6m",
    "2m",
  ];
  return Array.from(bands).sort(
    (a, b) => bandOrder.indexOf(a) - bandOrder.indexOf(b),
  );
}

/**
 * Selector for getting visible spots (excluding hidden ones)
 */
export function selectVisibleSpots(state: DXState): DXSpot[] {
  if (state.hiddenSpotIds.size === 0) {
    return state.spots;
  }
  return state.spots.filter((spot) => !state.hiddenSpotIds.has(spot.id));
}

/**
 * Selector for getting the count of hidden spots
 */
export function selectHiddenSpotCount(state: DXState): number {
  return state.hiddenSpotIds.size;
}

/**
 * Available spot sources for filtering.
 * Note: "WSJT-X" is included for bridge-sourced spots from WSJT-X decodes.
 * The SpotSourceType in dxcluster.ts defines the base types; WSJT-X is
 * additionally supported via the LiveSpot/SpotSource type in livespot.ts.
 */
export const AVAILABLE_SOURCES = [
  "PSKReporter",
  "RBN",
  "Cluster",
  "WSJT-X",
] as const;

/**
 * Zustand store for DX Cluster state management
 * Manages spots, filters, and UI state for DX cluster integration
 */

import { create } from "zustand";
import type { DXSpot, DXClusterFilters } from "@/types/dxcluster";

interface DXState {
  // Spot data
  spots: DXSpot[];
  setSpots: (spots: DXSpot[]) => void;
  addSpot: (spot: DXSpot) => void;
  clearSpots: () => void;

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
};

const DEFAULT_MAX_SPOTS = 50;

export const useDXStore = create<DXState>((set, get) => ({
  // Spot data
  spots: [],
  setSpots: (spots) => set({ spots }),
  addSpot: (spot) =>
    set((state) => {
      const newSpots = [spot, ...state.spots];
      // Keep only maxSpots
      if (newSpots.length > state.maxSpots) {
        newSpots.length = state.maxSpots;
      }
      return { spots: newSpots };
    }),
  clearSpots: () => set({ spots: [], selectedSpot: null, hoveredSpot: null }),

  // Filters
  filters: DEFAULT_FILTERS,
  setFilters: (filters) => set({ filters }),
  updateFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
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
}));

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
      bands.add(spot.band);
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
 * Available spot sources for filtering
 */
export const AVAILABLE_SOURCES = [
  "PSKReporter",
  "RBN",
  "Cluster",
  "Demo",
] as const;

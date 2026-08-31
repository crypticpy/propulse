/**
 * Ephemeral selection state for portable-activation reports.
 *
 * The live feed remains owned by React Query. This store only remembers the
 * report whose station-detail dialog is open, so closing the dialog never
 * mutates or duplicates the underlying POTA/SOTA/WWFF cache.
 */

import { create } from "zustand";
import type { MappableActivationSpot } from "@/lib/map/activationMarkers";

interface ActivationSpotStore {
  selectedSpot: MappableActivationSpot | null;
  selectSpot: (spot: MappableActivationSpot) => void;
  clearSpot: () => void;
}

export const useActivationSpotStore = create<ActivationSpotStore>((set) => ({
  selectedSpot: null,
  selectSpot: (selectedSpot) => set({ selectedSpot }),
  clearSpot: () => set({ selectedSpot: null }),
}));

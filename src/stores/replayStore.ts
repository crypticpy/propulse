/**
 * Replay Store
 *
 * Lightweight ephemeral store that holds replay spots converted to LiveSpot
 * format. PropSphere writes into this store whenever useSpotReplay returns
 * new data; the globe/flat-map views read from it to render sepia-toned
 * historical arcs.
 *
 * Intentionally NOT persisted — replay state is session-only.
 */

import { create } from "zustand";
import type { LiveSpot } from "@/types/livespot";

interface ReplayStore {
  /** Replay spots already converted to LiveSpot format */
  replaySpots: LiveSpot[];
  /** Replace the current set of replay spots */
  setReplaySpots: (spots: LiveSpot[]) => void;
}

/** Stable empty array to prevent unnecessary re-renders when replay is off */
const EMPTY: LiveSpot[] = [];

export const useReplayStore = create<ReplayStore>((set) => ({
  replaySpots: EMPTY,
  setReplaySpots: (spots) => set({ replaySpots: spots.length ? spots : EMPTY }),
}));

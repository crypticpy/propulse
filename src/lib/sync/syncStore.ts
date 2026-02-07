/**
 * Zustand store for UI-facing sync status.
 *
 * Read by useSyncStatus() hook and header/footer sync indicators.
 * Written by SyncManager as sync operations progress.
 */

import { create } from "zustand";
import type { SyncStatus } from "./types";
import { DEFAULT_SYNC_STATUS } from "./types";

interface SyncStoreState {
  status: SyncStatus;
  setStatus: (update: Partial<SyncStatus>) => void;
  reset: () => void;
}

export const useSyncStore = create<SyncStoreState>((set) => ({
  status: { ...DEFAULT_SYNC_STATUS },
  setStatus: (update) =>
    set((state) => ({
      status: { ...state.status, ...update },
    })),
  reset: () => set({ status: { ...DEFAULT_SYNC_STATUS } }),
}));

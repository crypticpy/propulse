/**
 * memoryStore — Zustand persist store for SDR memory channels.
 *
 * Stores frequency/mode/filter presets organized into banks (A-F).
 * Persisted to localStorage. Max 200 memories.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemoryChannel {
  id: string;
  name: string;
  freq: number; // Hz
  mode: string; // "USB", "CW", "FT8", etc.
  filter?: { low: number; high: number };
  antenna?: string;
  bank: string; // "A" through "F"
  color?: string; // optional tag color
  createdAt: string; // ISO timestamp
}

export const MEMORY_BANKS = ["A", "B", "C", "D", "E", "F"] as const;
export type MemoryBank = (typeof MEMORY_BANKS)[number];
export const MAX_MEMORIES = 200;

// ─── Store interface ─────────────────────────────────────────────────────────

interface MemoryState {
  sdrMemories: MemoryChannel[];
  addMemory: (
    channel: Omit<MemoryChannel, "id" | "createdAt">,
  ) => string | null;
  updateMemory: (id: string, updates: Partial<MemoryChannel>) => void;
  removeMemory: (id: string) => void;
  reorderMemory: (id: string, direction: "up" | "down") => void;
  clearBank: (bank: string) => void;
  importMemories: (channels: MemoryChannel[]) => number;
  exportMemories: () => MemoryChannel[];
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useMemoryStore = create<MemoryState>()(
  persist(
    (set, get) => ({
      sdrMemories: [],

      addMemory: (channel) => {
        const { sdrMemories } = get();
        if (sdrMemories.length >= MAX_MEMORIES) return null;
        const id = crypto.randomUUID();
        const entry: MemoryChannel = {
          ...channel,
          id,
          createdAt: new Date().toISOString(),
        };
        set({ sdrMemories: [...sdrMemories, entry] });
        return id;
      },

      updateMemory: (id, updates) => {
        set({
          sdrMemories: get().sdrMemories.map((m) =>
            m.id === id ? { ...m, ...updates, id } : m,
          ),
        });
      },

      removeMemory: (id) => {
        set({ sdrMemories: get().sdrMemories.filter((m) => m.id !== id) });
      },

      reorderMemory: (id, direction) => {
        const list = [...get().sdrMemories];
        const idx = list.findIndex((m) => m.id === id);
        if (idx < 0) return;
        const swap = direction === "up" ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= list.length) return;
        [list[idx], list[swap]] = [list[swap], list[idx]];
        set({ sdrMemories: list });
      },

      clearBank: (bank) => {
        set({ sdrMemories: get().sdrMemories.filter((m) => m.bank !== bank) });
      },

      importMemories: (channels) => {
        const { sdrMemories } = get();
        const space = MAX_MEMORIES - sdrMemories.length;
        if (space <= 0) return 0;
        const toImport = channels.slice(0, space).map((ch) => ({
          ...ch,
          id: crypto.randomUUID(),
          createdAt: ch.createdAt || new Date().toISOString(),
        }));
        set({ sdrMemories: [...sdrMemories, ...toImport] });
        return toImport.length;
      },

      exportMemories: () => get().sdrMemories,
    }),
    {
      name: "propulse-sdr-memories",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ sdrMemories: state.sdrMemories }),
    },
  ),
);

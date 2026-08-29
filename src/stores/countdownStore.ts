/**
 * Zustand store for named countdowns (Dashboard G11).
 *
 * Operators can pin arbitrary events (band openings, license exam dates,
 * QSL deadlines, etc.) as countdowns on the dashboard. Expired items are
 * kept around briefly (so the "ended" state is visible) then auto-pruned.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** How long an ended countdown stays visible before pruneExpired removes it */
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1_000;

export interface NamedCountdown {
  id: string;
  name: string;
  /** ISO 8601 UTC target timestamp */
  targetUtc: string;
  /** ISO 8601 UTC creation timestamp */
  createdAt: string;
}

interface CountdownStore {
  items: NamedCountdown[];

  addCountdown: (name: string, targetUtc: string) => NamedCountdown;
  removeCountdown: (id: string) => void;
  /** Removes countdowns that ended more than 24h ago */
  pruneExpired: () => void;
}

export const useCountdownStore = create<CountdownStore>()(
  persist(
    (set) => ({
      items: [],

      addCountdown: (name, targetUtc) => {
        const created: NamedCountdown = {
          id: crypto.randomUUID(),
          name,
          targetUtc,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ items: [...state.items, created] }));
        return created;
      },

      removeCountdown: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),

      pruneExpired: () =>
        set((state) => {
          const nowMs = Date.now();
          const items = state.items.filter((item) => {
            const targetMs = new Date(item.targetUtc).getTime();
            return nowMs - targetMs < PRUNE_AFTER_MS;
          });
          if (items.length === state.items.length) return state;
          return { items };
        }),
    }),
    {
      name: "propulse-countdowns",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        return state as unknown as CountdownStore;
      },
    },
  ),
);

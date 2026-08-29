/**
 * Zustand store for the World Clocks dashboard widget (G7).
 *
 * Persists which cities (from the WORLD_CITIES reference list) the operator
 * has pinned, and their display order.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { DEFAULT_WORLD_CLOCK_IDS } from "@/lib/data/worldCities";

const MAX_CITIES = 8;

interface WorldClockStore {
  cityIds: string[];

  /** Adds a city by id; no-ops if already present or at the cap */
  addCity: (id: string) => void;
  removeCity: (id: string) => void;
  /** Moves a city up (-1) or down (1) in display order */
  moveCity: (id: string, direction: 1 | -1) => void;
}

export const useWorldClockStore = create<WorldClockStore>()(
  persist(
    (set) => ({
      cityIds: DEFAULT_WORLD_CLOCK_IDS,

      addCity: (id) =>
        set((state) => {
          if (state.cityIds.includes(id) || state.cityIds.length >= MAX_CITIES) {
            return state;
          }
          return { cityIds: [...state.cityIds, id] };
        }),

      removeCity: (id) =>
        set((state) => ({
          cityIds: state.cityIds.filter((cityId) => cityId !== id),
        })),

      moveCity: (id, direction) =>
        set((state) => {
          const index = state.cityIds.indexOf(id);
          if (index === -1) return state;
          const nextIndex = index + direction;
          if (nextIndex < 0 || nextIndex >= state.cityIds.length) return state;

          const cityIds = [...state.cityIds];
          [cityIds[index], cityIds[nextIndex]] = [
            cityIds[nextIndex],
            cityIds[index],
          ];
          return { cityIds };
        }),
    }),
    {
      name: "propulse-world-clocks",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        return state as unknown as WorldClockStore;
      },
    },
  ),
);

/**
 * Sked Store (C21)
 *
 * Manages QSO scheduling with propagation window recommendations.
 * Persists to localStorage via Zustand persist middleware.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkedWindow {
  date: string;
  startHourUTC: number;
  endHourUTC: number;
  band: string;
  confidence: number;
}

export interface Sked {
  id: string;
  targetCallsign: string;
  targetLat?: number;
  targetLon?: number;
  preferredBand: string;
  preferredMode: string;
  dateRange: [string, string];
  recommendedWindows: SkedWindow[];
  status: "active" | "worked" | "missed" | "cancelled";
  createdAt: string;
  reminderFired?: boolean;
  notes?: string;
}

interface SkedState {
  skeds: Sked[];
  addSked: (sked: Omit<Sked, "id" | "createdAt" | "status">) => string | null;
  removeSked: (id: string) => void;
  updateSkedStatus: (id: string, status: Sked["status"]) => void;
  updateSkedWindows: (id: string, windows: SkedWindow[]) => void;
  markReminderFired: (id: string) => void;
  getActiveSkeds: () => Sked[];
  getUpcomingSkeds: () => Sked[];
  getPastSkeds: () => Sked[];
}

const MAX_ACTIVE_SKEDS = 20;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSkedStore = create<SkedState>()(
  persist(
    (set, get) => ({
      skeds: [],

      addSked: (skedData) => {
        const activeCount = get().skeds.filter(
          (s) => s.status === "active",
        ).length;
        if (activeCount >= MAX_ACTIVE_SKEDS) return null;

        const id = `sked-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const sked: Sked = {
          ...skedData,
          id,
          status: "active",
          createdAt: new Date().toISOString(),
        };

        set((state) => ({ skeds: [...state.skeds, sked] }));
        return id;
      },

      removeSked: (id) => {
        set((state) => ({
          skeds: state.skeds.filter((s) => s.id !== id),
        }));
      },

      updateSkedStatus: (id, status) => {
        set((state) => ({
          skeds: state.skeds.map((s) => (s.id === id ? { ...s, status } : s)),
        }));
      },

      updateSkedWindows: (id, windows) => {
        set((state) => ({
          skeds: state.skeds.map((s) =>
            s.id === id ? { ...s, recommendedWindows: windows } : s,
          ),
        }));
      },

      markReminderFired: (id) => {
        set((state) => ({
          skeds: state.skeds.map((s) =>
            s.id === id ? { ...s, reminderFired: true } : s,
          ),
        }));
      },

      getActiveSkeds: () => get().skeds.filter((s) => s.status === "active"),

      getUpcomingSkeds: () => {
        const now = new Date().toISOString();
        return get()
          .skeds.filter(
            (s) => s.status === "active" && s.dateRange[1] >= now.slice(0, 10),
          )
          .sort((a, b) => a.dateRange[0].localeCompare(b.dateRange[0]));
      },

      getPastSkeds: () =>
        get()
          .skeds.filter((s) => s.status !== "active")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }),
    {
      name: "propulse-skeds",
      version: 1,
    },
  ),
);

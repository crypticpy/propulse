/**
 * Zustand store for DXCC entity tracking
 *
 * Tracks which DXCC entities have been worked and confirmed, with
 * per-band and per-mode breakdowns. Persists to localStorage.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  lookupEntity,
  getActiveDXCCCount,
  type DXCCLookupResult,
} from "@/lib/data/dxccEntities";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DXCCBand =
  | "160m"
  | "80m"
  | "60m"
  | "40m"
  | "30m"
  | "20m"
  | "17m"
  | "15m"
  | "12m"
  | "10m"
  | "6m";
export type DXCCMode = "cw" | "ssb" | "digital" | "mixed";

export interface DXCCWorkedEntry {
  /** DXCC entity ID */
  entityId: number;
  /** Band on which entity was worked */
  band: DXCCBand;
  /** Mode used */
  mode: DXCCMode;
  /** Callsign of the station worked */
  callsign: string;
  /** ISO timestamp of when the QSO was made */
  timestamp: string;
  /** Whether QSL confirmation has been received */
  confirmed: boolean;
  /** Confirmation method (e.g., "LoTW", "QSL card", "eQSL") */
  confirmationMethod?: string;
}

export interface DXCCProgress {
  /** Total unique entities worked (any band/mode) */
  totalWorked: number;
  /** Total unique entities confirmed */
  totalConfirmed: number;
  /** Total active DXCC entities */
  totalEntities: number;
  /** Percentage worked */
  percentWorked: number;
  /** Percentage confirmed */
  percentConfirmed: number;
}

export interface DXCCBandProgress {
  band: DXCCBand;
  worked: number;
  confirmed: number;
}

// ─── Store State ────────────────────────────────────────────────────────────

interface DXCCState {
  /** All worked entries (the log) */
  workedEntries: DXCCWorkedEntry[];

  /** Set of entity IDs that have been worked (any band/mode) */
  workedEntityIds: Set<number>;

  /** Set of entity IDs that have been confirmed */
  confirmedEntityIds: Set<number>;

  // ── Actions ──

  /** Mark an entity as worked */
  markWorked: (entry: Omit<DXCCWorkedEntry, "confirmed">) => void;

  /** Mark an entity as confirmed */
  markConfirmed: (
    entityId: number,
    band: DXCCBand,
    mode: DXCCMode,
    method?: string,
  ) => void;

  /** Remove a worked entry */
  removeEntry: (entityId: number, band: DXCCBand, mode: DXCCMode) => void;

  /** Look up a callsign and return entity info */
  lookupCallsign: (callsign: string) => DXCCLookupResult | null;

  /** Check if an entity has been worked */
  isWorked: (entityId: number) => boolean;

  /** Check if an entity has been confirmed */
  isConfirmed: (entityId: number) => boolean;

  /** Check if an entity has been worked on a specific band */
  isWorkedOnBand: (entityId: number, band: DXCCBand) => boolean;

  /** Get overall DXCC progress */
  getProgress: () => DXCCProgress;

  /** Get per-band progress */
  getBandProgress: () => DXCCBandProgress[];

  /** Bulk-mark confirmations from LoTW or other sync sources */
  markBulkConfirmed: (
    confirmations: Array<{
      entityId: number;
      band: DXCCBand;
      mode: DXCCMode;
      method: string;
    }>,
  ) => void;

  /** Rebuild tracking sets from the entries log */
  rebuildFromLog: () => void;

  /** Clear all tracked data */
  clearAll: () => void;
}

// ─── Serialization Helpers ──────────────────────────────────────────────────

interface SerializedDXCCState {
  workedEntries: DXCCWorkedEntry[];
  workedEntityIds: number[];
  confirmedEntityIds: number[];
}

// ─── Store ──────────────────────────────────────────────────────────────────

const ALL_BANDS: DXCCBand[] = [
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
];

export const useDXCCStore = create<DXCCState>()(
  persist(
    (set, get) => ({
      workedEntries: [],
      workedEntityIds: new Set<number>(),
      confirmedEntityIds: new Set<number>(),

      markWorked: (entry) => {
        set((state) => {
          const newEntry: DXCCWorkedEntry = { ...entry, confirmed: false };
          const newWorkedIds = new Set(state.workedEntityIds);
          newWorkedIds.add(entry.entityId);

          return {
            workedEntries: [...state.workedEntries, newEntry],
            workedEntityIds: newWorkedIds,
          };
        });
      },

      markConfirmed: (entityId, band, mode, method) => {
        set((state) => {
          const newConfirmedIds = new Set(state.confirmedEntityIds);
          newConfirmedIds.add(entityId);

          const updatedEntries = state.workedEntries.map((entry) => {
            if (
              entry.entityId === entityId &&
              entry.band === band &&
              entry.mode === mode
            ) {
              return {
                ...entry,
                confirmed: true,
                confirmationMethod: method,
              };
            }
            return entry;
          });

          return {
            workedEntries: updatedEntries,
            confirmedEntityIds: newConfirmedIds,
          };
        });
      },

      removeEntry: (entityId, band, mode) => {
        set((state) => {
          const filteredEntries = state.workedEntries.filter(
            (e) =>
              !(e.entityId === entityId && e.band === band && e.mode === mode),
          );

          // Rebuild sets from remaining entries
          const newWorkedIds = new Set<number>();
          const newConfirmedIds = new Set<number>();
          for (const entry of filteredEntries) {
            newWorkedIds.add(entry.entityId);
            if (entry.confirmed) {
              newConfirmedIds.add(entry.entityId);
            }
          }

          return {
            workedEntries: filteredEntries,
            workedEntityIds: newWorkedIds,
            confirmedEntityIds: newConfirmedIds,
          };
        });
      },

      lookupCallsign: (callsign) => lookupEntity(callsign),

      isWorked: (entityId) => get().workedEntityIds.has(entityId),

      isConfirmed: (entityId) => get().confirmedEntityIds.has(entityId),

      isWorkedOnBand: (entityId, band) =>
        get().workedEntries.some(
          (e) => e.entityId === entityId && e.band === band,
        ),

      getProgress: () => {
        const state = get();
        const totalEntities = getActiveDXCCCount();
        const totalWorked = state.workedEntityIds.size;
        const totalConfirmed = state.confirmedEntityIds.size;

        return {
          totalWorked,
          totalConfirmed,
          totalEntities,
          percentWorked:
            totalEntities > 0
              ? Math.round((totalWorked / totalEntities) * 1000) / 10
              : 0,
          percentConfirmed:
            totalEntities > 0
              ? Math.round((totalConfirmed / totalEntities) * 1000) / 10
              : 0,
        };
      },

      getBandProgress: () => {
        const state = get();
        return ALL_BANDS.map((band) => {
          const bandEntries = state.workedEntries.filter(
            (e) => e.band === band,
          );
          const workedIds = new Set(bandEntries.map((e) => e.entityId));
          const confirmedIds = new Set(
            bandEntries.filter((e) => e.confirmed).map((e) => e.entityId),
          );

          return {
            band,
            worked: workedIds.size,
            confirmed: confirmedIds.size,
          };
        });
      },

      markBulkConfirmed: (confirmations) => {
        set((state) => {
          // Clone entries once for batch mutation
          const updatedEntries = [...state.workedEntries];
          const newConfirmedIds = new Set(state.confirmedEntityIds);

          // Build a lookup map for fast matching: "entityId-band-mode" -> index
          const entryMap = new Map<string, number[]>();
          for (let i = 0; i < updatedEntries.length; i++) {
            const e = updatedEntries[i];
            const key = `${e.entityId}-${e.band}-${e.mode}`;
            const indices = entryMap.get(key);
            if (indices) {
              indices.push(i);
            } else {
              entryMap.set(key, [i]);
            }
          }

          // Apply each confirmation
          for (const conf of confirmations) {
            const key = `${conf.entityId}-${conf.band}-${conf.mode}`;
            const indices = entryMap.get(key);
            if (indices) {
              for (const idx of indices) {
                updatedEntries[idx] = {
                  ...updatedEntries[idx],
                  confirmed: true,
                  confirmationMethod: conf.method,
                };
              }
            }
            newConfirmedIds.add(conf.entityId);
          }

          return {
            workedEntries: updatedEntries,
            confirmedEntityIds: newConfirmedIds,
          };
        });
      },

      rebuildFromLog: () => {
        set((state) => {
          const newWorkedIds = new Set<number>();
          const newConfirmedIds = new Set<number>();

          for (const entry of state.workedEntries) {
            newWorkedIds.add(entry.entityId);
            if (entry.confirmed) {
              newConfirmedIds.add(entry.entityId);
            }
          }

          return {
            workedEntityIds: newWorkedIds,
            confirmedEntityIds: newConfirmedIds,
          };
        });
      },

      clearAll: () => {
        set({
          workedEntries: [],
          workedEntityIds: new Set<number>(),
          confirmedEntityIds: new Set<number>(),
        });
      },
    }),
    {
      name: "propulse-dxcc",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) =>
        ({
          workedEntries: state.workedEntries,
          workedEntityIds: Array.from(state.workedEntityIds),
          confirmedEntityIds: Array.from(state.confirmedEntityIds),
        }) as unknown as Partial<DXCCState>,
      merge: (persisted, current) => {
        const saved = persisted as unknown as SerializedDXCCState | undefined;
        if (!saved) return current;

        return {
          ...current,
          workedEntries: saved.workedEntries ?? [],
          workedEntityIds: new Set(saved.workedEntityIds ?? []),
          confirmedEntityIds: new Set(saved.confirmedEntityIds ?? []),
        };
      },
    },
  ),
);

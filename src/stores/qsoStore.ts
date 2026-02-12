/**
 * Zustand store for QSO logging
 *
 * Wraps IndexedDB CRUD operations (logStore) with reactive Zustand state.
 * Manages form entry, callsign lookup, dupe checking, log viewer,
 * sync conflicts, and undo support.
 *
 * Persists only sticky form defaults, filters, and sort preferences.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  QSOFormState,
  QSOLookupResult,
  QSODupeInfo,
  QSOFilters,
  SyncConflict,
  SyncConflictStatus,
} from "@/types/qso";
import { DEFAULT_QSO_FORM, DEFAULT_QSO_FILTERS } from "@/types/qso";
import type { LogEntry } from "@/lib/db/types";
import {
  addLogEntry,
  getLogEntry,
  updateLogEntry,
  deleteLogEntry,
  getLogEntriesByCallsign,
  getLogEntriesPaginated,
} from "@/lib/db/logStore";
import { getDeviceId } from "@/lib/sync/deviceId";
import { getRSTDefault } from "@/lib/utils/rstDefaults";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QSOStoreState {
  // Form
  form: QSOFormState;
  formDefaults: Partial<QSOFormState>;

  // Lookup
  lookupResult: QSOLookupResult | null;
  lookupLoading: boolean;
  lookupError: string | null;

  // Dupe
  dupeInfo: QSODupeInfo | null;

  // Viewer
  entries: LogEntry[];
  totalCount: number;
  viewerLoading: boolean;
  filters: QSOFilters;
  sortField: string;
  sortDirection: "asc" | "desc";
  selectedIds: Set<string>;

  // Sync
  pendingSyncCount: number;
  conflicts: SyncConflict[];

  // Undo buffer
  _deletedEntry: LogEntry | null;

  // ── Form Actions ──
  setField: <K extends keyof QSOFormState>(
    field: K,
    value: QSOFormState[K],
  ) => void;
  resetForm: () => void;
  setFormDefaults: (defaults: Partial<QSOFormState>) => void;
  applyLookupToForm: (result: QSOLookupResult) => void;

  // ── QSO CRUD ──
  logQSO: () => Promise<string | null>;
  quickLog: (callsign: string) => Promise<string | null>;
  editQSO: (
    id: string,
    updates: Partial<Omit<LogEntry, "id" | "createdAt">>,
  ) => Promise<void>;
  deleteQSO: (id: string) => Promise<void>;
  undoDelete: () => Promise<void>;

  // ── Viewer Actions ──
  loadEntries: (offset?: number, limit?: number) => Promise<void>;
  setFilters: (filters: Partial<QSOFilters>) => void;
  setSort: (field: string, direction: "asc" | "desc") => void;
  selectEntry: (id: string) => void;
  deselectEntry: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;

  // ── Lookup Actions ──
  lookupCallsign: (callsign: string) => Promise<void>;
  clearLookup: () => void;

  // ── Dupe Actions ──
  checkDupe: (callsign: string) => Promise<void>;

  // ── Sync Actions ──
  setPendingSyncCount: (count: number) => void;
  addConflict: (conflict: SyncConflict) => void;
  resolveConflict: (
    conflictId: string,
    resolution: SyncConflictStatus,
    mergedData?: Partial<LogEntry>,
  ) => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Fields that persist across form resets (sticky defaults) */
const STICKY_FIELDS: (keyof QSOFormState)[] = [
  "band",
  "mode",
  "txPower",
  "mySig",
  "mySigInfo",
  "rigSource",
];

/** Build a reset form, keeping sticky defaults */
function buildResetForm(formDefaults: Partial<QSOFormState>): QSOFormState {
  const form = { ...DEFAULT_QSO_FORM };
  for (const field of STICKY_FIELDS) {
    if (field in formDefaults) {
      (form as Record<string, unknown>)[field] =
        formDefaults[field as keyof QSOFormState];
    }
  }
  return form;
}

/** Apply QSO filters to an array of log entries client-side */
function applyFiltersToEntries(
  entries: LogEntry[],
  filters: QSOFilters,
): LogEntry[] {
  let result = entries;

  if (filters.search) {
    const term = filters.search.toUpperCase().trim();
    result = result.filter(
      (e) =>
        e.callsign.toUpperCase().includes(term) ||
        e.name?.toUpperCase().includes(term) ||
        e.qth?.toUpperCase().includes(term) ||
        e.notes?.toUpperCase().includes(term) ||
        e.grid?.toUpperCase().includes(term),
    );
  }

  if (filters.band) {
    result = result.filter((e) => e.band === filters.band);
  }

  if (filters.mode) {
    result = result.filter((e) => e.mode === filters.mode);
  }

  if (filters.dateFrom) {
    result = result.filter((e) => e.date >= filters.dateFrom!);
  }

  if (filters.dateTo) {
    result = result.filter((e) => e.date <= filters.dateTo!);
  }

  if (filters.mySig) {
    result = result.filter((e) => e.mySig === filters.mySig);
  }

  if (filters.contestId) {
    result = result.filter((e) => e.contestId === filters.contestId);
  }

  if (filters.confirmed === true) {
    result = result.filter(
      (e) => e.lotw === true || e.eqsl === true || e.qslRcvd === "Y",
    );
  } else if (filters.confirmed === false) {
    result = result.filter((e) => !e.lotw && !e.eqsl && e.qslRcvd !== "Y");
  }

  // Dupe filter: same callsign + band + mode on same date
  if (filters.dupe === true) {
    const seen = new Map<string, boolean>();
    const dupeKeys = new Set<string>();
    for (const e of result) {
      const key = `${e.callsign}|${e.band}|${e.mode}|${e.date}`;
      if (seen.has(key)) dupeKeys.add(key);
      seen.set(key, true);
    }
    result = result.filter((e) =>
      dupeKeys.has(`${e.callsign}|${e.band}|${e.mode}|${e.date}`),
    );
  } else if (filters.dupe === false) {
    const seen = new Set<string>();
    result = result.filter((e) => {
      const key = `${e.callsign}|${e.band}|${e.mode}|${e.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  return result;
}

/** Sort entries by field and direction */
function sortEntries(
  entries: LogEntry[],
  field: string,
  direction: "asc" | "desc",
): LogEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[field];
    const bVal = (b as unknown as Record<string, unknown>)[field];

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    if (typeof aVal === "string" && typeof bVal === "string") {
      return aVal.localeCompare(bVal);
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return aVal - bVal;
    }
    return String(aVal).localeCompare(String(bVal));
  });

  if (direction === "desc") sorted.reverse();
  return sorted;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useQSOStore = create<QSOStoreState>()(
  persist(
    (set, get) => ({
      // ── Initial State ──
      form: { ...DEFAULT_QSO_FORM },
      formDefaults: {},

      lookupResult: null,
      lookupLoading: false,
      lookupError: null,

      dupeInfo: null,

      entries: [],
      totalCount: 0,
      viewerLoading: false,
      filters: { ...DEFAULT_QSO_FILTERS },
      sortField: "date",
      sortDirection: "desc",
      selectedIds: new Set<string>(),

      pendingSyncCount: 0,
      conflicts: [],

      _deletedEntry: null,

      // ── Form Actions ──

      setField: (field, value) => {
        set((state) => {
          const newForm = { ...state.form, [field]: value };

          // Auto-derive band from frequency when frequency changes
          if (field === "frequency" && typeof value === "number" && value > 0) {
            const derivedBand = bandFromFreq(value);
            if (derivedBand) {
              newForm.band = derivedBand;
            }
          }

          // Auto-fill RST defaults when mode changes
          if (field === "mode" && typeof value === "string" && value) {
            const rstDefault = getRSTDefault(value);
            if (
              !state.form.rstSent ||
              state.form.rstSent === getRSTDefault(state.form.mode)
            ) {
              newForm.rstSent = rstDefault;
            }
            if (
              !state.form.rstRcvd ||
              state.form.rstRcvd === getRSTDefault(state.form.mode)
            ) {
              newForm.rstRcvd = rstDefault;
            }
          }

          return { form: newForm };
        });
      },

      resetForm: () => {
        set((state) => ({
          form: buildResetForm(state.formDefaults),
          lookupResult: null,
          lookupError: null,
          dupeInfo: null,
        }));
      },

      setFormDefaults: (defaults) => {
        set((state) => ({
          formDefaults: { ...state.formDefaults, ...defaults },
        }));
      },

      applyLookupToForm: (result) => {
        set((state) => {
          const updates: Partial<QSOFormState> = {};
          if (result.name) updates.name = result.name;
          if (result.grid) updates.grid = result.grid;
          if (result.qth) updates.qth = result.qth;
          return {
            form: { ...state.form, ...updates },
            lookupResult: result,
          };
        });
      },

      // ── QSO CRUD ──

      logQSO: async () => {
        const state = get();
        const { form } = state;

        // Validate required fields
        const callsign = form.callsign.trim().toUpperCase();
        if (!callsign) {
          return null;
        }

        // Auto-populate date and time from current UTC
        const nowISO = new Date().toISOString();
        const date = nowISO.slice(0, 10);
        const timeOn = nowISO.slice(11, 16);

        // Build LogEntry fields from form state
        const entry: Omit<LogEntry, "id" | "createdAt" | "updatedAt"> = {
          callsign,
          frequency: form.frequency,
          mode: form.mode,
          band:
            form.band ||
            (form.frequency > 0 ? (bandFromFreq(form.frequency) ?? "") : ""),
          date,
          timeOn,
          rstSent: form.rstSent || undefined,
          rstRcvd: form.rstRcvd || undefined,
          grid: form.grid || undefined,
          name: form.name || undefined,
          qth: form.qth || undefined,
          notes: form.notes || undefined,
          txPower: form.txPower ?? undefined,
          mySig: form.mySig || undefined,
          mySigInfo: form.mySigInfo || undefined,
          sig: form.sig || undefined,
          sigInfo: form.sigInfo || undefined,
          contestId: form.contestId || undefined,
          stx: form.stx || undefined,
          srx: form.srx || undefined,
          version: 1,
          lastDeviceId: getDeviceId(),
        };

        // Apply lookup enrichment if available
        const { lookupResult } = state;
        if (lookupResult) {
          if (lookupResult.dxcc) entry.dxcc = lookupResult.dxcc;
          if (lookupResult.country) entry.country = lookupResult.country;
          if (lookupResult.cqZone) entry.cqZone = lookupResult.cqZone;
          if (lookupResult.ituZone) entry.ituZone = lookupResult.ituZone;
        }

        try {
          const id = await addLogEntry(entry);

          // Reset form but keep sticky defaults
          set((s) => ({
            form: buildResetForm(s.formDefaults),
            lookupResult: null,
            lookupError: null,
            dupeInfo: null,
          }));

          return id;
        } catch (err) {
          console.error("[qsoStore] logQSO failed:", err);
          return null;
        }
      },

      quickLog: async (callsign) => {
        const state = get();
        const mode = state.form.mode || state.formDefaults.mode || "SSB";
        const rstDefault = getRSTDefault(mode);

        // Set form fields for quick log
        set((s) => ({
          form: {
            ...s.form,
            callsign: callsign.trim().toUpperCase(),
            mode,
            rstSent: rstDefault,
            rstRcvd: rstDefault,
          },
        }));

        // Now log it
        return get().logQSO();
      },

      editQSO: async (id, updates) => {
        try {
          // Read current entry to get accurate version number
          const current = await getLogEntry(id);
          if (!current) throw new Error(`QSO ${id} not found`);

          await updateLogEntry(id, {
            ...updates,
            version: (current.version ?? 0) + 1,
            lastDeviceId: getDeviceId(),
          });

          // Refresh the viewer entries
          const state = get();
          await state.loadEntries();
        } catch (err) {
          console.error("[qsoStore] editQSO failed:", err);
          throw err;
        }
      },

      deleteQSO: async (id) => {
        try {
          // Read entry first for undo buffer
          const entry = await getLogEntry(id);

          await deleteLogEntry(id);

          set((state) => ({
            _deletedEntry: entry ?? null,
            selectedIds: (() => {
              const next = new Set(state.selectedIds);
              next.delete(id);
              return next;
            })(),
          }));

          // Refresh viewer
          await get().loadEntries();
        } catch (err) {
          console.error("[qsoStore] deleteQSO failed:", err);
          throw err;
        }
      },

      undoDelete: async () => {
        const { _deletedEntry } = get();
        if (!_deletedEntry) return;

        try {
          // Re-insert with original ID preserved via direct put
          const { getDB } = await import("@/lib/db/index");
          const db = await getDB();
          await db.put("logEntries", _deletedEntry);

          set({ _deletedEntry: null });

          // Refresh viewer
          await get().loadEntries();
        } catch (err) {
          console.error("[qsoStore] undoDelete failed:", err);
        }
      },

      // ── Viewer Actions ──

      loadEntries: async (offset = 0, limit = 50) => {
        set({ viewerLoading: true });
        try {
          const { filters, sortField, sortDirection } = get();

          // Get paginated entries from IndexedDB
          const { entries: rawEntries } = await getLogEntriesPaginated(
            0,
            10000,
          );

          // Apply filters client-side
          const filtered = applyFiltersToEntries(rawEntries, filters);

          // Sort
          const sorted = sortEntries(filtered, sortField, sortDirection);

          // Paginate the filtered+sorted result
          const page = sorted.slice(offset, offset + limit);

          set({
            entries: page,
            totalCount: filtered.length,
            viewerLoading: false,
          });
        } catch (err) {
          console.error("[qsoStore] loadEntries failed:", err);
          set({ viewerLoading: false });
        }
      },

      setFilters: (newFilters) => {
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        }));
        // Reload entries with new filters
        get().loadEntries();
      },

      setSort: (field, direction) => {
        set({ sortField: field, sortDirection: direction });
        // Reload entries with new sort
        get().loadEntries();
      },

      selectEntry: (id) => {
        set((state) => {
          const next = new Set(state.selectedIds);
          next.add(id);
          return { selectedIds: next };
        });
      },

      deselectEntry: (id) => {
        set((state) => {
          const next = new Set(state.selectedIds);
          next.delete(id);
          return { selectedIds: next };
        });
      },

      selectAll: () => {
        set((state) => ({
          selectedIds: new Set(state.entries.map((e) => e.id)),
        }));
      },

      deselectAll: () => {
        set({ selectedIds: new Set<string>() });
      },

      // ── Lookup Actions ──

      lookupCallsign: async (callsign) => {
        set({ lookupLoading: true, lookupError: null });
        try {
          const resp = await fetch(
            `/api/callsign/lookup?callsign=${encodeURIComponent(callsign)}`,
          );

          if (!resp.ok) {
            const body = (await resp.json().catch(() => ({}))) as Record<
              string,
              unknown
            >;
            set({
              lookupLoading: false,
              lookupError:
                typeof body.error === "string"
                  ? body.error
                  : `Lookup failed (${resp.status})`,
              lookupResult: null,
            });
            return;
          }

          const data = (await resp.json()) as Record<string, unknown>;
          const result: QSOLookupResult = {
            callsign: String(data.callsign ?? callsign),
            name: data.name ? String(data.name) : undefined,
            grid: data.grid ? String(data.grid) : undefined,
            qth: data.qth ? String(data.qth) : undefined,
            country: data.country ? String(data.country) : undefined,
            dxcc: typeof data.dxcc === "number" ? data.dxcc : undefined,
            cqZone: typeof data.cqZone === "number" ? data.cqZone : undefined,
            ituZone:
              typeof data.ituZone === "number" ? data.ituZone : undefined,
            lat: typeof data.lat === "number" ? data.lat : undefined,
            lon: typeof data.lon === "number" ? data.lon : undefined,
            imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
            source: (data.source as QSOLookupResult["source"]) ?? "callook",
          };

          set({
            lookupResult: result,
            lookupLoading: false,
            lookupError: null,
          });
        } catch (err) {
          set({
            lookupLoading: false,
            lookupError: err instanceof Error ? err.message : "Lookup failed",
            lookupResult: null,
          });
        }
      },

      clearLookup: () => {
        set({
          lookupResult: null,
          lookupLoading: false,
          lookupError: null,
          dupeInfo: null,
        });
      },

      // ── Dupe Actions ──

      checkDupe: async (callsign) => {
        try {
          const { form } = get();
          const entries = await getLogEntriesByCallsign(callsign);

          if (entries.length === 0) {
            set({ dupeInfo: null });
            return;
          }

          const today = new Date().toISOString().slice(0, 10);
          const currentBand = form.band;
          const currentMode = form.mode;

          // Check for exact dupe: same callsign + band + mode on same date
          const isDupe = entries.some(
            (e) =>
              e.band === currentBand &&
              e.mode === currentMode &&
              e.date === today,
          );

          const workedBands = [
            ...new Set(entries.map((e) => e.band).filter(Boolean)),
          ];
          const workedModes = [
            ...new Set(entries.map((e) => e.mode).filter(Boolean)),
          ];

          const previousContacts = entries
            .map((e) => ({
              date: e.date,
              band: e.band,
              mode: e.mode,
              rstSent: e.rstSent,
            }))
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 10);

          set({
            dupeInfo: {
              isDupe,
              previousContacts,
              workedBands,
              workedModes,
            },
          });
        } catch (err) {
          console.error("[qsoStore] checkDupe failed:", err);
        }
      },

      // ── Sync Actions ──

      setPendingSyncCount: (count) => {
        set({ pendingSyncCount: count });
      },

      addConflict: (conflict) => {
        set((state) => ({
          conflicts: [...state.conflicts, conflict],
        }));
      },

      resolveConflict: async (conflictId, resolution, mergedData) => {
        const conflict = get().conflicts.find((c) => c.id === conflictId);
        if (!conflict) return;

        try {
          // Apply the resolution to IndexedDB
          if (
            resolution === "resolved_remote" ||
            resolution === "resolved_merged"
          ) {
            const dataToApply =
              resolution === "resolved_merged"
                ? mergedData
                : conflict.remoteData;

            if (dataToApply) {
              const current = await getLogEntry(conflict.entryId);
              if (current) {
                await updateLogEntry(conflict.entryId, {
                  ...dataToApply,
                  version: (current.version ?? 0) + 1,
                  lastDeviceId: getDeviceId(),
                });
              }
            }
          } else if (resolution === "resolved_local") {
            // Keep local data but bump version to mark as resolved
            const current = await getLogEntry(conflict.entryId);
            if (current) {
              await updateLogEntry(conflict.entryId, {
                version: (current.version ?? 0) + 1,
                lastDeviceId: getDeviceId(),
              });
            }
          }

          // Remove conflict from state
          set((state) => ({
            conflicts: state.conflicts.filter((c) => c.id !== conflictId),
          }));

          // Refresh viewer
          await get().loadEntries();
        } catch (err) {
          console.error("[qsoStore] resolveConflict failed:", err);
        }
      },
    }),
    {
      name: "propulse-qso",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        formDefaults: state.formDefaults,
        filters: state.filters,
        sortField: state.sortField,
        sortDirection: state.sortDirection,
      }),
    },
  ),
);

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
  OperatingMode,
} from "@/types/qso";
import { DEFAULT_QSO_FORM, DEFAULT_QSO_FILTERS } from "@/types/qso";
import { useProfileStore } from "@/stores/profileStore";
import type { LogEntry } from "@/lib/db/types";
import {
  addLogEntry,
  getLogEntry,
  updateLogEntry,
  deleteLogEntry,
  getLogEntriesByCallsign,
  getLogEntriesPaginated,
} from "@/lib/db/logStore";
import { getDB } from "@/lib/db/index";
import { currentStationLogStamp } from "@/lib/station/stationLogStamp";
import { pickChainForActivation } from "@/lib/station/stationKit";
import { useShackStore } from "@/stores/shackStore";
import { getDeviceId } from "@/lib/sync/deviceId";
import { getRSTDefault } from "@/lib/utils/rstDefaults";
import { bandFromFreq } from "@/lib/utils/bandFromFreq";
import { useContestStore } from "@/stores/contestStore";

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

  // Operating mode
  operatingMode: OperatingMode;
  nextSerialNumber: number;

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
  quickLog: (
    callsign: string,
    overrides?: {
      mode?: string;
      band?: string;
      frequency?: number;
      grid?: string;
      snr?: number;
    },
  ) => Promise<string | null>;
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
  lookupCallsign: (
    callsign: string,
    options?: { preserveGrid?: boolean },
  ) => Promise<void>;
  clearLookup: () => void;

  // ── Dupe Actions ──
  checkDupe: (callsign: string) => Promise<void>;

  // ── Band Map Actions ──
  setFromSpot: (spot: {
    callsign: string;
    frequency: number;
    mode: string;
  }) => void;

  // ── Operating Mode Actions ──
  setOperatingMode: (mode: OperatingMode) => void;
  initializeFromProfile: () => void;

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
  "contestId",
  "stx",
  "fieldDayClass",
  "fieldDaySection",
  "chainId",
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

// Every lookup receives a generation, not just a callsign. This matters when
// two requests target the same station with different policies (for example an
// ordinary lookup followed by a portable activation that must preserve grid).
let callsignLookupGeneration = 0;
let authoritativeGridCallsign: string | null = null;

/** Whether a callsign still owns the portable grid currently in the draft. */
export function shouldPreserveLookupGrid(callsign: string): boolean {
  return authoritativeGridCallsign === callsign.trim().toUpperCase();
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

      operatingMode: "general" as OperatingMode,
      nextSerialNumber: 1,

      // ── Form Actions ──

      setField: (field, value) => {
        set((state) => {
          const newForm = { ...state.form, [field]: value };
          const callsignChanged =
            field === "callsign" &&
            String(value).trim().toUpperCase() !==
              state.form.callsign.trim().toUpperCase();
          const changedPreparedActivation =
            callsignChanged &&
            shouldPreserveLookupGrid(state.form.callsign);

          // A portable grid belongs to the activator that supplied it. Any
          // actual callsign edit invalidates that ownership immediately, even
          // if the operator changes back before the debounce starts a lookup.
          if (callsignChanged) {
            callsignLookupGeneration += 1;
            authoritativeGridCallsign = null;
            newForm.name = "";
            newForm.qth = "";
            newForm.grid = "";
            newForm.sig = "";
            newForm.sigInfo = "";
            // Notes prepared from an activation report also belong to that
            // activator. Preserve ordinary free-form notes on normal drafts.
            if (changedPreparedActivation) newForm.notes = "";
          }

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

          return callsignChanged
            ? {
                form: newForm,
                lookupResult: null,
                lookupLoading: false,
                lookupError: null,
                dupeInfo: null,
              }
            : { form: newForm };
        });
      },

      resetForm: () => {
        callsignLookupGeneration += 1;
        authoritativeGridCallsign = null;
        set((state) => ({
          form: buildResetForm(state.formDefaults),
          lookupResult: null,
          lookupLoading: false,
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

        // Build LogEntry fields from form state + live Ham Shack stamp
        const stamp = currentStationLogStamp({
          powerOverride: form.txPower,
          chainIdOverride: form.chainId || undefined,
        });
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
          txPower: form.txPower ?? stamp.txPower ?? undefined,
          myRig: stamp.myRig,
          myAntenna: stamp.myAntenna,
          myGrid: stamp.myGrid,
          chainId: stamp.chainId,
          radioId: stamp.radioId,
          antennaId: stamp.antennaId,
          stationCallsign: stamp.stationCallsign,
          mySig: form.mySig || undefined,
          mySigInfo: form.mySigInfo || undefined,
          sig: form.sig || undefined,
          sigInfo: form.sigInfo || undefined,
          contestId:
            state.operatingMode === "contest"
              ? (useContestStore.getState().activeSession?.id ??
                  form.contestId) ||
                undefined
              : form.contestId || undefined,
          stx: form.stx || undefined,
          srx: form.srx || undefined,
          // Field Day: compose class+section into stxString for ADIF compatibility
          stxString:
            form.fieldDayClass && form.fieldDaySection
              ? `${form.fieldDayClass} ${form.fieldDaySection}`
              : undefined,
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

          // Auto-increment serial if current stx is numeric
          const stxNum = parseInt(form.stx, 10);
          const nextStx = !isNaN(stxNum) ? String(stxNum + 1) : form.stx;

          // Update next serial and reset form with sticky defaults
          set((s) => {
            const newDefaults = { ...s.formDefaults };
            if (!isNaN(stxNum)) {
              newDefaults.stx = nextStx;
            }
            return {
              form: buildResetForm(newDefaults),
              formDefaults: newDefaults,
              lookupResult: null,
              lookupError: null,
              dupeInfo: null,
              nextSerialNumber: !isNaN(stxNum)
                ? stxNum + 1
                : s.nextSerialNumber,
            };
          });

          return id;
        } catch (err) {
          console.error("[qsoStore] logQSO failed:", err);
          return null;
        }
      },

      quickLog: async (callsign, overrides) => {
        const state = get();
        const mode =
          overrides?.mode ||
          state.form.mode ||
          state.formDefaults.mode ||
          "SSB";
        const rstDefault = getRSTDefault(mode);

        // For FT8/FT4, format SNR as RST (e.g., +05 → "+05", -15 → "-15")
        const formatFt8Rst = (snr: number) =>
          snr >= 0
            ? `+${String(snr).padStart(2, "0")}`
            : String(snr).padStart(3, "0");
        const rstSent =
          overrides?.snr != null ? formatFt8Rst(overrides.snr) : rstDefault;
        const rstRcvd =
          overrides?.snr != null ? formatFt8Rst(overrides.snr) : rstDefault;

        // Set form fields for quick log
        set((s) => ({
          form: {
            ...s.form,
            callsign: callsign.trim().toUpperCase(),
            mode,
            band: overrides?.band || s.form.band,
            frequency: overrides?.frequency ?? s.form.frequency,
            grid: overrides?.grid || s.form.grid,
            rstSent,
            rstRcvd,
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

      lookupCallsign: async (callsign, options) => {
        const requestedCallsign = callsign.trim().toUpperCase();
        const requestGeneration = ++callsignLookupGeneration;
        authoritativeGridCallsign = options?.preserveGrid
          ? requestedCallsign
          : null;
        set({
          lookupLoading: true,
          lookupError: null,
        });
        try {
          const { lookupQSOCallsign } = await import("@/lib/api/qsoCallsignLookup");
          const result = await lookupQSOCallsign(requestedCallsign);

          // Apply lookup data to form and store result
          const formUpdates: Partial<QSOFormState> = {};
          if (result.name) formUpdates.name = result.name;
          // A portable-activation report identifies the contact site more
          // precisely than the operator's profile/home grid. Callers carrying
          // that authoritative report can still enrich identity fields without
          // silently moving the station before the QSO is reviewed.
          if (result.grid && !options?.preserveGrid) {
            formUpdates.grid = result.grid;
          }
          if (result.qth) formUpdates.qth = result.qth;

          set((s) => ({
            ...(requestGeneration === callsignLookupGeneration &&
            s.form.callsign.trim().toUpperCase() === requestedCallsign
              ? {
                  lookupResult: result,
                  lookupLoading: false,
                  lookupError: null,
                  form: { ...s.form, ...formUpdates },
                }
              : {}),
          }));
        } catch (err) {
          set((state) =>
            requestGeneration === callsignLookupGeneration &&
            state.form.callsign.trim().toUpperCase() === requestedCallsign
              ? {
                  lookupLoading: false,
                  lookupError:
                    err instanceof Error ? err.message : "Lookup failed",
                  lookupResult: null,
                }
              : {},
          );
        }
      },

      clearLookup: () => {
        callsignLookupGeneration += 1;
        authoritativeGridCallsign = null;
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

      // ── Band Map Actions ──

      setFromSpot: (spot) => {
        const { setField } = get();
        setField("callsign", spot.callsign);
        setField("frequency", spot.frequency);
        setField("mode", spot.mode);
      },

      // ── Operating Mode Actions ──

      setOperatingMode: (mode) => {
        set({ operatingMode: mode });
        // Auto-set mySig for activation modes
        const mySigMap: Record<OperatingMode, string> = {
          general: "",
          pota: "POTA",
          sota: "SOTA",
          contest: "",
          fieldday: "",
        };
        const mySig = mySigMap[mode];
        set((s) => {
          const updates: Partial<QSOFormState> = { mySig };
          // Field Day: auto-set contestId to ARRL-FD
          if (mode === "fieldday" && !s.form.contestId) {
            updates.contestId = "ARRL-FD";
          }
          return {
            form: { ...s.form, ...updates },
            formDefaults: { ...s.formDefaults, mySig },
          };
        });
      },

      initializeFromProfile: () => {
        const profileState = useProfileStore.getState();

        const defaults: Partial<QSOFormState> = {};
        const stamp = currentStationLogStamp();
        if (stamp.txPower != null) {
          defaults.txPower = stamp.txPower;
        }

        // Resolve active location from profile
        const station = profileState.station;
        if (station) {
          const activeLocId =
            station.activeLocationId ?? station.homeLocationId;
          const activeLocation = station.savedLocations.find(
            (loc) => loc.id === activeLocId,
          );

          // Activation refs from active location
          if (activeLocation) {
            if (
              activeLocation.type === "pota" &&
              activeLocation.activationRef
            ) {
              defaults.mySig = "POTA";
              defaults.mySigInfo = activeLocation.activationRef;
            } else if (
              activeLocation.type === "sota" &&
              activeLocation.activationRef
            ) {
              defaults.mySig = "SOTA";
              defaults.mySigInfo = activeLocation.activationRef;
            }
          }
        }

        const shack = useShackStore.getState();
        const pickedChainId = pickChainForActivation(
          shack.stationChains,
          shack.activeChainId,
          defaults.mySig,
        );
        if (defaults.mySig && pickedChainId) {
          defaults.chainId = pickedChainId;
        }

        set((s) => ({
          formDefaults: { ...s.formDefaults, ...defaults },
          form: { ...s.form, ...defaults },
        }));
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
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // The in-progress draft is shared with PropSphere's docked/secondary
        // workspace. Saving still goes through logQSO and the IndexedDB log.
        form: state.form,
        formDefaults: state.formDefaults,
        filters: state.filters,
        sortField: state.sortField,
        sortDirection: state.sortDirection,
        operatingMode: state.operatingMode,
        nextSerialNumber: state.nextSerialNumber,
      }),
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown>;
        return {
          ...state,
          ...(version < 2
            ? { operatingMode: "general", nextSerialNumber: 1 }
            : {}),
          // Older versions intentionally did not persist drafts. Hydrating a
          // complete default keeps the new cross-window form schema explicit.
          ...(version < 3 ? { form: { ...DEFAULT_QSO_FORM } } : {}),
          ...(version < 4
            ? {
                form: {
                  ...DEFAULT_QSO_FORM,
                  ...((state.form as object | undefined) ?? {}),
                  chainId:
                    typeof (state.form as { chainId?: unknown } | undefined)
                      ?.chainId === "string"
                      ? (state.form as { chainId: string }).chainId
                      : "",
                },
              }
            : {}),
        };
      },
    },
  ),
);

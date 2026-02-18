/**
 * Zustand store for FT8/FT4 session state.
 *
 * Central orchestration store that tracks the operator's FT8 session:
 * callsign, grid, current band, TX state, QSO in progress, monitoring
 * mode, alert rules, and session statistics.
 *
 * Persists to localStorage so sessions survive page reloads.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { FT8TxMessage } from "@/lib/ft8/ft8TxTypes";
import { useSettingsStore } from "@/stores/settingsStore";

// ─── Types ──────────────────────────────────────────────────────────────────

/** An FT8 QSO in progress */
export interface Ft8ActiveQso {
  /** Remote station callsign */
  callsign: string;
  /** Remote station grid (if known) */
  grid?: string;
  /** Signal report sent to them */
  reportSent?: string;
  /** Signal report received from them */
  reportReceived?: string;
  /** QSO start time (ISO) */
  startedAt: string;
  /** Auto-sequence stage */
  stage: FT8TxMessage["type"] | "IDLE";
}

/** Completed FT8 QSO record for logging */
export interface Ft8QsoRecord {
  callsign: string;
  grid?: string;
  band: string;
  frequency: number;
  mode: "FT8" | "FT4";
  reportSent: string;
  reportReceived: string;
  startTime: string;
  endTime: string;
  /** DXCC entity ID */
  dxcc?: number;
  country?: string;
  continent?: string;
  cqZone?: number;
  ituZone?: number;
}

/** Configurable FT8 alert rule */
export interface Ft8AlertRule {
  id: string;
  type:
    | "new_dxcc"
    | "new_grid"
    | "new_state"
    | "specific_callsign"
    | "specific_dxcc"
    | "snr_above";
  /** Value for specific_callsign, specific_dxcc, or snr_above threshold */
  value?: string | number;
  enabled: boolean;
  soundEnabled: boolean;
  notificationEnabled: boolean;
}

/** Session-lifetime statistics */
export interface Ft8SessionStats {
  totalDecodes: number;
  uniqueCallsigns: number;
  uniqueCountries: number;
  uniqueGrids: number;
  qsosCompleted: number;
  bestDxKm: number;
  bestDxCallsign: string;
  sessionStartedAt: string | null;
}

// ─── Store State ────────────────────────────────────────────────────────────

interface Ft8SessionState {
  // Session identity
  myCallsign: string;
  myGrid: string;

  // Current operation
  currentBand: string | null;
  currentDialFreqHz: number | null;

  // TX state
  txEnabled: boolean;
  txEven: boolean;
  txFreqHz: number;
  autoSequence: boolean;

  // QSO tracking
  activeQso: Ft8ActiveQso | null;

  // Monitoring
  monitoringMode: "active" | "background";
  alertRules: Ft8AlertRule[];

  // Statistics
  sessionStats: Ft8SessionStats;

  // Worked tracking (session-scoped, not persisted)
  workedThisSession: Record<string, Ft8QsoRecord>;

  // Modes
  foxHoundMode: "off" | "hound";
  contestMode: boolean;
  contestTemplateId: string;
}

interface Ft8SessionActions {
  // Session lifecycle
  startSession: (callsign: string, grid: string) => void;
  endSession: () => void;

  // Band navigation
  setCurrentBand: (band: string, dialFreqHz: number) => void;

  // TX control
  setTxEnabled: (enabled: boolean) => void;
  setTxEven: (even: boolean) => void;
  setTxFreqHz: (hz: number) => void;
  setAutoSequence: (enabled: boolean) => void;

  // QSO management
  startQso: (callsign: string, grid?: string) => void;
  updateQsoStage: (stage: FT8TxMessage["type"] | "IDLE") => void;
  updateQsoReports: (sent?: string, received?: string) => void;
  completeQso: () => Ft8QsoRecord | null;
  cancelQso: () => void;

  // Monitoring
  setMonitoringMode: (mode: "active" | "background") => void;
  addAlertRule: (rule: Ft8AlertRule) => void;
  removeAlertRule: (id: string) => void;
  toggleAlertRule: (id: string) => void;

  // Statistics
  updateStats: (partial: Partial<Ft8SessionStats>) => void;
  recordDecode: (
    callsign: string,
    country?: string,
    grid?: string,
    distanceKm?: number,
  ) => void;

  // Modes
  setFoxHoundMode: (mode: "off" | "hound") => void;
  setContestMode: (enabled: boolean, templateId?: string) => void;
}

type Ft8SessionStore = Ft8SessionState & Ft8SessionActions;

// ─── Defaults ───────────────────────────────────────────────────────────────

const defaultStats: Ft8SessionStats = {
  totalDecodes: 0,
  uniqueCallsigns: 0,
  uniqueCountries: 0,
  uniqueGrids: 0,
  qsosCompleted: 0,
  bestDxKm: 0,
  bestDxCallsign: "",
  sessionStartedAt: null,
};

const defaultState: Ft8SessionState = {
  myCallsign: "",
  myGrid: "",
  currentBand: null,
  currentDialFreqHz: null,
  txEnabled: false,
  txEven: true,
  txFreqHz: 1500,
  autoSequence: true,
  activeQso: null,
  monitoringMode: "active",
  alertRules: [],
  sessionStats: defaultStats,
  workedThisSession: {},
  foxHoundMode: "off",
  contestMode: false,
  contestTemplateId: "",
};

// ─── Tracking sets (not persisted, rebuilt at runtime) ──────────────────────

const seenCallsigns = new Set<string>();
const seenCountries = new Set<string>();
const seenGrids = new Set<string>();

// ─── Store ──────────────────────────────────────────────────────────────────

export const useFt8SessionStore = create<Ft8SessionStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      startSession: (callsign, grid) => {
        seenCallsigns.clear();
        seenCountries.clear();
        seenGrids.clear();
        set({
          myCallsign: callsign.toUpperCase(),
          myGrid: grid.toUpperCase(),
          sessionStats: {
            ...defaultStats,
            sessionStartedAt: new Date().toISOString(),
          },
          workedThisSession: {},
          activeQso: null,
        });
      },

      endSession: () => {
        seenCallsigns.clear();
        seenCountries.clear();
        seenGrids.clear();
        set({
          txEnabled: false,
          activeQso: null,
          sessionStats: {
            ...get().sessionStats,
            sessionStartedAt: null,
          },
        });
      },

      setCurrentBand: (band, dialFreqHz) =>
        set({ currentBand: band, currentDialFreqHz: dialFreqHz }),

      setTxEnabled: (enabled) => set({ txEnabled: enabled }),

      setTxEven: (even) => set({ txEven: even }),

      setTxFreqHz: (hz) => set({ txFreqHz: Math.max(200, Math.min(3000, hz)) }),

      setAutoSequence: (enabled) => set({ autoSequence: enabled }),

      startQso: (callsign, grid) =>
        set({
          activeQso: {
            callsign: callsign.toUpperCase(),
            grid: grid?.toUpperCase(),
            startedAt: new Date().toISOString(),
            stage: "IDLE",
          },
        }),

      updateQsoStage: (stage) =>
        set((s) =>
          s.activeQso ? { activeQso: { ...s.activeQso, stage } } : s,
        ),

      updateQsoReports: (sent, received) =>
        set((s) => {
          if (!s.activeQso) return s;
          return {
            activeQso: {
              ...s.activeQso,
              ...(sent != null ? { reportSent: sent } : {}),
              ...(received != null ? { reportReceived: received } : {}),
            },
          };
        }),

      completeQso: () => {
        const s = get();
        if (!s.activeQso) return null;

        const record: Ft8QsoRecord = {
          callsign: s.activeQso.callsign,
          grid: s.activeQso.grid,
          band: s.currentBand ?? "unknown",
          frequency: s.currentDialFreqHz ?? 0,
          mode:
            (useSettingsStore.getState().sdrFt8Mode as "FT8" | "FT4") ?? "FT8",
          reportSent: s.activeQso.reportSent ?? "",
          reportReceived: s.activeQso.reportReceived ?? "",
          startTime: s.activeQso.startedAt,
          endTime: new Date().toISOString(),
        };

        const newWorked = { ...s.workedThisSession };
        newWorked[record.callsign] = record;

        set({
          activeQso: null,
          workedThisSession: newWorked,
          sessionStats: {
            ...s.sessionStats,
            qsosCompleted: s.sessionStats.qsosCompleted + 1,
          },
        });

        return record;
      },

      cancelQso: () => set({ activeQso: null }),

      setMonitoringMode: (mode) => set({ monitoringMode: mode }),

      addAlertRule: (rule) =>
        set((s) => ({ alertRules: [...s.alertRules, rule] })),

      removeAlertRule: (id) =>
        set((s) => ({
          alertRules: s.alertRules.filter((r) => r.id !== id),
        })),

      toggleAlertRule: (id) =>
        set((s) => ({
          alertRules: s.alertRules.map((r) =>
            r.id === id ? { ...r, enabled: !r.enabled } : r,
          ),
        })),

      updateStats: (partial) =>
        set((s) => ({
          sessionStats: { ...s.sessionStats, ...partial },
        })),

      recordDecode: (callsign, country, grid, distanceKm) => {
        if (callsign) seenCallsigns.add(callsign.toUpperCase());
        if (country) seenCountries.add(country);
        if (grid) seenGrids.add(grid.substring(0, 4).toUpperCase());

        set((s) => {
          const stats = { ...s.sessionStats };
          stats.totalDecodes += 1;
          stats.uniqueCallsigns = seenCallsigns.size;
          stats.uniqueCountries = seenCountries.size;
          stats.uniqueGrids = seenGrids.size;

          if (distanceKm != null && distanceKm > stats.bestDxKm) {
            stats.bestDxKm = distanceKm;
            stats.bestDxCallsign = callsign?.toUpperCase() ?? "";
          }

          return { sessionStats: stats };
        });
      },

      setFoxHoundMode: (mode) => set({ foxHoundMode: mode }),

      setContestMode: (enabled, templateId) =>
        set({
          contestMode: enabled,
          ...(templateId != null ? { contestTemplateId: templateId } : {}),
        }),
    }),
    {
      name: "propulse-ft8-session",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        myCallsign: state.myCallsign,
        myGrid: state.myGrid,
        currentBand: state.currentBand,
        currentDialFreqHz: state.currentDialFreqHz,
        txFreqHz: state.txFreqHz,
        autoSequence: state.autoSequence,
        monitoringMode: state.monitoringMode,
        alertRules: state.alertRules,
        foxHoundMode: state.foxHoundMode,
        contestMode: state.contestMode,
        contestTemplateId: state.contestTemplateId,
      }),
    },
  ),
);

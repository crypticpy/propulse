/**
 * Zustand store for managing active contest sessions
 * Persists to localStorage with key 'propulse-contest'
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Maximum number of sessions to keep in history */
const MAX_SESSION_HISTORY = 10;

/**
 * Multiplier types supported by contests
 */
export type MultiplierType =
  | "state"
  | "country"
  | "dxcc"
  | "zone"
  | "grid"
  | "prefix";

/**
 * Contest category configuration
 */
export interface ContestCategories {
  operator: "single-op" | "multi-op";
  power: "qrp" | "low" | "high";
  mode: "cw" | "ssb" | "digital" | "mixed";
  band: "all" | "single";
  overlay?: string;
}

/**
 * Individual QSO logged during a contest
 */
export interface ContestQSO {
  id: string;
  timestamp: string;
  callsign: string;
  band: string;
  mode: string;
  rstSent: string;
  rstReceived: string;
  exchangeSent: string;
  exchangeReceived: string;
  serialSent?: number;
  serialReceived?: number;
  multipliers?: string[];
  points: number;
  isMultiplier: boolean;
}

/**
 * Multiplier tracking entry
 */
export interface MultiplierEntry {
  type: MultiplierType;
  value: string;
  band?: string;
  timestamp: string;
}

/**
 * Contest session state
 */
export interface ContestSession {
  id: string;
  contestId: string;
  myExchange: string;
  categories: ContestCategories;
  startTime: string;
  endTime?: string;
  isActive: boolean;
  qsos: ContestQSO[];
  currentSerial: number;
  multipliers: MultiplierEntry[];
  totalPoints: number;
  totalMultipliers: number;
  totalScore: number;
}

/**
 * Score breakdown structure
 */
export interface ScoreBreakdown {
  qsoPoints: number;
  multipliers: number;
  total: number;
}

/**
 * Contest store state and actions
 */
interface ContestStore {
  /** Current active contest session */
  activeSession: ContestSession | null;
  /** History of past sessions (max 10) */
  sessionHistory: ContestSession[];

  // Session management
  /** Start a new contest session */
  startContest: (
    contestId: string,
    myExchange: string,
    categories: ContestCategories,
  ) => void;
  /** End the current contest session */
  endContest: () => void;

  // QSO management
  /** Log a new QSO to the active session */
  logQSO: (qso: ContestQSO) => void;
  /** Increment and return the next serial number */
  incrementSerial: () => number;

  // Multiplier tracking
  /** Add a multiplier, returns true if it's a new multiplier */
  addMultiplier: (
    type: MultiplierType,
    value: string,
    band?: string,
  ) => boolean;
  /** Check if a multiplier has been worked */
  isMultiplierWorked: (
    type: MultiplierType,
    value: string,
    band?: string,
  ) => boolean;

  // Score calculation
  /** Recalculate and update the session score */
  updateScore: () => void;
  /** Get detailed score breakdown */
  getScoreBreakdown: () => ScoreBreakdown;

  // Dupe checking
  /** Check if a callsign+band+mode combination is a dupe */
  isDupe: (callsign: string, band: string, mode: string) => boolean;
  /** Get set of all worked callsigns */
  getWorkedCallsigns: () => Set<string>;
}

/**
 * Generate a unique dupe key string
 */
function makeDupeKey(callsign: string, band: string, mode: string): string {
  return `${callsign.toUpperCase()}|${band.toUpperCase()}|${mode.toUpperCase()}`;
}

/**
 * Generate a unique multiplier key string
 */
function makeMultiplierKey(
  type: MultiplierType,
  value: string,
  band?: string,
): string {
  const base = `${type}|${value.toUpperCase()}`;
  return band ? `${base}|${band.toUpperCase()}` : base;
}

/**
 * Contest session store with localStorage persistence
 *
 * @example
 * ```tsx
 * const { activeSession, startContest, logQSO } = useContestStore();
 *
 * // Start a new contest
 * startContest('ARRL-FIELD-DAY', '2A ENY', {
 *   operator: 'multi-op',
 *   power: 'low',
 *   mode: 'mixed',
 *   band: 'all'
 * });
 *
 * // Log a QSO
 * logQSO({
 *   id: crypto.randomUUID(),
 *   timestamp: new Date().toISOString(),
 *   callsign: 'W1AW',
 *   band: '20m',
 *   mode: 'SSB',
 *   rstSent: '59',
 *   rstReceived: '59',
 *   exchangeSent: '2A ENY',
 *   exchangeReceived: '1D CT',
 *   points: 1,
 *   isMultiplier: true
 * });
 * ```
 */
export const useContestStore = create<ContestStore>()(
  persist(
    (set, get) => ({
      activeSession: null,
      sessionHistory: [],

      startContest: (contestId, myExchange, categories) => {
        const now = new Date().toISOString();

        const newSession: ContestSession = {
          id: crypto.randomUUID(),
          contestId,
          myExchange,
          categories,
          startTime: now,
          isActive: true,
          qsos: [],
          currentSerial: 1,
          multipliers: [],
          totalPoints: 0,
          totalMultipliers: 0,
          totalScore: 0,
        };

        set((state) => {
          let updatedHistory = [...state.sessionHistory];

          // If there's an active session, end it and add to history
          if (state.activeSession) {
            const endedSession: ContestSession = {
              ...state.activeSession,
              isActive: false,
              endTime: now,
            };
            updatedHistory = [endedSession, ...updatedHistory];
          }

          // Enforce max history limit (FIFO)
          if (updatedHistory.length > MAX_SESSION_HISTORY) {
            updatedHistory = updatedHistory.slice(0, MAX_SESSION_HISTORY);
          }

          return {
            activeSession: newSession,
            sessionHistory: updatedHistory,
          };
        });
      },

      endContest: () => {
        set((state) => {
          if (!state.activeSession) return state;

          const endedSession: ContestSession = {
            ...state.activeSession,
            isActive: false,
            endTime: new Date().toISOString(),
          };

          let updatedHistory = [endedSession, ...state.sessionHistory];

          // Enforce max history limit (FIFO)
          if (updatedHistory.length > MAX_SESSION_HISTORY) {
            updatedHistory = updatedHistory.slice(0, MAX_SESSION_HISTORY);
          }

          return {
            activeSession: null,
            sessionHistory: updatedHistory,
          };
        });
      },

      logQSO: (qso) => {
        set((state) => {
          if (!state.activeSession) return state;

          const updatedQsos = [...state.activeSession.qsos, qso];

          // Recalculate totals
          const totalPoints = updatedQsos.reduce((sum, q) => sum + q.points, 0);
          const totalMultipliers = state.activeSession.multipliers.length;
          const totalScore = totalPoints * totalMultipliers;

          return {
            activeSession: {
              ...state.activeSession,
              qsos: updatedQsos,
              totalPoints,
              totalScore,
            },
          };
        });
      },

      incrementSerial: () => {
        const state = get();
        if (!state.activeSession) return 1;

        const nextSerial = state.activeSession.currentSerial;

        set((s) => {
          if (!s.activeSession) return s;
          return {
            activeSession: {
              ...s.activeSession,
              currentSerial: s.activeSession.currentSerial + 1,
            },
          };
        });

        return nextSerial;
      },

      addMultiplier: (type, value, band) => {
        const state = get();
        if (!state.activeSession) return false;

        const key = makeMultiplierKey(type, value, band);
        const existing = state.activeSession.multipliers.find(
          (m) => makeMultiplierKey(m.type, m.value, m.band) === key,
        );

        if (existing) return false;

        const newMultiplier: MultiplierEntry = {
          type,
          value: value.toUpperCase(),
          band: band?.toUpperCase(),
          timestamp: new Date().toISOString(),
        };

        set((s) => {
          if (!s.activeSession) return s;

          const updatedMultipliers = [
            ...s.activeSession.multipliers,
            newMultiplier,
          ];
          const totalMultipliers = updatedMultipliers.length;
          const totalScore = s.activeSession.totalPoints * totalMultipliers;

          return {
            activeSession: {
              ...s.activeSession,
              multipliers: updatedMultipliers,
              totalMultipliers,
              totalScore,
            },
          };
        });

        return true;
      },

      isMultiplierWorked: (type, value, band) => {
        const state = get();
        if (!state.activeSession) return false;

        const key = makeMultiplierKey(type, value, band);
        return state.activeSession.multipliers.some(
          (m) => makeMultiplierKey(m.type, m.value, m.band) === key,
        );
      },

      updateScore: () => {
        set((state) => {
          if (!state.activeSession) return state;

          const totalPoints = state.activeSession.qsos.reduce(
            (sum, qso) => sum + qso.points,
            0,
          );
          const totalMultipliers = state.activeSession.multipliers.length;
          const totalScore = totalPoints * totalMultipliers;

          return {
            activeSession: {
              ...state.activeSession,
              totalPoints,
              totalMultipliers,
              totalScore,
            },
          };
        });
      },

      getScoreBreakdown: () => {
        const state = get();
        if (!state.activeSession) {
          return { qsoPoints: 0, multipliers: 0, total: 0 };
        }

        const qsoPoints = state.activeSession.totalPoints;
        const multipliers = state.activeSession.totalMultipliers;
        const total = qsoPoints * multipliers;

        return { qsoPoints, multipliers, total };
      },

      isDupe: (callsign, band, mode) => {
        const state = get();
        if (!state.activeSession) return false;

        const key = makeDupeKey(callsign, band, mode);
        return state.activeSession.qsos.some(
          (qso) => makeDupeKey(qso.callsign, qso.band, qso.mode) === key,
        );
      },

      getWorkedCallsigns: () => {
        const state = get();
        if (!state.activeSession) return new Set<string>();

        return new Set(
          state.activeSession.qsos.map((qso) => qso.callsign.toUpperCase()),
        );
      },
    }),
    {
      name: "propulse-contest",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeSession: state.activeSession,
        sessionHistory: state.sessionHistory,
      }),
    },
  ),
);

/**
 * Zustand store for managing active contest sessions
 * Persists to localStorage with key 'propulse-contest'
 *
 * v3: Integration with contest engine for dupe checking, multiplier extraction, and scoring
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  normalizeMultiplierType,
  getEffectiveDupeRule,
  type MultiplierType,
} from "@/types/contest";
import {
  computeDupeStatus,
  extractMultipliers,
  computeContestScore,
  generateDupeKey,
  isNewMultiplier,
  addToWorkedMults,
} from "@/lib/contest";
import type {
  ContestQSODraft,
  ScoreSummary,
  ExtractedMultiplier,
  ContestContext,
} from "@/lib/contest";
import { getContestById } from "@/lib/data/contests";

export type { MultiplierType } from "@/types/contest";

/** Maximum number of sessions to keep in history */
const MAX_SESSION_HISTORY = 10;

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
 * QSO flags for tracking special states
 */
export interface QSOFlags {
  /** QSO has uncertain data (e.g., partial callsign) */
  uncertain?: boolean;
  /** QSO has been manually edited */
  edited?: boolean;
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
  /** @deprecated Use multipliers array instead */
  multipliers?: string[];
  points: number;
  isMultiplier: boolean;
  /** Whether this QSO is a duplicate */
  isDupe?: boolean;
  /** Original one-line entry if parsed */
  rawInput?: string;
  /** Frequency in kHz */
  frequencyKHz?: number;
  /** All extracted multipliers from this QSO */
  extractedMultipliers?: ExtractedMultiplier[];
  /** QSO flags for special states */
  flags?: QSOFlags;
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
 * Cabrillo export metadata
 */
export interface CabrilloMeta {
  operatorName?: string;
  email?: string;
  club?: string;
  location?: string;
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
  /** Operating mode: Run (calling CQ) or Search & Pounce */
  runMode: "run" | "sp";
  /** Computed score summary from contest engine */
  scoreSummary?: ScoreSummary;
  /** Cabrillo export metadata */
  cabrilloMeta?: CabrilloMeta;
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
    cabrilloMeta?: CabrilloMeta,
  ) => void;
  /** End the current contest session */
  endContest: () => void;

  // QSO management
  /** Log a new QSO to the active session */
  logQSO: (qso: ContestQSO) => void;
  /** Edit an existing QSO */
  editQSO: (id: string, updates: Partial<ContestQSO>) => void;
  /** Remove and return the last QSO (undo) */
  undoLastQSO: () => ContestQSO | null;
  /** Increment and return the next serial number */
  incrementSerial: () => number;

  // Operating mode
  /** Set the operating mode (Run or Search & Pounce) */
  setRunMode: (mode: "run" | "sp") => void;

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
  /** Recompute the full score using contest engine */
  recomputeScore: () => void;
  /** Get detailed score breakdown */
  getScoreBreakdown: () => ScoreBreakdown;

  // Dupe checking
  /** Check if a callsign+band+mode combination is a dupe */
  isDupe: (callsign: string, band: string, mode: string) => boolean;
  /** Get set of all worked callsigns */
  getWorkedCallsigns: () => Set<string>;
}

/**
 * Generate a unique dupe key string (legacy format for backwards compatibility)
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
 * Build worked multipliers map from session multipliers
 */
function buildWorkedMultsMap(
  multipliers: MultiplierEntry[],
): Map<string, Set<string>> {
  const workedMults = new Map<string, Set<string>>();

  for (const mult of multipliers) {
    let typeSet = workedMults.get(mult.type);
    if (!typeSet) {
      typeSet = new Set();
      workedMults.set(mult.type, typeSet);
    }

    const key = mult.band
      ? `${mult.value.toUpperCase()}|${mult.band.toLowerCase()}`
      : mult.value.toUpperCase();
    typeSet.add(key);
  }

  return workedMults;
}

/**
 * Convert store QSOs to contest engine QSO format
 */
function convertToEngineQSOs(
  qsos: ContestQSO[],
): import("@/types/contest").ContestQSO[] {
  return qsos.map((qso) => ({
    id: qso.id,
    callsign: qso.callsign,
    frequency: qso.frequencyKHz ?? 0,
    band: qso.band,
    mode: qso.mode,
    date: qso.timestamp.split("T")[0],
    time: qso.timestamp.split("T")[1]?.slice(0, 5).replace(":", "") ?? "0000",
    rstSent: qso.rstSent,
    rstRcvd: qso.rstReceived,
    serialSent: qso.serialSent,
    serialRcvd: qso.serialReceived,
    exchangeSent: qso.exchangeSent,
    exchangeRcvd: qso.exchangeReceived,
    points: qso.points,
    isMultiplier: qso.isMultiplier,
    isDupe: qso.isDupe ?? false,
    multiplierValue: qso.multipliers?.[0],
  }));
}

/**
 * Build a contest context from the current session state
 */
function buildContestContext(session: ContestSession): ContestContext | null {
  const contest = getContestById(session.contestId);
  if (!contest) return null;

  const engineQsos = convertToEngineQSOs(session.qsos);
  const workedCallsigns = new Set<string>();
  const workedByBand = new Map<string, Set<string>>();
  const workedByBandMode = new Map<string, Set<string>>();

  for (const qso of engineQsos) {
    if (qso.isDupe) continue;

    workedCallsigns.add(qso.callsign.toUpperCase());

    // Track by band
    const band = qso.band.toLowerCase();
    if (!workedByBand.has(band)) {
      workedByBand.set(band, new Set());
    }
    workedByBand.get(band)!.add(qso.callsign.toUpperCase());

    // Track by band+mode
    const bandMode = `${band}|${qso.mode.toUpperCase()}`;
    if (!workedByBandMode.has(bandMode)) {
      workedByBandMode.set(bandMode, new Set());
    }
    workedByBandMode.get(bandMode)!.add(qso.callsign.toUpperCase());
  }

  return {
    session: {
      contestId: session.contestId,
      startTime: session.startTime,
      endTime: session.endTime,
      myExchange: session.myExchange,
      myCallsign: "", // Not tracked in store session
      categories: {
        operator: session.categories.operator,
        band: session.categories.band,
        power: session.categories.power,
        mode: session.categories.mode,
        assisted: "non-assisted",
      },
      currentSerial: session.currentSerial,
      qsoCount: session.qsos.length,
      multipliers: {
        type: "NONE",
        worked: session.multipliers.map((m) => m.value),
      },
      totalPoints: session.totalPoints,
      score: session.totalScore,
    },
    contest,
    workedCallsigns,
    workedByBand,
    workedByBandMode,
    workedMultipliers: new Map(), // Simplified for now
    workedMultipliersByBand: new Map(), // Simplified for now
    qsos: engineQsos,
  };
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

      startContest: (contestId, myExchange, categories, cabrilloMeta) => {
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
          runMode: "run",
          scoreSummary: undefined,
          cabrilloMeta,
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

          // Get contest definition for dupe checking and multiplier extraction
          const contest = getContestById(state.activeSession.contestId);

          const finalQso = { ...qso };
          const updatedMultipliers = [...state.activeSession.multipliers];
          let workedMults = buildWorkedMultsMap(updatedMultipliers);

          if (contest) {
            // Build contest context for dupe checking
            const ctx = buildContestContext(state.activeSession);

            if (ctx) {
              // Create draft for dupe checking
              const draft: ContestQSODraft = {
                callsign: qso.callsign,
                frequency: qso.frequencyKHz ?? 0,
                band: qso.band,
                mode: qso.mode,
                date: qso.timestamp.split("T")[0],
                time:
                  qso.timestamp.split("T")[1]?.slice(0, 5).replace(":", "") ??
                  "0000",
                rstSent: qso.rstSent,
                rstRcvd: qso.rstReceived,
                serialSent: qso.serialSent,
                serialRcvd: qso.serialReceived,
                exchangeSent: qso.exchangeSent,
                exchangeRcvd: qso.exchangeReceived,
                parsedExchange: {},
              };

              // Check for dupes using contest engine
              const dupeResult = computeDupeStatus(draft, ctx);
              finalQso.isDupe = dupeResult.isDupe;

              // Extract multipliers if not a dupe
              if (!dupeResult.isDupe) {
                const extractedMults = extractMultipliers(draft, contest);
                finalQso.extractedMultipliers = extractedMults;

                // Check which multipliers are new and add them
                let hasNewMult = false;
                for (const mult of extractedMults) {
                  if (isNewMultiplier(mult, workedMults)) {
                    hasNewMult = true;

                    // Add to worked mults tracking
                    addToWorkedMults(mult, workedMults);

                    // Add to session multipliers
                    updatedMultipliers.push({
                      type: mult.type,
                      value: mult.value,
                      band: mult.bandKey,
                      timestamp: qso.timestamp,
                    });
                  }
                }

                finalQso.isMultiplier = hasNewMult;
                finalQso.multipliers = extractedMults.map((m) => m.value);
              } else {
                // Dupes get 0 points and aren't multipliers
                finalQso.points = 0;
                finalQso.isMultiplier = false;
              }
            }
          }

          const updatedQsos = [...state.activeSession.qsos, finalQso];

          // Recalculate totals
          const totalPoints = updatedQsos.reduce(
            (sum, q) => sum + (q.isDupe ? 0 : q.points),
            0,
          );
          const totalMultipliers = updatedMultipliers.length;

          // Compute score summary using contest engine
          let scoreSummary: ScoreSummary | undefined;
          let totalScore = totalPoints * totalMultipliers;

          if (contest) {
            const engineQsos = convertToEngineQSOs(updatedQsos);
            workedMults = buildWorkedMultsMap(updatedMultipliers);
            scoreSummary = computeContestScore(
              engineQsos,
              contest,
              workedMults,
            );
            totalScore = scoreSummary.finalScore;
          }

          return {
            activeSession: {
              ...state.activeSession,
              qsos: updatedQsos,
              multipliers: updatedMultipliers,
              totalPoints,
              totalMultipliers,
              totalScore,
              scoreSummary,
            },
          };
        });
      },

      editQSO: (id, updates) => {
        set((state) => {
          if (!state.activeSession) return state;

          const qsoIndex = state.activeSession.qsos.findIndex(
            (qso) => qso.id === id,
          );
          if (qsoIndex === -1) return state;

          const updatedQsos = [...state.activeSession.qsos];
          const existingQso = updatedQsos[qsoIndex];

          // Merge updates and mark as edited
          updatedQsos[qsoIndex] = {
            ...existingQso,
            ...updates,
            flags: {
              ...existingQso.flags,
              edited: true,
            },
          };

          // Recalculate totals
          const totalPoints = updatedQsos.reduce(
            (sum, q) => sum + (q.isDupe ? 0 : q.points),
            0,
          );

          // Recompute score if contest available
          const contest = getContestById(state.activeSession.contestId);
          let scoreSummary = state.activeSession.scoreSummary;
          let totalScore = state.activeSession.totalScore;

          if (contest) {
            const engineQsos = convertToEngineQSOs(updatedQsos);
            const workedMults = buildWorkedMultsMap(
              state.activeSession.multipliers,
            );
            scoreSummary = computeContestScore(
              engineQsos,
              contest,
              workedMults,
            );
            totalScore = scoreSummary.finalScore;
          }

          return {
            activeSession: {
              ...state.activeSession,
              qsos: updatedQsos,
              totalPoints,
              totalScore,
              scoreSummary,
            },
          };
        });
      },

      undoLastQSO: () => {
        const state = get();
        if (!state.activeSession || state.activeSession.qsos.length === 0) {
          return null;
        }

        const lastQso =
          state.activeSession.qsos[state.activeSession.qsos.length - 1];

        set((s) => {
          if (!s.activeSession) return s;

          const updatedQsos = s.activeSession.qsos.slice(0, -1);

          // Remove multipliers added by this QSO
          const updatedMultipliers = s.activeSession.multipliers.filter(
            (mult) => mult.timestamp !== lastQso.timestamp,
          );

          // Recalculate totals
          const totalPoints = updatedQsos.reduce(
            (sum, q) => sum + (q.isDupe ? 0 : q.points),
            0,
          );
          const totalMultipliers = updatedMultipliers.length;

          // Recompute score if contest available
          const contest = getContestById(s.activeSession.contestId);
          let scoreSummary = s.activeSession.scoreSummary;
          let totalScore = totalPoints * totalMultipliers;

          if (contest) {
            const engineQsos = convertToEngineQSOs(updatedQsos);
            const workedMults = buildWorkedMultsMap(updatedMultipliers);
            scoreSummary = computeContestScore(
              engineQsos,
              contest,
              workedMults,
            );
            totalScore = scoreSummary.finalScore;
          }

          return {
            activeSession: {
              ...s.activeSession,
              qsos: updatedQsos,
              multipliers: updatedMultipliers,
              totalPoints,
              totalMultipliers,
              totalScore,
              scoreSummary,
            },
          };
        });

        return lastQso;
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

      setRunMode: (mode) => {
        set((state) => {
          if (!state.activeSession) return state;

          return {
            activeSession: {
              ...state.activeSession,
              runMode: mode,
            },
          };
        });
      },

      addMultiplier: (type, value, band) => {
        const state = get();
        if (!state.activeSession) return false;

        const normalizedType = normalizeMultiplierType(type);
        const key = makeMultiplierKey(normalizedType, value, band);
        const existing = state.activeSession.multipliers.find(
          (m) => makeMultiplierKey(m.type, m.value, m.band) === key,
        );

        if (existing) return false;

        const newMultiplier: MultiplierEntry = {
          type: normalizedType,
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

          // Recompute score
          const contest = getContestById(s.activeSession.contestId);
          let scoreSummary = s.activeSession.scoreSummary;
          let totalScore = s.activeSession.totalPoints * totalMultipliers;

          if (contest) {
            const engineQsos = convertToEngineQSOs(s.activeSession.qsos);
            const workedMults = buildWorkedMultsMap(updatedMultipliers);
            scoreSummary = computeContestScore(
              engineQsos,
              contest,
              workedMults,
            );
            totalScore = scoreSummary.finalScore;
          }

          return {
            activeSession: {
              ...s.activeSession,
              multipliers: updatedMultipliers,
              totalMultipliers,
              totalScore,
              scoreSummary,
            },
          };
        });

        return true;
      },

      isMultiplierWorked: (type, value, band) => {
        const state = get();
        if (!state.activeSession) return false;

        const normalizedType = normalizeMultiplierType(type);
        const key = makeMultiplierKey(normalizedType, value, band);
        return state.activeSession.multipliers.some(
          (m) => makeMultiplierKey(m.type, m.value, m.band) === key,
        );
      },

      updateScore: () => {
        set((state) => {
          if (!state.activeSession) return state;

          const totalPoints = state.activeSession.qsos.reduce(
            (sum, qso) => sum + (qso.isDupe ? 0 : qso.points),
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

      recomputeScore: () => {
        set((state) => {
          if (!state.activeSession) return state;

          const contest = getContestById(state.activeSession.contestId);
          if (!contest) return state;

          const engineQsos = convertToEngineQSOs(state.activeSession.qsos);
          const workedMults = buildWorkedMultsMap(
            state.activeSession.multipliers,
          );
          const scoreSummary = computeContestScore(
            engineQsos,
            contest,
            workedMults,
          );

          return {
            activeSession: {
              ...state.activeSession,
              totalPoints: scoreSummary.totalPoints,
              totalMultipliers: scoreSummary.totalMultipliers,
              totalScore: scoreSummary.finalScore,
              scoreSummary,
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
        const total =
          state.activeSession.scoreSummary?.finalScore ??
          qsoPoints * multipliers;

        return { qsoPoints, multipliers, total };
      },

      isDupe: (callsign, band, mode) => {
        const state = get();
        if (!state.activeSession) return false;

        // Try to use contest engine for accurate dupe checking
        const contest = getContestById(state.activeSession.contestId);
        if (contest) {
          const dupeRule = getEffectiveDupeRule(contest);
          const dupeKey = generateDupeKey(callsign, band, mode, dupeRule);

          // Build set of worked dupe keys
          const workedKeys = new Set<string>();
          for (const qso of state.activeSession.qsos) {
            if (qso.isDupe) continue;
            const key = generateDupeKey(
              qso.callsign,
              qso.band,
              qso.mode,
              dupeRule,
            );
            workedKeys.add(key);
          }

          return workedKeys.has(dupeKey);
        }

        // Fallback to legacy dupe checking (per band+mode)
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
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeSession: state.activeSession,
        sessionHistory: state.sessionHistory,
      }),
      migrate: (persistedState, version) => {
        const state = persistedState as {
          activeSession: ContestSession | null;
          sessionHistory: ContestSession[];
        };

        // Helper to normalize session for any version
        const normalizeSession = (
          session: ContestSession | null,
        ): ContestSession | null => {
          if (!session) return null;

          // Normalize multiplier types
          const normalizedMultipliers = session.multipliers.map((m) => ({
            ...m,
            type: normalizeMultiplierType(String(m.type)),
          }));

          // Add new v3 fields with defaults
          return {
            ...session,
            multipliers: normalizedMultipliers,
            // Add runMode if missing (v2 -> v3)
            runMode: session.runMode ?? "run",
            // Add scoreSummary if missing (v2 -> v3)
            scoreSummary: session.scoreSummary ?? undefined,
            // Ensure QSOs have isDupe field
            qsos: session.qsos.map((qso) => ({
              ...qso,
              isDupe: qso.isDupe ?? false,
            })),
          };
        };

        // Apply migrations based on version
        if (version < 3) {
          return {
            ...state,
            activeSession: normalizeSession(state.activeSession),
            sessionHistory: state.sessionHistory.map(
              (s) => normalizeSession(s) as ContestSession,
            ),
          };
        }

        // Already at v3, just normalize
        return {
          ...state,
          activeSession: normalizeSession(state.activeSession),
          sessionHistory: state.sessionHistory.map(
            (s) => normalizeSession(s) as ContestSession,
          ),
        };
      },
    },
  ),
);

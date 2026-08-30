/**
 * Zustand store for Band Health (BH2) — persists the per-scope-per-band
 * five-state ladder machines, hysteresis edges, latest evaluations, and a
 * rolling flip log, so the wall display's ladder doesn't reset on reload.
 *
 * Scopes: 'global', 'regional:EU', 'dx:EM-JO' — keyed with the band as
 * `${scopeId}|${band}`. The pure ladder (ladder.ts) and ranked hold machine
 * (stateMachine.ts) live in src/lib/verdict/; this store is the persistence
 * + orchestration layer that feeds them a stream of scoped evaluations.
 *
 * These client ladders are UI-only (fast, follows the operator's scope).
 * The canonical scored record is the collector's server-side ladder
 * (verdict_states / verdict_events), read via useBandLadder.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  evaluateLadder,
  LADDER_RANK,
  type LadderState,
  type LadderInputs,
  type LadderEdgeState,
  type LadderEvaluation,
} from "@/lib/verdict/ladder";
import {
  initialRankedState,
  advanceRanked,
  type RankedMachineState,
} from "@/lib/verdict/stateMachine";

/** `${scopeId}|${band}` — the store key for one scoped band ladder. */
export function scopeBandKey(scopeId: string, band: string): string {
  return `${scopeId}|${band}`;
}

/** Endpoint-sourced counts carried alongside an evaluation for display. */
export interface LadderCounts {
  count60m: number;
  sourceCounts60m: Record<string, number>;
  modeObs20m: Record<string, number>;
}

/** Latest evaluation for one scoped band, with its display context. */
export interface LadderResultEntry {
  scopeId: string;
  band: string;
  evaluation: LadderEvaluation;
  inputs: LadderInputs;
  counts: LadderCounts | null;
  at: number;
}

/** One recorded stable-state flip, for the "why" popover's recent history */
export interface LadderLogEntry {
  id: string;
  scopeId: string;
  band: string;
  at: number;
  from: LadderState;
  to: LadderState;
  why: string[];
  kp: number;
  sfi: number;
}

/** Max log entries retained, and max age before pruning */
const LOG_MAX_ENTRIES = 200;
const LOG_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * Fading modifier: this many consecutive falling-trend evaluations while
 * the stable state is stirring or better reads as "the opening is dying".
 */
export const FADING_STREAK_THRESHOLD = 2;

/** One scoped band's evaluation for a single ingest tick */
export interface LadderIngestInput {
  scopeId: string;
  band: string;
  inputs: LadderInputs;
  counts?: LadderCounts;
  kp: number;
  sfi: number;
}

function makeLogId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `verdict-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pruneLog(log: LadderLogEntry[], now: number): LadderLogEntry[] {
  const cutoff = now - LOG_MAX_AGE_MS;
  return log.filter((entry) => entry.at >= cutoff).slice(0, LOG_MAX_ENTRIES);
}

interface VerdictStore {
  machines: Record<string, RankedMachineState<LadderState>>;
  edges: Record<string, LadderEdgeState>;
  results: Record<string, LadderResultEntry>;
  /** Consecutive falling-trend evaluations per scoped band */
  fallingStreaks: Record<string, number>;
  log: LadderLogEntry[];
  /** DX scope toggle: headline follows the field pair to the first target */
  dxMode: boolean;

  /** Feed one batch of scoped evaluations through the ladder + machine */
  ingest: (evals: LadderIngestInput[], now?: number) => void;
  setDxMode: (dxMode: boolean) => void;
  /** The stable (hold-confirmed) ladder state for a scoped band, if known */
  getStableState: (scopeId: string, band: string) => LadderState | null;
}

export const useVerdictStore = create<VerdictStore>()(
  persist(
    (set, get) => ({
      machines: {},
      edges: {},
      results: {},
      fallingStreaks: {},
      log: [],
      dxMode: false,

      ingest: (evals, now = Date.now()) => {
        const { machines, edges, results, fallingStreaks, log } = get();
        const nextMachines = { ...machines };
        const nextEdges = { ...edges };
        const nextResults = { ...results };
        const nextStreaks = { ...fallingStreaks };
        let nextLog = log;

        for (const { scopeId, band, inputs, counts, kp, sfi } of evals) {
          const key = scopeBandKey(scopeId, band);
          const evaluation = evaluateLadder(inputs, edges[key]);
          nextResults[key] = {
            scopeId,
            band,
            evaluation,
            inputs,
            counts: counts ?? null,
            at: now,
          };
          nextEdges[key] = {
            physicsOpen: evaluation.physicsOpen,
            verified: evaluation.verified,
          };
          nextStreaks[key] =
            evaluation.trend === "falling" ? (fallingStreaks[key] ?? 0) + 1 : 0;

          const existingMachine = machines[key];
          if (!existingMachine) {
            // First evaluation: show the raw state immediately, no hold.
            nextMachines[key] = initialRankedState(evaluation.state, now);
            continue;
          }

          const { state, flip } = advanceRanked(
            LADDER_RANK,
            existingMachine,
            evaluation.state,
            now,
          );
          nextMachines[key] = state;
          if (flip) {
            const entry: LadderLogEntry = {
              id: makeLogId(),
              scopeId,
              band,
              at: flip.at,
              from: flip.from,
              to: flip.to,
              why: evaluation.why,
              kp,
              sfi,
            };
            nextLog = [entry, ...nextLog];
          }
        }

        nextLog = pruneLog(nextLog, now);

        set({
          machines: nextMachines,
          edges: nextEdges,
          results: nextResults,
          fallingStreaks: nextStreaks,
          log: nextLog,
        });
      },

      setDxMode: (dxMode) => set({ dxMode }),

      getStableState: (scopeId, band) =>
        get().machines[scopeBandKey(scopeId, band)]?.stable ?? null,
    }),
    {
      name: "propulse-verdict",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        machines: state.machines,
        edges: state.edges,
        results: state.results,
        fallingStreaks: state.fallingStreaks,
        log: state.log,
        dxMode: state.dxMode,
      }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version < 2) {
          // v1 (E4) stored band-keyed machines over the old four-verdict
          // vocabulary; not translatable — drop and rebuild in one tick.
          return {
            machines: {},
            edges: {},
            results: {},
            fallingStreaks: {},
            log: [],
            dxMode: false,
          } as unknown as VerdictStore;
        }
        return state as unknown as VerdictStore;
      },
    },
  ),
);

/**
 * Zustand store for Band Verdict (E4) — persists the per-band hold-to-confirm
 * state machine, hysteresis edges, latest raw results, and a rolling flip
 * log, so the wall display's verdict doesn't reset on reload.
 *
 * The pure fusion (verdictEngine) and hold-to-confirm reducer (stateMachine)
 * live in src/lib/verdict/; this store is the persistence + orchestration
 * layer that feeds them a stream of per-band evaluations.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  computeVerdict,
  type BandVerdict,
  type VerdictInputs,
  type VerdictEdgeState,
  type BandVerdictResult,
} from "@/lib/verdict/verdictEngine";
import {
  initialMachineState,
  advance,
  type VerdictMachineState,
} from "@/lib/verdict/stateMachine";

/** One recorded stable-verdict flip, for the "why" popover's recent history */
export interface VerdictLogEntry {
  id: string;
  band: string;
  at: number;
  from: BandVerdict;
  to: BandVerdict;
  why: string[];
  kp: number;
  sfi: number;
  physicsScore: number;
  spotCount: number;
}

/** Max log entries retained, and max age before pruning */
const LOG_MAX_ENTRIES = 200;
const LOG_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/** One band's evaluation for a single ingest tick */
export interface VerdictIngestInput {
  inputs: VerdictInputs;
  kp: number;
  sfi: number;
}

function makeLogId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `verdict-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pruneLog(log: VerdictLogEntry[], now: number): VerdictLogEntry[] {
  const cutoff = now - LOG_MAX_AGE_MS;
  return log.filter((entry) => entry.at >= cutoff).slice(0, LOG_MAX_ENTRIES);
}

interface VerdictStore {
  machines: Record<string, VerdictMachineState>;
  edges: Record<string, VerdictEdgeState>;
  results: Record<string, BandVerdictResult>;
  log: VerdictLogEntry[];

  /** Feed one batch of per-band evaluations through the engine + machine */
  ingest: (evals: VerdictIngestInput[], now?: number) => void;
  /** The stable (hold-confirmed) verdict for a band, if known */
  getStableVerdict: (band: string) => BandVerdict | null;
}

export const useVerdictStore = create<VerdictStore>()(
  persist(
    (set, get) => ({
      machines: {},
      edges: {},
      results: {},
      log: [],

      ingest: (evals, now = Date.now()) => {
        const { machines, edges, results, log } = get();
        const nextMachines = { ...machines };
        const nextEdges = { ...edges };
        const nextResults = { ...results };
        let nextLog = log;

        for (const { inputs, kp, sfi } of evals) {
          const band = inputs.band;
          const result = computeVerdict(inputs, edges[band]);
          nextResults[band] = result;
          nextEdges[band] = {
            physicsOpen: result.physicsOpen,
            spotConfirmed: result.spotConfirmed,
          };

          const existingMachine = machines[band];
          if (!existingMachine) {
            // First evaluation: show the raw verdict immediately, no hold.
            nextMachines[band] = initialMachineState(result.verdict, now);
            continue;
          }

          const { state, flip } = advance(existingMachine, result.verdict, now);
          nextMachines[band] = state;
          if (flip) {
            const entry: VerdictLogEntry = {
              id: makeLogId(),
              band,
              at: flip.at,
              from: flip.from,
              to: flip.to,
              why: result.why,
              kp,
              sfi,
              physicsScore: inputs.physicsScore,
              spotCount: inputs.spotCount,
            };
            nextLog = [entry, ...nextLog];
          }
        }

        nextLog = pruneLog(nextLog, now);

        set({
          machines: nextMachines,
          edges: nextEdges,
          results: nextResults,
          log: nextLog,
        });
      },

      getStableVerdict: (band) => get().machines[band]?.stable ?? null,
    }),
    {
      name: "propulse-verdict",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        machines: state.machines,
        edges: state.edges,
        results: state.results,
        log: state.log,
      }),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        return state as unknown as VerdictStore;
      },
    },
  ),
);

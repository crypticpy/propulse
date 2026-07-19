/**
 * useFateQsoTracker — QSO sequence state machine for the Fate (F8) skin.
 *
 * Tracks the progression of FT8/FT4 QSO exchanges visible in the directed
 * decode stream. Each QSO follows the standard exchange sequence:
 *
 *   CQ -> Grid -> Report -> R+Report -> RR73 -> 73 -> Complete
 *
 * The state machine is display-only: it observes directed messages and infers
 * the current stage of each in-progress QSO, keyed by the other station's
 * callsign. Stages only advance forward (never backward) unless a new CQ
 * restarts the sequence after completion.
 *
 * Uses useRef-based storage (like useFateSnrTrend) so the tracker persists
 * across renders. Mutation happens in a useEffect (not a useMemo) so StrictMode's
 * double render can't corrupt the state machine; a useState snapshot is published
 * whenever the directed array changes.
 */

import { useRef, useEffect, useState } from "react";
import type { EnrichedDecode } from "./useFateDecodes";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Auto-expire sequences older than 5 minutes (ms). */
const EXPIRY_MS = 300_000;

/** Maximum tracked callsigns to bound memory. */
const MAX_TRACKED = 20;

// ─── Types ───────────────────────────────────────────────────────────────────

export type QsoStage =
  | "cq"
  | "grid"
  | "report"
  | "r_report"
  | "rr73"
  | "73"
  | "complete";

export interface QsoSequenceState {
  /** The other station's callsign. */
  callsign: string;
  /** Current stage of the QSO. */
  stage: QsoStage;
  /** Signal report received (e.g. "-05", "+12"). */
  reportReceived: string | null;
  /** Signal report sent (if visible in the decode stream). */
  reportSent: string | null;
  /** Grid received from the other station. */
  gridReceived: string | null;
  /**
   * Timestamp of the latest stage update: absolute ms since Unix epoch
   * (epochMs). Monotonic across UTC midnight so expiry/sort math stays correct.
   */
  lastUpdateTime: number;
  /** Whether the QSO is considered complete (73 or RR73 seen from both sides). */
  isComplete: boolean;
}

// ─── Stage ordering (for forward-only enforcement) ────────────────────────────

const STAGE_ORDER: Record<QsoStage, number> = {
  cq: 0,
  grid: 1,
  report: 2,
  r_report: 3,
  rr73: 4,
  "73": 5,
  complete: 6,
};

// ─── Internal mutable entry (stored in ref) ──────────────────────────────────

interface TrackerEntry {
  state: QsoSequenceState;
  /** Monotonic counter for LRU eviction. */
  lastAccess: number;
}

// ─── Stage detection helpers ─────────────────────────────────────────────────

/** 4-char Maidenhead grid locator pattern. */
const GRID_RE = /\b[A-R]{2}\d{2}\b/i;

/** Signal report WITHOUT R prefix: +05, -12. */
const REPORT_RE = /\b[+-]\d{2}\b/;

/** Signal report WITH R prefix: R+05, R-12. */
const R_REPORT_RE = /\bR[+-]\d{2}\b/;

/** RR73 token. */
const RR73_RE = /\bRR73\b/;

/** Standalone 73 (not preceded by RR). */
const SOLO_73_RE = /(?<![R])(?:^|\s)73(?:\s|$)/;

/**
 * Detect the QSO stage from the message text.
 * Returns the detected stage and any extracted report/grid values.
 */
function detectStage(message: string): {
  stage: QsoStage | null;
  report: string | null;
  grid: string | null;
} {
  const upper = message.toUpperCase();

  // CQ detection: "CQ MYCALL" or the other station is calling CQ and my call appears
  // (this would be "CQ K1ABC FN42" where I am K1ABC calling CQ,
  //  or less commonly visible in directed)
  if (/^CQ\s/i.test(message.trim())) {
    const gridMatch = message.match(GRID_RE);
    return { stage: "cq", report: null, grid: gridMatch?.[0] ?? null };
  }

  // RR73 — must check before standalone 73
  if (RR73_RE.test(upper)) {
    return { stage: "rr73", report: null, grid: null };
  }

  // Standalone 73 (not RR73)
  if (SOLO_73_RE.test(upper)) {
    return { stage: "73", report: null, grid: null };
  }

  // R+report (Roger + report) — must check before bare report
  const rReportMatch = message.match(R_REPORT_RE);
  if (rReportMatch) {
    return { stage: "r_report", report: rReportMatch[0], grid: null };
  }

  // Bare report (+05, -12)
  const reportMatch = message.match(REPORT_RE);
  if (reportMatch) {
    return { stage: "report", report: reportMatch[0], grid: null };
  }

  // Grid exchange
  const gridMatch = message.match(GRID_RE);
  if (gridMatch) {
    return { stage: "grid", report: null, grid: gridMatch[0] };
  }

  return { stage: null, report: null, grid: null };
}

/**
 * Determine the other station's callsign from a directed message.
 * In a directed message, the message contains both my callsign and
 * the other station's callsign. We extract the "other" one.
 */
function extractOtherCallsign(
  decode: EnrichedDecode,
  myCallUpper: string,
): string | null {
  // The enriched decode has parsedCallsign and senderCallsign.
  // In FT8 messages like "K1ABC W2XYZ -05":
  //   senderCallsign = K1ABC (CALL1)
  //   parsedCallsign = W2XYZ (CALL2)
  // If I am K1ABC, the other station is W2XYZ (parsedCallsign).
  // If I am W2XYZ, the other station is K1ABC (senderCallsign).

  const sender = decode.senderCallsign?.toUpperCase() ?? null;
  const parsed = decode.parsedCallsign?.toUpperCase() ?? null;

  if (sender === myCallUpper && parsed && parsed !== myCallUpper) {
    return parsed;
  }
  if (parsed === myCallUpper && sender && sender !== myCallUpper) {
    return sender;
  }
  // For CQ messages: "CQ K1ABC FN42" — sender and parsed are both K1ABC
  // If that's me, there's no "other" yet — but we still track it for the CQ stage.
  // For CQ, the other is me calling CQ, which is not a tracked QSO.
  // However, when someone responds to my CQ: "K1ABC W2XYZ EM73" — that's a grid exchange.

  // Fallback: if one of the two matches, return the other
  if (sender && sender !== myCallUpper) return sender;
  if (parsed && parsed !== myCallUpper) return parsed;

  return null;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Track QSO sequence progression from directed decode messages.
 *
 * @param directed  - Decodes filtered to messages involving my callsign.
 * @param myCallsign - Operator's callsign (from profile).
 * @returns Map keyed by other station's uppercase callsign, with current QSO state.
 */
export function useFateQsoTracker(
  directed: EnrichedDecode[],
  myCallsign: string | null,
): Map<string, QsoSequenceState> {
  // Persistent storage — survives re-renders, does NOT trigger re-renders.
  const trackerRef = useRef<Map<string, TrackerEntry>>(new Map());
  const accessCounterRef = useRef(0);

  // Published snapshot consumed by the UI. Updated only from the effect below.
  const [snapshot, setSnapshot] = useState<Map<string, QsoSequenceState>>(
    () => new Map(),
  );

  // Mutation runs in an effect (post-commit), not a memo, so StrictMode's double
  // render can't advance stages or capture reports twice. Re-processing the same
  // directed buffer is idempotent: stage progression is forward-only, and reports
  // are captured only on advance.
  useEffect(() => {
    const tracker = trackerRef.current;
    const myCallUpper = myCallsign?.toUpperCase() ?? null;

    // If no callsign configured, publish an empty map and reset the tracker.
    if (!myCallUpper) {
      tracker.clear();
      setSnapshot(new Map<string, QsoSequenceState>());
      return;
    }

    // ── Sort directed by absolute time (chronological processing) ──────
    // Use epochMs, not the midnight-wrapping `time`, so ordering is stable
    // across 00:00 UTC.
    const sorted = [...directed].sort((a, b) => a.epochMs - b.epochMs);

    // ── Process each directed message ─────────────────────────────────
    for (const decode of sorted) {
      const otherCall = extractOtherCallsign(decode, myCallUpper);
      if (!otherCall) continue;

      const { stage, report, grid } = detectStage(decode.message);
      if (!stage) continue;

      const existing = tracker.get(otherCall);

      if (existing) {
        // Bump LRU
        existing.lastAccess = ++accessCounterRef.current;

        const currentOrder = STAGE_ORDER[existing.state.stage];
        const newOrder = STAGE_ORDER[stage];

        // If the QSO was complete and we see a new CQ, start fresh
        if (existing.state.isComplete && stage === "cq") {
          existing.state = {
            callsign: otherCall,
            stage: "cq",
            reportReceived: null,
            reportSent: null,
            gridReceived: grid,
            lastUpdateTime: decode.epochMs,
            isComplete: false,
          };
          continue;
        }

        // Forward-only progression
        if (newOrder <= currentOrder) continue;

        // Advance the stage
        existing.state.stage = stage;
        existing.state.lastUpdateTime = decode.epochMs;

        // Capture report/grid values
        if (grid && !existing.state.gridReceived) {
          existing.state.gridReceived = grid;
        }

        // Attribute the report by the *transmitter*. Parser field naming is
        // counter-intuitive: `senderCallsign` = CALL1 = the addressed station
        // (recipient), `parsedCallsign` = CALL2 = the transmitter. So if the
        // other station transmitted this message, they sent us the report.
        if (report) {
          const transmitter = decode.parsedCallsign?.toUpperCase() ?? null;
          if (transmitter === otherCall) {
            // They transmitted a report to us
            existing.state.reportReceived = report;
          } else {
            // We transmitted a report to them (visible in decode stream)
            existing.state.reportSent = report;
          }
        }

        // Check for completion: both rr73 and 73 stages have been reached
        if (stage === "rr73" || stage === "73") {
          // If we're at 73 stage, mark complete
          if (stage === "73") {
            existing.state.isComplete = true;
            existing.state.stage = "complete";
          }
          // If we see rr73, the QSO is effectively complete
          // (the 73 response is courtesy — RR73 confirms the QSO)
          if (stage === "rr73") {
            existing.state.isComplete = true;
            existing.state.stage = "complete";
          }
        }
      } else {
        // New QSO sequence
        const entry: TrackerEntry = {
          state: {
            callsign: otherCall,
            stage,
            reportReceived: null,
            reportSent: null,
            gridReceived: grid,
            lastUpdateTime: decode.epochMs,
            isComplete: stage === "rr73" || stage === "73",
          },
          lastAccess: ++accessCounterRef.current,
        };

        // Capture report on first sighting. Attribute by transmitter
        // (parsedCallsign = CALL2), not the addressed station (senderCallsign
        // = CALL1); see the note in the advance branch above.
        if (report) {
          const transmitter = decode.parsedCallsign?.toUpperCase() ?? null;
          if (transmitter === otherCall) {
            entry.state.reportReceived = report;
          } else {
            entry.state.reportSent = report;
          }
        }

        // Mark complete if first sighting is already an endgame message
        if (entry.state.isComplete) {
          entry.state.stage = "complete";
        }

        tracker.set(otherCall, entry);

        // ── LRU eviction ─────────────────────────────────────────────
        if (tracker.size > MAX_TRACKED) {
          let oldestKey: string | null = null;
          let oldestAccess = Infinity;
          for (const [key, val] of tracker) {
            if (val.lastAccess < oldestAccess) {
              oldestAccess = val.lastAccess;
              oldestKey = key;
            }
          }
          if (oldestKey) {
            tracker.delete(oldestKey);
          }
        }
      }
    }

    // ── Auto-expire stale sequences ──────────────────────────────────
    // Use the most recent absolute time (epochMs) in the directed array as
    // "now". lastUpdateTime is also epochMs, so the difference stays correct
    // across UTC midnight instead of swinging hugely negative.
    const latestTime =
      sorted.length > 0 ? sorted[sorted.length - 1].epochMs : 0;

    if (latestTime > 0) {
      for (const [key, entry] of tracker) {
        if (latestTime - entry.state.lastUpdateTime > EXPIRY_MS) {
          tracker.delete(key);
        }
      }
    }

    // ── Publish output snapshot ──────────────────────────────────────
    const result = new Map<string, QsoSequenceState>();
    for (const [call, entry] of tracker) {
      // Copy so consumers can't mutate internal state
      result.set(call, { ...entry.state });
    }
    setSnapshot(result);
  }, [directed, myCallsign]);

  return snapshot;
}

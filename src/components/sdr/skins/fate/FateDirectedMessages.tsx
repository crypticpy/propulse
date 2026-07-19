/**
 * FateDirectedMessages — Right sidebar panel for the Fate (F8) FT8/FT4 skin.
 *
 * Shows messages directed at the operator's callsign (responses, reports,
 * grid exchanges) and a compact decode-statistics dashboard at the bottom.
 * Fixed 280px width, designed for persistent visibility alongside the
 * main band-activity decode table.
 */

import { useCallback, useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQSOStore } from "@/stores/qsoStore";
import type { EnrichedDecode } from "./useFateDecodes";
import type { DxccRowData } from "./useFateDxcc";
import type { QsoSequenceState, QsoStage } from "./useFateQsoTracker";

// ─── Props ──────────────────────────────────────────────────────────────────

interface FateDirectedMessagesProps {
  /** Decodes filtered to only messages involving my callsign */
  directed: EnrichedDecode[];
  /** My callsign (for display purposes) */
  myCallsign: string | null;
  /** My grid (for "set your grid" prompt) */
  myGrid: string | null;
  /** Decode statistics */
  stats: {
    totalDecodes: number;
    uniqueCallsigns: number;
    newStations: number;
  };
  /** FT8 decoder stats from useFt8Decoder */
  ft8DecoderStats: {
    totalDecodes: number;
    cyclesCompleted: number;
    lastCycleDecodes: number;
    workerReady: boolean;
  };
  /** Whether decoder is currently running */
  ft8DecoderEnabled: boolean;
  /** DXCC entity + worked-before data keyed by uppercase callsign (optional — graceful fallback) */
  dxccData?: Map<string, DxccRowData>;
  /** QSO sequence tracker state keyed by other station's callsign (optional — Wave 4-A) */
  qsoTracker?: Map<string, QsoSequenceState>;
}

// ─── SNR color helper ───────────────────────────────────────────────────────

function snrColorClass(snr: number): string {
  if (snr >= 0) return "text-signal-green";
  if (snr >= -10) return "text-cosmic-cyan";
  if (snr >= -18) return "text-caution-yellow";
  return "text-alert-red";
}

// ─── DirectedRow — compact decode row for 280px sidebar ─────────────────────

function DirectedRow({
  decode,
  onQuickLog,
  dxccInfo,
}: {
  decode: EnrichedDecode;
  onQuickLog: (callsign: string) => void;
  dxccInfo?: DxccRowData;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1 rounded bg-cosmic-cyan/5 border-l-2 border-cosmic-cyan/40 hover:bg-cosmic-cyan/10 transition-colors">
      <div className="flex items-center gap-2 text-[10px]">
        <span className="font-mono text-gray-500 shrink-0">
          {decode.utcFormatted}
        </span>
        <span className={`font-mono shrink-0 ${snrColorClass(decode.snr)}`}>
          {decode.snr > 0 ? `+${decode.snr}` : decode.snr}
        </span>
        {decode.parsedCallsign && (
          <div className="flex flex-col min-w-0">
            <span className="font-mono font-bold text-white text-[11px] truncate">
              {decode.parsedCallsign}
            </span>
            {dxccInfo && (
              <span className="text-[8px] text-gray-500 truncate">
                {dxccInfo.entity?.name ?? "Unknown"}
                {!dxccInfo.isWorked && (
                  <span className="ml-1 text-signal-green font-semibold">
                    NEW
                  </span>
                )}
              </span>
            )}
          </div>
        )}
        {decode.parsedGrid && decode.distanceKm != null && (
          <span className="text-gray-500 shrink-0 ml-auto tabular-nums">
            {Math.round(decode.distanceKm)} km
          </span>
        )}
        {decode.parsedCallsign && (
          <button
            type="button"
            title={`Quick-log ${decode.parsedCallsign}`}
            onClick={() => onQuickLog(decode.parsedCallsign!)}
            className="ml-auto shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-cosmic-cyan/10 text-cosmic-cyan hover:bg-cosmic-cyan/25 transition-colors font-medium"
          >
            LOG
          </button>
        )}
      </div>
      <div className="text-[10px] font-mono text-gray-300 truncate">
        {decode.message}
      </div>
    </div>
  );
}

// ─── EmptyState — contextual empty message ──────────────────────────────────

function EmptyState({ myCallsign }: { myCallsign: string | null }) {
  if (!myCallsign) {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-3 text-center gap-2">
        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
          <svg
            className="w-4 h-4 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Set your callsign in Profile to see directed messages.
        </p>
        <Link
          to="/profile"
          className="text-[10px] text-cosmic-cyan hover:text-cosmic-cyan/80 transition-colors underline underline-offset-2"
        >
          Open Profile
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-6 px-3 text-center gap-2">
      <div className="w-8 h-8 rounded-full bg-cosmic-cyan/5 flex items-center justify-center">
        <svg
          className="w-4 h-4 text-cosmic-cyan/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
          />
        </svg>
      </div>
      <p className="text-[11px] text-gray-400">
        No messages directed to{" "}
        <span className="font-mono font-bold text-cosmic-cyan">
          {myCallsign}
        </span>{" "}
        yet.
      </p>
      <p className="text-[10px] text-gray-600 leading-relaxed">
        CQ calls and responses involving your callsign will appear here.
      </p>
    </div>
  );
}

// ─── GridPrompt — small info banner about setting grid ──────────────────────

function GridPrompt() {
  return (
    <div className="px-3 py-1.5 border-t border-white/5 bg-caution-yellow/5">
      <p className="text-[9px] text-caution-yellow/70 leading-relaxed">
        Set your grid in{" "}
        <Link
          to="/profile"
          className="underline underline-offset-2 hover:text-caution-yellow transition-colors"
        >
          Profile
        </Link>{" "}
        for distance/bearing data.
      </p>
    </div>
  );
}

// ─── QSO stage labels & ordering ─────────────────────────────────────────────

const QSO_STAGES: QsoStage[] = [
  "cq",
  "grid",
  "report",
  "r_report",
  "rr73",
  "73",
];

const STAGE_LABELS: Record<QsoStage, string> = {
  cq: "CQ",
  grid: "Grid",
  report: "Report",
  r_report: "R-Rpt",
  rr73: "RR73",
  "73": "73",
  complete: "Complete",
};

const STAGE_INDEX: Record<QsoStage, number> = {
  cq: 0,
  grid: 1,
  report: 2,
  r_report: 3,
  rr73: 4,
  "73": 5,
  complete: 6,
};

// ─── QsoProgressRow — single QSO progress indicator ─────────────────────────

function QsoProgressRow({
  state,
  isFadingOut,
}: {
  state: QsoSequenceState;
  isFadingOut: boolean;
}) {
  const currentIdx = STAGE_INDEX[state.stage];

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 transition-opacity duration-[1500ms] ${
        isFadingOut ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Callsign */}
      <span className="font-mono font-bold text-white text-[10px] w-[60px] truncate shrink-0">
        {state.callsign}
      </span>

      {/* Progress dots */}
      <div className="flex items-center gap-1">
        {QSO_STAGES.map((stage, idx) => {
          const isFilled = state.isComplete || idx <= currentIdx;
          const isCurrent = !state.isComplete && idx === currentIdx;

          return (
            <span
              key={stage}
              className={`inline-block w-1.5 h-1.5 rounded-full transition-all ${
                isFilled ? "bg-signal-green" : "bg-white/10"
              } ${
                isCurrent
                  ? "animate-pulse shadow-[0_0_4px_theme(colors.signal-green/0.5)]"
                  : ""
              } ${
                state.isComplete
                  ? "shadow-[0_0_3px_theme(colors.signal-green/0.3)]"
                  : ""
              }`}
            />
          );
        })}
      </div>

      {/* Stage label */}
      <span
        className={`text-[9px] shrink-0 ${
          state.isComplete ? "text-signal-green font-semibold" : "text-gray-500"
        }`}
      >
        {state.isComplete ? (
          <span className="flex items-center gap-0.5">
            Complete
            <svg
              className="w-2.5 h-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </span>
        ) : (
          STAGE_LABELS[state.stage]
        )}
      </span>
    </div>
  );
}

// ─── FateActiveQsos — Active QSO progress section ───────────────────────────

/** Dwell after a QSO completes before the row starts to fade (ms). */
const FADE_DELAY_MS = 10_000;
/** Fade animation length — must match the row's opacity transition (ms). */
const FADE_DURATION_MS = 1_500;

function FateActiveQsos({
  qsoTracker,
}: {
  qsoTracker: Map<string, QsoSequenceState>;
}) {
  // Track completed QSOs that are fading out / fully hidden.
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Per-callsign timers, keyed "<call>:fade" / "<call>:hide". Timers are only
  // cleared on unmount or when a callsign restarts its QSO — never on a routine
  // decode batch. (The old code cancelled every timer on each batch, so FT4's
  // 10s fade never survived the 7.5s batch cadence.)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  // Callsigns whose fade has already been scheduled — guards against
  // re-scheduling every time a fresh qsoTracker Map arrives.
  const scheduledRef = useRef<Set<string>>(new Set());

  // Deliberately keyed on qsoTracker only (not fadingOut/hidden): a setState
  // from a firing timer must not re-run this effect and cancel sibling timers.
  useEffect(() => {
    for (const [callsign, state] of qsoTracker) {
      if (state.isComplete) {
        // Schedule the two-stage fade exactly once per completion.
        if (scheduledRef.current.has(callsign)) continue;
        scheduledRef.current.add(callsign);

        const fadeTimer = setTimeout(() => {
          setFadingOut((prev) => {
            const next = new Set(prev);
            next.add(callsign);
            return next;
          });
          timersRef.current.delete(`${callsign}:fade`);

          // After the fade animation completes, remove the row entirely.
          const hideTimer = setTimeout(() => {
            setHidden((prev) => {
              const next = new Set(prev);
              next.add(callsign);
              return next;
            });
            setFadingOut((prev) => {
              const next = new Set(prev);
              next.delete(callsign);
              return next;
            });
            timersRef.current.delete(`${callsign}:hide`);
          }, FADE_DURATION_MS);
          timersRef.current.set(`${callsign}:hide`, hideTimer);
        }, FADE_DELAY_MS);
        timersRef.current.set(`${callsign}:fade`, fadeTimer);
      } else if (scheduledRef.current.has(callsign)) {
        // QSO restarted (e.g. a fresh CQ from the same station): cancel the
        // pending fade and let the row reappear so it can re-complete later.
        const fadeTimer = timersRef.current.get(`${callsign}:fade`);
        const hideTimer = timersRef.current.get(`${callsign}:hide`);
        if (fadeTimer) clearTimeout(fadeTimer);
        if (hideTimer) clearTimeout(hideTimer);
        timersRef.current.delete(`${callsign}:fade`);
        timersRef.current.delete(`${callsign}:hide`);
        scheduledRef.current.delete(callsign);
        setFadingOut((prev) => {
          if (!prev.has(callsign)) return prev;
          const next = new Set(prev);
          next.delete(callsign);
          return next;
        });
        setHidden((prev) => {
          if (!prev.has(callsign)) return prev;
          const next = new Set(prev);
          next.delete(callsign);
          return next;
        });
      }
    }
  }, [qsoTracker]);

  // Clear every timer only on unmount. Also reset the "scheduled" guard so that
  // StrictMode's dev remount (which fires this cleanup, then re-runs the
  // scheduling effect) re-arms the fade timers instead of skipping them.
  useEffect(() => {
    const timers = timersRef.current;
    const scheduled = scheduledRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      scheduled.clear();
    };
  }, []);

  // Collect visible QSOs: active (non-complete) + recently completed that haven't fully hidden
  const visibleEntries = Array.from(qsoTracker.entries())
    .filter(([callsign]) => !hidden.has(callsign))
    .sort((a, b) => b[1].lastUpdateTime - a[1].lastUpdateTime)
    .slice(0, 5);

  // Only show if there's something to display
  if (visibleEntries.length === 0) return null;

  return (
    <div className="border-t border-white/10 p-2 bg-[#0f0f1a]">
      <div className="text-[8px] uppercase tracking-wider text-gray-600 font-semibold mb-1 px-2">
        Active QSOs
      </div>
      <div className="space-y-0.5">
        {visibleEntries.map(([callsign, state]) => (
          <QsoProgressRow
            key={callsign}
            state={state}
            isFadingOut={fadingOut.has(callsign)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── FateDecodeStats — 3x2 mission-control stats grid ───────────────────────

export function FateDecodeStats({
  stats,
  ft8DecoderStats,
}: {
  stats: {
    totalDecodes: number;
    uniqueCallsigns: number;
    newStations: number;
  };
  ft8DecoderStats: {
    totalDecodes: number;
    cyclesCompleted: number;
    lastCycleDecodes: number;
    workerReady: boolean;
  };
}) {
  const cells: Array<{
    label: string;
    value: string;
    accent?: string;
  }> = [
    {
      label: "DECODED",
      value: String(ft8DecoderStats.totalDecodes),
    },
    {
      label: "UNIQUE",
      value: String(stats.uniqueCallsigns),
    },
    {
      label: "LAST CYCLE",
      value: String(ft8DecoderStats.lastCycleDecodes),
    },
    {
      label: "NEW",
      value: String(stats.newStations),
      accent: stats.newStations > 0 ? "text-signal-green" : undefined,
    },
    {
      label: "CYCLES",
      value: String(ft8DecoderStats.cyclesCompleted),
    },
  ];

  return (
    <div className="border-t border-white/10 p-2">
      <div className="border border-white/5 rounded overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-white/5">
          {cells.map((cell) => (
            <div key={cell.label} className="bg-[#0f0f1a] px-2 py-1.5">
              <div className="text-[8px] uppercase tracking-wider text-gray-600 leading-none mb-0.5">
                {cell.label}
              </div>
              <div
                className={`text-[14px] font-mono font-bold tabular-nums leading-tight ${cell.accent ?? "text-white"}`}
              >
                {cell.value}
              </div>
            </div>
          ))}
          {/* WASM status cell */}
          <div className="bg-[#0f0f1a] px-2 py-1.5">
            <div className="text-[8px] uppercase tracking-wider text-gray-600 leading-none mb-0.5">
              WASM
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  ft8DecoderStats.workerReady
                    ? "bg-signal-green shadow-[0_0_4px_theme(colors.signal-green/0.5)]"
                    : "bg-alert-red shadow-[0_0_4px_theme(colors.alert-red/0.5)]"
                }`}
              />
              <span
                className={`text-[14px] font-mono font-bold leading-tight ${
                  ft8DecoderStats.workerReady
                    ? "text-signal-green"
                    : "text-alert-red"
                }`}
              >
                {ft8DecoderStats.workerReady ? "Ready" : "Loading"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FateDirectedMessages — Main panel component ────────────────────────────

export function FateDirectedMessages({
  directed,
  myCallsign,
  myGrid,
  stats,
  ft8DecoderStats,
  ft8DecoderEnabled,
  dxccData,
  qsoTracker,
}: FateDirectedMessagesProps) {
  const quickLog = useQSOStore((s) => s.quickLog);

  // Auto-scroll to bottom when a new directed message arrives. Keying on
  // directed.length fails once the 500-cap buffer saturates (length stops
  // changing), so track the newest row's identity instead (buffer is
  // newest-first, so directed[0] is the newest).
  const listRef = useRef<HTMLDivElement>(null);
  const newestDirected = directed[0];
  const newestDirectedKey = newestDirected
    ? `${newestDirected.epochMs}-${newestDirected.deltaFrequency}-${newestDirected.message}`
    : null;
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [newestDirectedKey]);

  const handleQuickLog = useCallback(
    (callsign: string) => {
      void quickLog(callsign);
    },
    [quickLog],
  );

  return (
    <div className="flex flex-col h-full bg-[#0c0c16] border-l border-white/10">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
          Directed Messages
        </span>
        {directed.length > 0 && (
          <span className="bg-cosmic-cyan/20 text-cosmic-cyan text-[10px] px-1.5 rounded-full font-mono tabular-nums min-w-[20px] text-center">
            {directed.length}
          </span>
        )}
        {ft8DecoderEnabled && directed.length === 0 && (
          <span className="text-[8px] text-signal-green/60 font-medium uppercase tracking-wider">
            Listening
          </span>
        )}
      </div>

      {/* ── Directed message list — scrollable ─────────────────────── */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-2 py-1 space-y-1 min-h-0 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
      >
        {directed.length === 0 ? (
          <EmptyState myCallsign={myCallsign} />
        ) : (
          directed.map((d) => (
            <DirectedRow
              key={d.rowKey}
              decode={d}
              onQuickLog={handleQuickLog}
              dxccInfo={
                d.parsedCallsign
                  ? dxccData?.get(d.parsedCallsign.toUpperCase())
                  : undefined
              }
            />
          ))
        )}
      </div>

      {/* ── Grid prompt if no grid configured ──────────────────────── */}
      {!myGrid && myCallsign && <GridPrompt />}

      {/* ── Active QSOs progress section ─────────────────────────── */}
      {qsoTracker && qsoTracker.size > 0 && (
        <FateActiveQsos qsoTracker={qsoTracker} />
      )}

      {/* ── Stats section — fixed at bottom ────────────────────────── */}
      <FateDecodeStats stats={stats} ft8DecoderStats={ft8DecoderStats} />
    </div>
  );
}

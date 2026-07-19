/**
 * FateBandActivity — Primary FT8 decode table for the Fate skin.
 *
 * This is the core interface where FT8 operators spend the majority of their
 * attention. Displays enriched decode rows in a dense, scannable CSS-grid table
 * with sort controls, color-coded SNR bars, CQ/directed highlighting, new-station
 * badges, and one-click quick-log functionality.
 *
 * Design: terminal-density meets modern dark-UI — tight mono rows, live-feed feel,
 * CQ rows visually pop as actionable opportunities, directed messages glow cyan.
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { useQSOStore } from "@/stores/qsoStore";
import type { EnrichedDecode } from "./useFateDecodes";
import type { DxccRowData } from "./useFateDxcc";

// ─── Props ───────────────────────────────────────────────────────────────────

interface FateBandActivityProps {
  decodes: EnrichedDecode[];
  myCallsign: string | null;
  activeBand: string | null;
  freqHz: number | null;
  showCqOnly: boolean;
  onCqFilterChange: (value: boolean) => void;
  dxccData?: Map<string, DxccRowData>;
  snrTrend?: Map<string, number[]>;
}

// ─── Sort configuration ──────────────────────────────────────────────────────

type SortField =
  | "time"
  | "snr"
  | "deltaFrequency"
  | "distanceKm"
  | "parsedCallsign";
type SortDir = "asc" | "desc";

const SORT_LABELS: Record<SortField, string> = {
  time: "UTC",
  snr: "SNR",
  deltaFrequency: "DF",
  distanceKm: "Dist",
  parsedCallsign: "Call",
};

// ─── SNR helpers ─────────────────────────────────────────────────────────────

function snrColorClass(snr: number): string {
  if (snr < -10) return "text-alert-red/70";
  if (snr <= 0) return "text-caution-amber";
  if (snr <= 10) return "text-signal-green";
  return "text-cosmic-cyan";
}

function snrBarColorClass(snr: number): string {
  if (snr < -10) return "bg-alert-red/50";
  if (snr <= 0) return "bg-caution-amber/50";
  if (snr <= 10) return "bg-signal-green/50";
  return "bg-cosmic-cyan/50";
}

/** Map SNR from -21..+30 to 0..100% for the proportional bar. */
function snrBarWidth(snr: number): number {
  const clamped = Math.max(-21, Math.min(30, snr));
  return ((clamped + 21) / 51) * 100;
}

// ─── Sort comparator ─────────────────────────────────────────────────────────

function compareDecode(
  a: EnrichedDecode,
  b: EnrichedDecode,
  field: SortField,
  dir: SortDir,
): number {
  const mul = dir === "asc" ? 1 : -1;

  switch (field) {
    case "time":
      // Order by absolute time (epochMs) so "newest first" stays correct across
      // UTC midnight; the UTC column still shows time-of-day.
      return (a.epochMs - b.epochMs) * mul;
    case "snr":
      return (a.snr - b.snr) * mul;
    case "deltaFrequency":
      return (a.deltaFrequency - b.deltaFrequency) * mul;
    case "distanceKm": {
      const aD = a.distanceKm ?? Infinity;
      const bD = b.distanceKm ?? Infinity;
      return (aD - bD) * mul;
    }
    case "parsedCallsign": {
      const aC = a.parsedCallsign ?? "";
      const bC = b.parsedCallsign ?? "";
      return aC.localeCompare(bC) * mul;
    }
    default:
      return 0;
  }
}

// ─── Icons (inline SVG) ─────────────────────────────────────────────────────

function LogBookIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Book shape */}
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <line x1="5" y1="2" x2="5" y2="14" />
      <line x1="7" y1="5" x2="12" y2="5" />
      <line x1="7" y1="8" x2="11" y2="8" />
    </svg>
  );
}

function CheckmarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 8.5 6.5 12 13 4" />
    </svg>
  );
}

function SortArrow({ dir }: { dir: SortDir }) {
  return (
    <span className="ml-0.5 text-[8px] leading-none text-plasma-orange">
      {dir === "asc" ? "\u25B2" : "\u25BC"}
    </span>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 6 8 10 12 6" />
    </svg>
  );
}

// ─── SNR trend sparkline ─────────────────────────────────────────────────────

/** Hex color for sparkline stroke based on the most recent SNR value. */
function snrTrendHex(snr: number): string {
  if (snr >= 0) return "#00ff88";
  if (snr >= -10) return "#00d4ff";
  if (snr >= -18) return "#fbbf24";
  return "#ff3344";
}

/** Trend direction from the last 3 values. */
function snrTrendArrow(values: number[]): string {
  if (values.length < 3) return "";
  const a = values[values.length - 3];
  const b = values[values.length - 2];
  const c = values[values.length - 1];
  if (b >= a && c >= b) return "\u2191"; // upward
  if (b <= a && c <= b) return "\u2193"; // downward
  return "\u2192"; // stable
}

function SnrSparkline({ values }: { values: number[] }) {
  const w = 36;
  const h = 12;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(10, max - min);
  const mid = (min + max) / 2;
  const lo = mid - range / 2;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - lo) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const lastSnr = values[values.length - 1];
  const color = snrTrendHex(lastSnr);
  const arrow = snrTrendArrow(values);

  return (
    <span className="inline-flex items-center gap-0.5">
      <svg width={w} height={h} className="inline-block align-middle">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {arrow && (
        <span className="text-[8px] leading-none" style={{ color }}>
          {arrow}
        </span>
      )}
    </span>
  );
}

// ─── Column grid template ────────────────────────────────────────────────────

const GRID_COLS = "64px 48px 40px 56px 1fr 80px 52px 56px 40px 32px";

// ─── BandActivityHeader ──────────────────────────────────────────────────────

interface HeaderProps {
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

function BandActivityHeader({ sortField, sortDir, onSort }: HeaderProps) {
  const sortable = (field: SortField, label: string, align: string) => {
    const active = sortField === field;
    return (
      <button
        type="button"
        className={`flex items-center gap-0 ${align} select-none transition-colors hover:text-gray-300 ${
          active ? "text-plasma-orange" : ""
        }`}
        onClick={() => onSort(field)}
        title={`Sort by ${SORT_LABELS[field]}`}
      >
        {label}
        {active && <SortArrow dir={sortDir} />}
      </button>
    );
  };

  return (
    <div
      className="grid items-center px-1.5 py-1 text-[9px] uppercase tracking-wider text-gray-500 font-medium bg-[#0c0c16] border-b border-white/[0.06] select-none shrink-0"
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      {sortable("time", "UTC", "justify-start")}
      {sortable("snr", "SNR", "justify-end")}
      <span className="text-center">Trd</span>
      {sortable("deltaFrequency", "DF", "justify-end")}
      <span className="pl-1">Message</span>
      {sortable("parsedCallsign", "Call", "justify-start")}
      <span>Grid</span>
      {sortable("distanceKm", "Dist", "justify-end")}
      <span className="text-right">Brg</span>
      <span className="text-center">Log</span>
    </div>
  );
}

// ─── FateDecodeRow ───────────────────────────────────────────────────────────

interface RowProps {
  decode: EnrichedDecode;
  myCallsign: string | null;
  isLogged: boolean;
  onQuickLog: (callsign: string) => void;
  dxccInfo?: DxccRowData;
  snrHistory?: number[];
}

export function FateDecodeRow({
  decode,
  myCallsign,
  isLogged,
  onQuickLog,
  dxccInfo,
  snrHistory,
}: RowProps) {
  const [flashActive, setFlashActive] = useState(false);
  const d = decode;

  const isDirected =
    myCallsign != null &&
    d.message.toUpperCase().includes(myCallsign.toUpperCase());

  // Row background/border classification — DXCC status overrides for CQ rows
  const isNewEntity = dxccInfo && !dxccInfo.isWorked && dxccInfo.entity != null;
  let rowClass = "bg-white/[0.02] hover:bg-white/[0.05]";
  if (isDirected) {
    rowClass = "bg-cosmic-cyan/8 border-l-2 border-cosmic-cyan/60";
  } else if (d.isFoxMulti || d.foxCallsign) {
    // Fox multi-call or compound message — amber-gold left border
    rowClass = "border-l-2 border-amber-400/60 bg-amber-500/5";
  } else if (d.isHoundResponse) {
    // Hound responding to detected Fox — subtle amber tint
    rowClass = "bg-amber-500/[0.03] hover:bg-amber-500/[0.06]";
  } else if (d.isCQ && isNewEntity) {
    // New DXCC entity calling CQ — gold highlight (highest priority)
    rowClass = "bg-caution-amber/8 border-l-2 border-caution-amber/60";
  } else if (d.isCQ) {
    rowClass = "bg-signal-green/8 border-l-2 border-signal-green/60";
  } else if (dxccInfo?.isWorked) {
    rowClass = "bg-white/[0.015] hover:bg-white/[0.04] opacity-75";
  }

  if (d.lowConfidence) {
    rowClass += " opacity-50";
  }

  if (flashActive) {
    rowClass += " !bg-signal-green/20";
  }

  const handleLog = useCallback(() => {
    if (!d.parsedCallsign || isLogged) return;
    onQuickLog(d.parsedCallsign);
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 600);
  }, [d.parsedCallsign, isLogged, onQuickLog]);

  return (
    <div
      className={`grid items-center px-1.5 py-0.5 font-mono text-[11px] leading-tight transition-colors duration-150 ${rowClass}`}
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      {/* UTC */}
      <span className="text-gray-400 tabular-nums">{d.utcFormatted}</span>

      {/* SNR with proportional bar */}
      <div className="relative text-right pr-0.5">
        <span
          className={`relative z-10 tabular-nums font-medium ${snrColorClass(d.snr)}`}
        >
          {d.snr > 0 ? `+${d.snr}` : d.snr}
        </span>
        {/* Proportional SNR bar at bottom of cell */}
        <div
          className="absolute bottom-0 left-0 h-[2px] rounded-full"
          style={{ width: `${snrBarWidth(d.snr)}%` }}
        >
          <div className={`h-full rounded-full ${snrBarColorClass(d.snr)}`} />
        </div>
      </div>

      {/* SNR Trend Sparkline */}
      <div className="flex items-center justify-center">
        {snrHistory && snrHistory.length >= 3 && (
          <SnrSparkline values={snrHistory} />
        )}
      </div>

      {/* Delta Frequency */}
      <span className="text-right tabular-nums text-gray-400 pr-0.5">
        {d.deltaFrequency}
        <span className="text-gray-600 text-[9px] ml-0.5">Hz</span>
      </span>

      {/* Message — the full decoded text */}
      <span
        className={`truncate pl-1 ${
          d.isFoxMulti || d.foxCallsign
            ? "text-amber-300/90"
            : d.isCQ
              ? "text-signal-green/90"
              : isDirected
                ? "text-cosmic-cyan/90"
                : "text-gray-300"
        }`}
        title={d.message}
      >
        {(d.isFoxMulti || d.foxCallsign) && (
          <span className="text-[10px] mr-0.5" aria-label="Fox">
            {"\uD83E\uDD8A"}
          </span>
        )}
        {d.message}
      </span>

      {/* Callsign + DXCC entity + badges */}
      <div
        className="flex items-center gap-1 min-w-0"
        title={dxccInfo?.entity?.name ?? undefined}
      >
        <span
          className={`truncate font-semibold ${dxccInfo?.isWorked ? "text-gray-400" : "text-white"}`}
        >
          {d.parsedCallsign ?? ""}
        </span>
        {d.foxCallsign && d.parsedCallsign && (
          <span className="shrink-0 bg-amber-500/20 text-amber-400 text-[7px] font-bold px-1 rounded leading-normal">
            FOX
          </span>
        )}
        {isNewEntity && d.parsedCallsign && (
          <span className="shrink-0 bg-caution-amber/20 text-caution-amber text-[7px] px-1 rounded font-bold leading-normal">
            DXCC
          </span>
        )}
        {d.isNewStation &&
          d.parsedCallsign &&
          !isNewEntity &&
          !d.foxCallsign && (
            <span className="shrink-0 bg-plasma-orange/20 text-plasma-orange text-[7px] px-1 rounded font-bold leading-normal">
              NEW
            </span>
          )}
      </div>

      {/* Grid locator */}
      <span className="text-gray-500 tabular-nums text-[10px]">
        {d.parsedGrid ?? ""}
      </span>

      {/* Distance */}
      <span className="text-right tabular-nums text-gray-400 text-[10px]">
        {d.distanceKm != null ? (
          <>
            {Math.round(d.distanceKm).toLocaleString()}
            <span className="text-gray-600 text-[8px] ml-0.5">km</span>
          </>
        ) : (
          <span className="text-gray-600">---</span>
        )}
      </span>

      {/* Bearing */}
      <span className="text-right tabular-nums text-gray-400 text-[10px]">
        {d.bearingDeg != null ? (
          <>
            {Math.round(d.bearingDeg)}
            <span className="text-gray-600">&deg;</span>
          </>
        ) : (
          <span className="text-gray-600">---</span>
        )}
      </span>

      {/* Quick-log button */}
      <div className="flex items-center justify-center">
        {d.parsedCallsign != null && (
          <button
            type="button"
            className={`w-5 h-5 flex items-center justify-center rounded transition-all ${
              isLogged
                ? "text-signal-green cursor-default"
                : "text-gray-600 hover:text-signal-green hover:bg-signal-green/10 active:scale-90"
            }`}
            onClick={handleLog}
            disabled={isLogged}
            title={
              isLogged
                ? `${d.parsedCallsign} logged`
                : `Quick-log ${d.parsedCallsign}`
            }
          >
            {isLogged ? (
              <CheckmarkIcon className="w-3.5 h-3.5" />
            ) : (
              <LogBookIcon className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── JumpToLatestButton ──────────────────────────────────────────────────────

function JumpToLatestButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-2 right-3 z-10 flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0c0c16]/90 border border-white/10 text-[10px] font-medium text-gray-300 hover:text-white hover:border-plasma-orange/40 hover:bg-[#0c0c16] transition-all shadow-lg backdrop-blur-sm"
    >
      <ChevronDown className="w-3 h-3 rotate-180" />
      Jump to latest
    </button>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12 select-none">
      <span className="text-sm font-medium text-gray-500 animate-pulse">
        Waiting for decodes&hellip;
      </span>
      <span className="text-[11px] text-gray-600">
        FT8 signals will appear here as they are decoded.
      </span>
    </div>
  );
}

// ─── Cycle boundary helpers ──────────────────────────────────────────────────

/** Convert a cycleId back to a UTC time string for display. */
function formatUtcFromCycleId(
  cycleId: number,
  cycleDurationMs: number,
): string {
  const ms = cycleId * cycleDurationMs;
  const totalSeconds = Math.floor(ms / 1000);
  const hh = Math.floor(totalSeconds / 3600) % 24;
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}Z`;
}

function CycleSeparator({
  cycleId,
  cycleDurationMs,
}: {
  cycleId: number;
  cycleDurationMs: number;
}) {
  return (
    <div className="flex items-center px-2 py-0.5 border-y border-white/5 bg-[#0a0a14]">
      <span className="text-[8px] text-gray-600 font-mono">
        ── Cycle {formatUtcFromCycleId(cycleId, cycleDurationMs)} ──
      </span>
    </div>
  );
}

// ─── FateBandActivity (main export) ──────────────────────────────────────────

export function FateBandActivity({
  decodes,
  myCallsign,
  activeBand,
  freqHz,
  showCqOnly,
  onCqFilterChange,
  dxccData,
  snrTrend,
}: FateBandActivityProps) {
  // ── Sort state ──
  const [sortField, setSortField] = useState<SortField>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Logged callsigns (local session tracker) ──
  const [loggedCallsigns, setLoggedCallsigns] = useState<Set<string>>(
    () => new Set(),
  );

  // ── Scroll / auto-scroll ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // Toggle sort on column click
  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        // Default directions: time descending, SNR descending, others ascending
        setSortDir(field === "time" || field === "snr" ? "desc" : "asc");
      }
    },
    [sortField],
  );

  // Sorted + filtered decodes (memoized)
  const sortedDecodes = useMemo(() => {
    let arr = [...decodes];
    if (showCqOnly) {
      arr = arr.filter((d) => d.isCQ);
    }
    arr.sort((a, b) => compareDecode(a, b, sortField, sortDir));
    return arr;
  }, [decodes, sortField, sortDir, showCqOnly]);

  // CQ count for badge display
  const cqCount = useMemo(
    () => decodes.filter((d) => d.isCQ).length,
    [decodes],
  );

  // Detected Fox callsign (shared across all rows by the enrichment pass)
  const detectedFoxCallsign = useMemo(
    () =>
      decodes.find((d) => d.detectedFoxCallsign)?.detectedFoxCallsign ?? null,
    [decodes],
  );

  // Scroll handler — detect user scroll to pause auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 4;
    autoScrollRef.current = atTop;
    setShowJump(!atTop);
  }, []);

  // Auto-scroll to top when a new decode arrives (if auto-scroll active).
  // Keying on decodes.length fails once the 500-cap buffer saturates (length
  // stops changing), so track the newest row's identity instead. The enriched
  // buffer is newest-first, so decodes[0] is the newest row.
  const newest = decodes[0];
  const newestKey = newest
    ? `${newest.epochMs}-${newest.deltaFrequency}-${newest.message}`
    : null;
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [newestKey]);

  // Jump to latest
  const jumpToLatest = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      autoScrollRef.current = true;
      setShowJump(false);
    }
  }, []);

  // Quick-log handler — passes FT8-specific fields to the updated quickLog
  const handleQuickLog = useCallback(
    (callsign: string, decode?: EnrichedDecode) => {
      useQSOStore.getState().quickLog(callsign, {
        mode: decode?.mode || "FT8",
        band: activeBand ?? undefined,
        frequency: freqHz ? freqHz / 1000 : undefined,
        grid: decode?.parsedGrid ?? undefined,
        snr: decode?.snr,
      });
      setLoggedCallsigns((prev) => {
        const next = new Set(prev);
        next.add(callsign.toUpperCase());
        return next;
      });
    },
    [activeBand, freqHz],
  );

  // ── Build rows with cycle separators + staleness fade ──
  const renderRows = useMemo(() => {
    const rows: React.ReactNode[] = [];
    let lastCycleId: number | null = null;

    // Compute the most recent cycleId for staleness detection.
    // Only apply staleness when sorted by time descending (the default feed view).
    const applyStaleness = sortField === "time" && sortDir === "desc";
    let maxCycleId = 0;
    if (applyStaleness && sortedDecodes.length > 0) {
      for (const d of sortedDecodes) {
        if (d.cycleId > maxCycleId) maxCycleId = d.cycleId;
      }
    }

    for (const d of sortedDecodes) {
      // Insert cycle boundary separator when cycleId changes
      if (lastCycleId !== null && d.cycleId !== lastCycleId) {
        const cycleDurationMs = d.mode === "FT4" ? 7500 : 15000;
        rows.push(
          <CycleSeparator
            key={`cycle-sep-${d.cycleId}`}
            cycleId={d.cycleId}
            cycleDurationMs={cycleDurationMs}
          />,
        );
      }
      lastCycleId = d.cycleId;

      const dxccInfo = d.parsedCallsign
        ? dxccData?.get(d.parsedCallsign.toUpperCase())
        : undefined;

      // A decode is "stale" if it's older than 2 full cycles
      const isStale = applyStaleness && d.cycleId < maxCycleId - 1;

      const callUpper = d.parsedCallsign?.toUpperCase() ?? null;
      const snrHistory = callUpper ? snrTrend?.get(callUpper) : undefined;

      const row = (
        <FateDecodeRow
          key={d.rowKey}
          decode={d}
          myCallsign={myCallsign}
          isLogged={
            d.parsedCallsign != null &&
            loggedCallsigns.has(d.parsedCallsign.toUpperCase())
          }
          onQuickLog={(cs) => handleQuickLog(cs, d)}
          dxccInfo={dxccInfo}
          snrHistory={snrHistory}
        />
      );

      if (isStale) {
        rows.push(
          <div
            key={`stale-${d.rowKey}`}
            className="opacity-40 transition-opacity duration-500"
          >
            {row}
          </div>,
        );
      } else {
        rows.push(row);
      }
    }

    return rows;
  }, [
    sortedDecodes,
    myCallsign,
    loggedCallsigns,
    handleQuickLog,
    dxccData,
    snrTrend,
    sortField,
    sortDir,
  ]);

  // ── Render ──
  if (decodes.length === 0) {
    return (
      <div className="flex flex-col min-h-0 bg-[#080810] rounded-b">
        <BandActivityHeader
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-0 bg-[#080810]">
      {/* CQ filter bar */}
      <div className="flex items-center gap-2 px-2 py-1 bg-[#0c0c16] border-b border-white/[0.04] shrink-0">
        <button
          type="button"
          onClick={() => onCqFilterChange(!showCqOnly)}
          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
            showCqOnly
              ? "bg-signal-green/15 text-signal-green"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          CQ
          {cqCount > 0 && (
            <span className="ml-1 text-[9px] opacity-70">({cqCount})</span>
          )}
        </button>
        <span className="text-[9px] text-gray-600 font-mono">
          {sortedDecodes.length} decode{sortedDecodes.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Fixed header */}
      <BandActivityHeader
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
      />

      {/* DXpedition banner — shown when a Fox is detected */}
      {detectedFoxCallsign && (
        <div className="bg-amber-500/10 border-b border-amber-400/20 px-3 py-1 text-[10px] text-amber-400 font-mono shrink-0 flex items-center gap-1.5">
          <span className="text-[10px]">{"\uD83E\uDD8A"}</span>
          <span>
            DXpedition detected:{" "}
            <span className="font-bold text-amber-300">
              {detectedFoxCallsign}
            </span>
          </span>
        </div>
      )}

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
        onScroll={handleScroll}
      >
        {renderRows}
      </div>

      {/* Jump to latest floating button */}
      {showJump && <JumpToLatestButton onClick={jumpToLatest} />}
    </div>
  );
}

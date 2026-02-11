/**
 * ContestRatePanel -- Floating panel showing live QSO rate analytics
 * and band-switching suggestions during contest operation.
 *
 * Reads from contestStore for QSO data, featureFlags for gating, and
 * bandAdvisor for QSY recommendations. Designed as a compact ~280px
 * floating overlay matching the dark space theme.
 *
 * Feature-gated behind `contestWatch` (pro tier only).
 * Renders nothing if the flag is off or no active contest session exists.
 *
 * @module components/map/ContestRatePanel
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useContestStore } from "@/stores/contestStore";
import type { ContestQSO } from "@/stores/contestStore";
import { useFeatureFlags } from "@/lib/featureFlags";
import { getBandChangeAdvice } from "@/lib/contest/bandAdvisor";
import type { BandAdvice } from "@/lib/contest/bandAdvisor";
import { getContestById } from "@/lib/data/contests";
import { BAND_COLORS } from "@/lib/utils/spotColors";

// ============================================================================
// Types
// ============================================================================

interface ContestRatePanelProps {
  className?: string;
}

type RateTrend = "up" | "down" | "flat";

interface RateSnapshot {
  /** Current QSO rate (QSOs/hr), rolling 10-min window */
  currentRate: number;
  /** Previous QSO rate (QSOs/hr), minutes 10-20 window */
  previousRate: number;
  /** Trend direction derived from current vs previous */
  trend: RateTrend;
  /** Per-band rate (QSOs/hr) from last 60 minutes */
  rateByBand: Record<string, number>;
  /** Band of the most recent QSO (for bandAdvisor) */
  lastBand: string | null;
}

// ============================================================================
// Constants
// ============================================================================

/** Rolling window for current rate calculation (ms) */
const CURRENT_WINDOW_MS = 10 * 60 * 1000;

/** Previous rate window spans minutes 10-20 (ms) */
const PREVIOUS_WINDOW_MS = 20 * 60 * 1000;

/** Band rate window -- last 60 minutes (ms) */
const BAND_WINDOW_MS = 60 * 60 * 1000;

/** Rate refresh interval (ms) */
const REFRESH_INTERVAL_MS = 30 * 1000;

/** Trend threshold: current must exceed previous by 10% to count as "up" */
const TREND_UP_FACTOR = 1.1;

/** Trend threshold: current must be below previous by 10% to count as "down" */
const TREND_DOWN_FACTOR = 0.9;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a QSO timestamp string into epoch milliseconds.
 * Falls back to 0 if unparseable.
 */
function parseQsoTime(timestamp: string): number {
  const d = new Date(timestamp);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Compute a rate snapshot from a list of QSOs.
 *
 * - currentRate: QSOs in last 10 minutes, extrapolated to per-hour
 * - previousRate: QSOs in minutes 10-20, extrapolated to per-hour
 * - trend: "up" | "down" | "flat"
 * - rateByBand: per-band QSO count in last 60 min, extrapolated to per-hour
 * - lastBand: band of most recent QSO
 */
function computeRateSnapshot(qsos: ContestQSO[]): RateSnapshot {
  const now = Date.now();
  const currentCutoff = now - CURRENT_WINDOW_MS;
  const previousCutoff = now - PREVIOUS_WINDOW_MS;
  const bandCutoff = now - BAND_WINDOW_MS;

  let currentCount = 0;
  let previousCount = 0;
  const bandCounts: Record<string, number> = {};
  let lastBand: string | null = null;
  let latestTs = 0;

  for (const qso of qsos) {
    if (qso.isDupe) continue;

    const ts = parseQsoTime(qso.timestamp);
    if (ts === 0) continue;

    // Track most recent QSO for lastBand
    if (ts > latestTs) {
      latestTs = ts;
      lastBand = qso.band;
    }

    // Current window (last 10 min)
    if (ts >= currentCutoff) {
      currentCount++;
    }
    // Previous window (minutes 10-20)
    else if (ts >= previousCutoff) {
      previousCount++;
    }

    // Band window (last 60 min)
    if (ts >= bandCutoff) {
      const band = qso.band;
      bandCounts[band] = (bandCounts[band] ?? 0) + 1;
    }
  }

  // Extrapolate to per-hour: count in 10 min * 6 = per hour
  const currentRate = currentCount * 6;
  const previousRate = previousCount * 6;

  // Determine trend
  let trend: RateTrend = "flat";
  if (previousRate > 0) {
    if (currentRate > previousRate * TREND_UP_FACTOR) {
      trend = "up";
    } else if (currentRate < previousRate * TREND_DOWN_FACTOR) {
      trend = "down";
    }
  } else if (currentRate > 0) {
    trend = "up";
  }

  // Extrapolate band counts to per-hour
  const rateByBand: Record<string, number> = {};
  for (const [band, count] of Object.entries(bandCounts)) {
    rateByBand[band] = Math.round(count * (60 / 60)); // count per 60 min * 1
  }

  return { currentRate, previousRate, trend, rateByBand, lastBand };
}

/**
 * Format elapsed time from a start ISO string to now as "Xh Ym".
 */
function formatDuration(startTime: string): string {
  const start = new Date(startTime).getTime();
  if (isNaN(start)) return "--";
  const elapsedMs = Date.now() - start;
  const totalMin = Math.max(0, Math.floor(elapsedMs / 60_000));
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/**
 * Get a hex color for a band, falling back to a neutral blue.
 */
function bandColor(band: string): string {
  return BAND_COLORS[band.toLowerCase()] ?? BAND_COLORS.default ?? "#4488ff";
}

/**
 * Map BandAdvice type to a Tailwind border/text color class set.
 */
function adviceColors(type: BandAdvice["type"]): {
  border: string;
  text: string;
  bg: string;
} {
  switch (type) {
    case "stay":
      return {
        border: "border-signal-green/40",
        text: "text-signal-green",
        bg: "bg-signal-green/10",
      };
    case "consider_qsy":
      return {
        border: "border-caution-amber/40",
        text: "text-caution-amber",
        bg: "bg-caution-amber/10",
      };
    case "opportunity":
      return {
        border: "border-plasma-orange/40",
        text: "text-plasma-orange",
        bg: "bg-plasma-orange/10",
      };
    case "predicted_opening":
      return {
        border: "border-blue-400/40",
        text: "text-blue-400",
        bg: "bg-blue-400/10",
      };
  }
}

// ============================================================================
// Trend Arrow SVG
// ============================================================================

function TrendArrow({ trend }: { trend: RateTrend }) {
  if (trend === "up") {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="text-signal-green inline-block ml-1"
        aria-label="Rate trending up"
      >
        <path
          d="M6 10V3M6 3L3 6M6 3L9 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (trend === "down") {
    return (
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="text-alert-red inline-block ml-1"
        aria-label="Rate trending down"
      >
        <path
          d="M6 2V9M6 9L3 6M6 9L9 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // flat
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className="text-white/40 inline-block ml-1"
      aria-label="Rate steady"
    >
      <path
        d="M2 6H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ============================================================================
// Component
// ============================================================================

/**
 * Floating panel that shows live QSO rate analytics and band-switching
 * suggestions during contest operation.
 *
 * Feature-gated: renders nothing unless `contestWatch` is enabled and
 * an active contest session exists.
 *
 * @example
 * ```tsx
 * <ContestRatePanel className="absolute bottom-4 right-4" />
 * ```
 */
export function ContestRatePanel({ className }: ContestRatePanelProps) {
  const featureFlags = useFeatureFlags();
  const activeSession = useContestStore((s) => s.activeSession);

  const [collapsed, setCollapsed] = useState(false);

  // Force re-render every 30s to keep rates fresh
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, REFRESH_INTERVAL_MS);
    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
      }
    };
  }, []);

  // ── Rate computation ──
  const rateSnapshot = useMemo<RateSnapshot>(() => {
    if (!activeSession || activeSession.qsos.length === 0) {
      return {
        currentRate: 0,
        previousRate: 0,
        trend: "flat",
        rateByBand: {},
        lastBand: null,
      };
    }
    return computeRateSnapshot(activeSession.qsos);
  }, [activeSession]);

  // ── Band advice ──
  const advice = useMemo<BandAdvice | null>(() => {
    if (!rateSnapshot.lastBand) return null;
    return getBandChangeAdvice(
      rateSnapshot.lastBand,
      rateSnapshot.currentRate,
      0, // historicalRate: not yet available
      {}, // spotsByBand: from a different pipeline
      [], // predictions: empty
      [], // neededMults: will be wired in Wave 3
    );
  }, [rateSnapshot]);

  // ── Contest definition ──
  const contestName = useMemo(() => {
    if (!activeSession) return "";
    const def = getContestById(activeSession.contestId);
    return def?.name ?? activeSession.contestId;
  }, [activeSession]);

  // ── Sorted band entries for the bar chart ──
  const sortedBands = useMemo(() => {
    return Object.entries(rateSnapshot.rateByBand)
      .filter(([, rate]) => rate > 0)
      .sort(([, a], [, b]) => b - a);
  }, [rateSnapshot.rateByBand]);

  const maxBandRate = useMemo(() => {
    if (sortedBands.length === 0) return 1;
    return Math.max(...sortedBands.map(([, rate]) => rate), 1);
  }, [sortedBands]);

  // ── Toggle handler ──
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  // ── Feature gate ──
  if (!featureFlags.contestWatch) {
    return null;
  }

  // ── No active session ──
  if (!activeSession || !activeSession.isActive) {
    return null;
  }

  // ── Collapsed mini pill ──
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={toggleCollapsed}
        className={`
          inline-flex items-center gap-1.5
          bg-void-black/90 backdrop-blur-md border border-white/10 rounded-full
          px-3 py-1.5 text-xs font-medium text-white/80
          hover:border-white/20 transition-colors select-none cursor-pointer
          ${className ?? ""}
        `}
        aria-label="Expand contest rate panel"
        role="status"
      >
        <span className="text-[10px] uppercase tracking-wider text-white/50 font-semibold">
          RATE
        </span>
        <span className="tabular-nums font-semibold text-white">
          {Math.round(rateSnapshot.currentRate)}/hr
        </span>
        <TrendArrow trend={rateSnapshot.trend} />
      </button>
    );
  }

  // ── Expanded panel ──
  const adviceStyle = advice ? adviceColors(advice.type) : null;
  const isOpportunity = advice?.type === "opportunity";

  return (
    <div
      className={`
        w-[280px]
        bg-void-black/90 backdrop-blur-md border border-white/10 rounded-xl shadow-xl
        select-none
        ${className ?? ""}
      `}
      role="region"
      aria-label="Contest rate analytics"
    >
      {/* ── Header ── */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 rounded-t-xl transition-colors cursor-pointer"
        aria-label="Collapse contest rate panel"
      >
        <div className="flex flex-col items-start min-w-0">
          <span className="text-xs font-medium text-white truncate max-w-[200px]">
            {contestName}
          </span>
          <span className="text-[10px] text-white/40 tabular-nums">
            {formatDuration(activeSession.startTime)} elapsed
          </span>
        </div>
        {/* Collapse chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className="text-white/40 shrink-0 ml-2"
        >
          <path
            d="M3 7L6 4L9 7"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="border-t border-white/5" />

      {/* ── Rate display ── */}
      <div className="px-3 py-2.5">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tabular-nums text-white leading-none">
            {Math.round(rateSnapshot.currentRate)}
          </span>
          <span className="text-xs text-white/40">/hr</span>
          <TrendArrow trend={rateSnapshot.trend} />
        </div>
        <div className="text-[10px] text-white/30 mt-0.5">
          10-min rolling average
        </div>
      </div>

      {/* ── Band rate bars ── */}
      {sortedBands.length > 0 && (
        <>
          <div className="border-t border-white/5" />
          <div className="px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-1.5">
              Rate by Band
            </div>
            <div className="space-y-1">
              {sortedBands.map(([band, rate]) => {
                const widthPct = Math.max(
                  8,
                  Math.round((rate / maxBandRate) * 100),
                );
                const color = bandColor(band);
                return (
                  <div key={band} className="flex items-center gap-2">
                    <span className="text-[10px] text-white/60 w-8 text-right shrink-0 tabular-nums">
                      {band}
                    </span>
                    <div className="flex-1 h-3 rounded-sm overflow-hidden bg-white/5">
                      <div
                        className="h-full rounded-sm transition-all duration-300"
                        style={{
                          width: `${widthPct}%`,
                          backgroundColor: color,
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-white/50 w-6 text-right shrink-0 tabular-nums">
                      {rate}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Band advice ── */}
      {advice && advice.type !== "stay" && adviceStyle && (
        <>
          <div className="border-t border-white/5" />
          <div className="px-3 py-2">
            <div
              className={`
                text-[11px] px-2 py-1.5 rounded-md border
                ${adviceStyle.border} ${adviceStyle.bg} ${adviceStyle.text}
                ${isOpportunity ? "contest-rate-pulse" : ""}
              `}
            >
              {advice.message}
              {advice.targetBand && advice.type === "consider_qsy" && (
                <span className="text-white/40"> -- consider QSY</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Score summary ── */}
      <div className="border-t border-white/5" />
      <div className="px-3 py-2 flex items-center justify-between text-[10px] text-white/50">
        <div className="flex items-center gap-3">
          <span>
            <span className="text-white/70 font-medium tabular-nums">
              {activeSession.qsos.filter((q) => !q.isDupe).length}
            </span>{" "}
            Qs
          </span>
          <span>
            <span className="text-white/70 font-medium tabular-nums">
              {activeSession.totalMultipliers}
            </span>{" "}
            Mult
          </span>
        </div>
        <span className="font-medium text-white/70 tabular-nums">
          {activeSession.totalScore.toLocaleString()} pts
        </span>
      </div>

      {/* ── Pulse animation for opportunity advice ── */}
      <style>{`
        @keyframes contestRatePulse {
          0%, 100% { border-color: rgba(255, 138, 0, 0.4); }
          50% { border-color: rgba(255, 138, 0, 0.8); }
        }
        .contest-rate-pulse {
          animation: contestRatePulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

ContestRatePanel.displayName = "ContestRatePanel";

export default ContestRatePanel;

/**
 * Horizontal S-meter bar for the FlexRadio SmartSDR-inspired skin.
 *
 * ITU HF S-meter standard:
 *   S9 = -73 dBm, each S-unit = 6 dB
 *   S1 = -121, S2 = -115, ... S9 = -73
 *   Above S9: S9+10 = -63, S9+20 = -53, S9+30 = -43, S9+40 = -33
 *
 * Display range: -130 dBm (S0) to -23 dBm (S9+50)
 */

import { useMemo } from "react";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface FlexSmeterProps {
  /** S-meter reading in dBm */
  dbm: number | undefined;
  className?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DBM_MIN = -130; // S0
const DBM_MAX = -23; // S9+50
const DBM_RANGE = DBM_MAX - DBM_MIN; // 107 dB total range

const S9_DBM = -73;
const S1_DBM = -121;
const DB_PER_S_UNIT = 6;

/** Tick marks: S-unit labels and their dBm values */
const S_TICKS = [
  { label: "S1", dbm: -121 },
  { label: "S3", dbm: -109 },
  { label: "S5", dbm: -97 },
  { label: "S7", dbm: -85 },
  { label: "S9", dbm: -73 },
] as const;

const OVER_TICKS = [
  { label: "+10", dbm: -63 },
  { label: "+20", dbm: -53 },
  { label: "+30", dbm: -43 },
  { label: "+40", dbm: -33 },
] as const;

const ALL_TICKS = [...S_TICKS, ...OVER_TICKS];

// ─── Helpers ────────────────────────────────────────────────────────────────

function dbmToPercent(dbm: number): number {
  return Math.max(0, Math.min(100, ((dbm - DBM_MIN) / DBM_RANGE) * 100));
}

/** S9 boundary as percentage of total bar width */
const S9_PERCENT = dbmToPercent(S9_DBM);

function formatReadout(dbm: number | undefined): string {
  if (dbm === undefined) return "\u2014";

  // Below S1: show raw dBm
  if (dbm < S1_DBM) {
    return `${Math.round(dbm)}`;
  }

  // S1 through S9
  if (dbm <= S9_DBM) {
    const sUnit = Math.round((dbm - S1_DBM) / DB_PER_S_UNIT) + 1;
    const clamped = Math.max(1, Math.min(9, sUnit));
    return `S${clamped}`;
  }

  // Over S9: round overDb to nearest 5
  const overDb = dbm - S9_DBM;
  const rounded = Math.round(overDb / 5) * 5;
  const display = Math.max(5, rounded);
  return `S9+${display}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function FlexSmeter({ dbm, className = "" }: FlexSmeterProps) {
  const fillPercent = useMemo(
    () => (dbm !== undefined ? dbmToPercent(dbm) : 0),
    [dbm],
  );

  const readout = useMemo(() => formatReadout(dbm), [dbm]);

  // How much of the fill is in the green zone vs. the red zone
  const greenWidth = Math.min(fillPercent, S9_PERCENT);
  const redWidth = Math.max(0, fillPercent - S9_PERCENT);

  return (
    <div
      className={`w-full select-none ${className}`}
      role="meter"
      aria-label="S-meter"
      aria-valuenow={dbm ?? undefined}
      aria-valuemin={DBM_MIN}
      aria-valuemax={DBM_MAX}
      aria-valuetext={readout}
    >
      <div className="relative h-7 bg-black/60 border border-white/10 rounded-sm overflow-hidden">
        {/* ── Filled bar ──────────────────────────────────────────── */}
        <div className="absolute inset-0 flex">
          {/* Green zone: S0-S9 */}
          <div
            className="h-full transition-all duration-150 ease-out"
            style={{
              width: `${greenWidth}%`,
              background:
                greenWidth > 0
                  ? "linear-gradient(90deg, #166534 0%, #22c55e 100%)"
                  : "transparent",
            }}
          />
          {/* Red zone: above S9 */}
          <div
            className="h-full transition-all duration-150 ease-out"
            style={{
              width: `${redWidth}%`,
              background:
                redWidth > 0
                  ? "linear-gradient(90deg, #eab308 0%, #ef4444 100%)"
                  : "transparent",
            }}
          />
        </div>

        {/* ── Tick marks ──────────────────────────────────────────── */}
        {ALL_TICKS.map((tick) => {
          const pct = dbmToPercent(tick.dbm);
          return (
            <div
              key={tick.label}
              className="absolute top-0 flex flex-col items-center pointer-events-none"
              style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
            >
              {/* Tick line */}
              <div className="w-px h-2 bg-gray-500/70" />
              {/* Label */}
              <span className="font-mono text-[9px] text-gray-500 leading-none mt-px whitespace-nowrap">
                {tick.label}
              </span>
            </div>
          );
        })}

        {/* ── Readout ─────────────────────────────────────────────── */}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 font-mono text-[11px] font-bold text-white drop-shadow-md">
          {readout}
        </div>
      </div>
    </div>
  );
}

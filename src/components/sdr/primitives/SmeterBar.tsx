/**
 * SmeterBar — Animated S-meter bar with green/red zones and tick marks.
 *
 * Pure presentational component. Supports compact/normal/large sizes,
 * optional S-unit labels above the bar, and toggleable dBm readout.
 */

import { useCallback, useState } from "react";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SmeterBarProps {
  /** S-meter reading in dBm (e.g. -73 = S9). Undefined = no reading. */
  dbm: number | undefined;
  /** Bar size preset. Default "normal". */
  size?: "compact" | "normal" | "large";
  /** Show S-unit labels (1, 3, 5, 7, 9, +20, +40) above the bar. */
  showLabels?: boolean;
  /** Show dBm value next to S-unit readout. Default true. */
  showDbm?: boolean;
  /** When provided, clicking the readout text toggles dBm display. */
  onToggleDbm?: () => void;
  /** Additional CSS classes on the wrapper. */
  className?: string;
}

// ─── S-meter constants ───────────────────────────────────────────────────────

const S9_DBM = -73;
const S1_DBM = -121;
const DB_PER_S_UNIT = 6;
const DBM_MAX = -23; // S9+50
const DBM_RANGE = DBM_MAX - S1_DBM;

/** Map a dBm value to a percentage (0-100) of the full bar. */
function dbmToPercent(dbm: number): number {
  const clamped = Math.max(S1_DBM, Math.min(DBM_MAX, dbm));
  return ((clamped - S1_DBM) / DBM_RANGE) * 100;
}

/** The percentage where S9 falls on the bar. */
const S9_PERCENT = dbmToPercent(S9_DBM);

/** Format dBm into S-unit readout (e.g. "S7", "S9+10"). */
function formatSmeter(dbm: number): string {
  if (dbm >= S9_DBM) {
    const over = Math.round(dbm - S9_DBM);
    return over === 0 ? "S9" : `S9+${over}`;
  }
  const sUnit = Math.max(1, Math.round((dbm - S1_DBM) / DB_PER_S_UNIT) + 1);
  return `S${sUnit}`;
}

/** Tick mark positions for the S-meter bar. */
const SMETER_TICKS = [
  { label: "1", dbm: S1_DBM },
  { label: "3", dbm: S1_DBM + 2 * DB_PER_S_UNIT },
  { label: "5", dbm: S1_DBM + 4 * DB_PER_S_UNIT },
  { label: "7", dbm: S1_DBM + 6 * DB_PER_S_UNIT },
  { label: "9", dbm: S9_DBM },
  { label: "+20", dbm: S9_DBM + 20 },
  { label: "+40", dbm: S9_DBM + 40 },
] as const;

// ─── Size mapping ────────────────────────────────────────────────────────────

const SIZE_CONFIG = {
  compact: {
    barHeight: "h-[4px]",
    readoutText: "text-[8px]",
    readoutW: "w-[44px]",
  },
  normal: {
    barHeight: "h-[7px]",
    readoutText: "text-[9px]",
    readoutW: "w-[52px]",
  },
  large: {
    barHeight: "h-[12px]",
    readoutText: "text-[11px]",
    readoutW: "w-[60px]",
  },
} as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function SmeterBar({
  dbm,
  size = "normal",
  showLabels = false,
  showDbm: showDbmProp,
  onToggleDbm,
  className = "",
}: SmeterBarProps) {
  // Internal dBm toggle when no external control provided
  const [internalShowDbm, setInternalShowDbm] = useState(true);
  const showDbm = showDbmProp ?? internalShowDbm;

  const handleToggleDbm = useCallback(() => {
    if (onToggleDbm) {
      onToggleDbm();
    } else {
      setInternalShowDbm((prev) => !prev);
    }
  }, [onToggleDbm]);

  const hasReading = dbm != null;
  const fillPercent = hasReading ? dbmToPercent(dbm) : 0;
  const smeterText = hasReading ? formatSmeter(dbm) : null;
  const cfg = SIZE_CONFIG[size];

  return (
    <div className={`flex flex-col ${className}`}>
      {/* S-unit labels above the bar */}
      {showLabels && (
        <div className="relative h-3 mb-0.5">
          {SMETER_TICKS.map((tick) => {
            const pct = dbmToPercent(tick.dbm);
            return (
              <span
                key={tick.label}
                className="absolute text-[7px] text-gray-500 font-mono -translate-x-1/2"
                style={{ left: `${pct}%` }}
              >
                {tick.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Bar + readout row */}
      <div className="flex items-center gap-2">
        {/* Bar track */}
        <div
          className={`relative flex-1 ${cfg.barHeight} rounded-sm bg-black/40 overflow-hidden border border-white/5`}
        >
          {hasReading ? (
            <>
              {/* Green zone fill: S1 to S9 */}
              <div
                className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-200 ease-out"
                style={{
                  width: `${Math.min(fillPercent, S9_PERCENT)}%`,
                  background:
                    "linear-gradient(90deg, rgba(34,197,94,0.6), rgba(34,197,94,0.9))",
                }}
              />
              {/* Red zone fill: S9+ only */}
              {fillPercent > S9_PERCENT && (
                <div
                  className="absolute inset-y-0 rounded-sm transition-[width] duration-200 ease-out"
                  style={{
                    left: `${S9_PERCENT}%`,
                    width: `${fillPercent - S9_PERCENT}%`,
                    background:
                      "linear-gradient(90deg, rgba(255,68,85,0.7), rgba(255,68,85,1.0))",
                  }}
                />
              )}
            </>
          ) : null}

          {/* Tick marks */}
          {SMETER_TICKS.map((tick) => {
            const pct = dbmToPercent(tick.dbm);
            return (
              <div
                key={tick.label}
                className="absolute top-0 w-px bg-white/20"
                style={{
                  left: `${pct}%`,
                  height: tick.label === "9" ? "100%" : "60%",
                }}
              />
            );
          })}
        </div>

        {/* Readout text */}
        <span
          className={`${cfg.readoutText} font-mono font-bold text-gray-400 ${cfg.readoutW} text-right whitespace-nowrap tabular-nums ${
            onToggleDbm || showDbmProp === undefined
              ? "cursor-pointer hover:text-gray-300 transition-colors"
              : ""
          }`}
          onClick={handleToggleDbm}
          title={
            onToggleDbm || showDbmProp === undefined
              ? "Toggle dBm display"
              : undefined
          }
        >
          {hasReading ? (
            <>
              <span className="text-white">{smeterText}</span>
              {showDbm && <span className="text-gray-500 ml-1">{dbm}</span>}
            </>
          ) : (
            <span className="text-gray-600">---</span>
          )}
        </span>
      </div>
    </div>
  );
}

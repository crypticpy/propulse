/**
 * OnAirToggle — Owner-only control for setting On Air status.
 *
 * Provides a three-state segmented control (On Air / Listening / Offline)
 * and an expandable detail section for band, mode, frequency, notes,
 * and auto-expire duration when in an active state.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { OnAirStatus, OnAirState } from "@/types/social";

interface OnAirToggleProps {
  status: OnAirStatus;
  onChange: (status: OnAirStatus) => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BANDS = [
  "160m",
  "80m",
  "60m",
  "40m",
  "30m",
  "20m",
  "17m",
  "15m",
  "12m",
  "10m",
  "6m",
  "2m",
  "70cm",
] as const;

const MODES = [
  "CW",
  "SSB",
  "FT8",
  "FT4",
  "RTTY",
  "JS8Call",
  "FM",
  "DMR",
  "D-STAR",
  "AM",
] as const;

interface ExpireOption {
  label: string;
  minutes: number | null; // null = no expiry
}

const EXPIRE_OPTIONS: ExpireOption[] = [
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "4 hours", minutes: 240 },
  { label: "Until I turn off", minutes: null },
];

const SEGMENT_CONFIG: Record<
  OnAirState,
  { label: string; activeBg: string; activeText: string }
> = {
  on_air: {
    label: "On Air",
    activeBg: "bg-emerald-600",
    activeText: "text-white",
  },
  listening: {
    label: "Listening",
    activeBg: "bg-blue-600",
    activeText: "text-white",
  },
  offline: {
    label: "Offline",
    activeBg: "bg-gray-600",
    activeText: "text-white",
  },
};

const STATES: OnAirState[] = ["on_air", "listening", "offline"];

const inputClasses =
  "bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white w-full focus:outline-none focus:border-white/20 transition-colors";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Compute expiresAt ISO string, or undefined for "Until I turn off". */
function computeExpiry(minutes: number | null): string | undefined {
  if (minutes === null) return undefined;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** Derive selected expire-option index from an expiresAt timestamp. */
function deriveExpireIndex(expiresAt: string | undefined): number {
  if (!expiresAt) return EXPIRE_OPTIONS.length - 1; // "Until I turn off"
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  const remainingMin = Math.round(remainingMs / 60_000);
  // Find closest option
  let best = EXPIRE_OPTIONS.length - 1;
  let bestDelta = Infinity;
  for (let i = 0; i < EXPIRE_OPTIONS.length; i++) {
    const opt = EXPIRE_OPTIONS[i];
    if (opt.minutes === null) continue;
    const delta = Math.abs(opt.minutes - remainingMin);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  return best;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OnAirToggle({ status, onChange }: OnAirToggleProps) {
  const isActive = status.status !== "offline";

  // Local detail fields (synced from props on mount / state change)
  const [band, setBand] = useState(status.band ?? "");
  const [mode, setMode] = useState(status.mode ?? "");
  const [frequency, setFrequency] = useState(status.frequency ?? "");
  const [notes, setNotes] = useState(status.notes ?? "");
  const [expireIndex, setExpireIndex] = useState(() =>
    deriveExpireIndex(status.expiresAt),
  );

  // For expand/collapse animation
  const detailRef = useRef<HTMLDivElement>(null);
  const [detailHeight, setDetailHeight] = useState<number>(0);

  // Measure content height for smooth expand
  useEffect(() => {
    if (detailRef.current) {
      setDetailHeight(isActive ? detailRef.current.scrollHeight : 0);
    }
  }, [isActive, band, mode, frequency, notes, expireIndex]);

  // Emit onChange with latest fields
  const emitChange = useCallback(
    (overrides: Partial<OnAirStatus & { _expIdx?: number }> = {}) => {
      const newState = overrides.status ?? status.status;
      if (newState === "offline") {
        onChange({ status: "offline" });
        return;
      }

      const idx =
        overrides._expIdx !== undefined ? overrides._expIdx : expireIndex;

      onChange({
        status: newState,
        band: overrides.band !== undefined ? overrides.band : band,
        mode: overrides.mode !== undefined ? overrides.mode : mode,
        frequency:
          overrides.frequency !== undefined ? overrides.frequency : frequency,
        notes: overrides.notes !== undefined ? overrides.notes : notes,
        expiresAt: computeExpiry(EXPIRE_OPTIONS[idx].minutes),
      });
    },
    [status.status, band, mode, frequency, notes, expireIndex, onChange],
  );

  // Segment click handler
  const handleSegment = (state: OnAirState) => {
    if (state === "offline") {
      onChange({ status: "offline" });
    } else {
      emitChange({ status: state });
    }
  };

  // Field change handlers
  const handleBand = (v: string) => {
    setBand(v);
    emitChange({ band: v });
  };
  const handleMode = (v: string) => {
    setMode(v);
    emitChange({ mode: v });
  };
  const handleFrequency = (v: string) => {
    setFrequency(v);
    emitChange({ frequency: v });
  };
  const handleNotes = (v: string) => {
    setNotes(v);
    emitChange({ notes: v });
  };
  const handleExpire = (idx: number) => {
    setExpireIndex(idx);
    emitChange({ _expIdx: idx });
  };

  return (
    <div className="bg-panel/30 border border-white/5 rounded-xl p-4">
      {/* Header */}
      <h3 className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">
        On Air Status
      </h3>

      {/* ── Segmented Control ──────────────────────────────────────── */}
      <div className="flex rounded-lg border border-white/10 overflow-hidden">
        {STATES.map((s) => {
          const cfg = SEGMENT_CONFIG[s];
          const active = status.status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => handleSegment(s)}
              className={[
                "flex-1 py-1.5 text-xs font-medium transition-colors",
                active
                  ? `${cfg.activeBg} ${cfg.activeText}`
                  : "bg-white/5 text-gray-400 hover:bg-white/10",
              ].join(" ")}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* ── Expandable Detail Section ──────────────────────────────── */}
      <div
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: isActive ? `${detailHeight}px` : "0px" }}
      >
        <div ref={detailRef} className="pt-4 space-y-3">
          {/* Band + Mode row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                Band
              </label>
              <select
                value={band}
                onChange={(e) => handleBand(e.target.value)}
                className={inputClasses}
              >
                <option value="">—</option>
                {BANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                Mode
              </label>
              <select
                value={mode}
                onChange={(e) => handleMode(e.target.value)}
                className={inputClasses}
              >
                <option value="">—</option>
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              Frequency
            </label>
            <input
              type="text"
              value={frequency}
              onChange={(e) => handleFrequency(e.target.value)}
              placeholder="e.g., 14.074"
              className={inputClasses}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => handleNotes(e.target.value)}
              placeholder="What are you up to?"
              maxLength={100}
              className={inputClasses}
            />
          </div>

          {/* Auto-expire */}
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              Auto-expire
            </label>
            <select
              value={expireIndex}
              onChange={(e) => handleExpire(Number(e.target.value))}
              className={inputClasses}
            >
              {EXPIRE_OPTIONS.map((opt, i) => (
                <option key={opt.label} value={i}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

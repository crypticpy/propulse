/**
 * Ft8DecoderPanel — Compact sidebar panel for the native FT8/FT4 decoder.
 *
 * Shows ON/OFF toggle, FT8/FT4 mode pills, cycle progress bar, decode stats,
 * and error display. Sized for the Flexible skin right sidebar (280px).
 */

import { Ft8CycleIndicator } from "./Ft8CycleIndicator";
import type { Ft8DecoderStats } from "@/stores/ft8DecoderStore";

// ─── Props ───────────────────────────────────────────────────────────────────

interface Ft8DecoderPanelProps {
  enabled: boolean;
  mode: "FT8" | "FT4";
  cycleProgress: number; // 0-1
  stats: Ft8DecoderStats;
  error: string | null;
  onToggle: () => void;
  onModeChange: (mode: "FT8" | "FT4") => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Ft8DecoderPanel({
  enabled,
  mode,
  cycleProgress,
  stats,
  error,
  onToggle,
  onModeChange,
}: Ft8DecoderPanelProps) {
  return (
    <div className="rounded border border-white/10 bg-void-black/60">
      {/* Header row: title + ON/OFF toggle */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
          Decoder
        </span>
        <button
          onClick={onToggle}
          className={`rounded px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
            enabled
              ? "bg-signal-green/20 text-signal-green ring-1 ring-signal-green/40"
              : "bg-white/5 text-white/40 ring-1 ring-white/10 hover:bg-white/10"
          }`}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>

      {/* Cycle progress bar */}
      <Ft8CycleIndicator
        progress={cycleProgress}
        active={enabled}
        mode={mode}
      />

      {/* Mode pills + stats — only visible when enabled */}
      {enabled && (
        <div className="space-y-2 px-3 py-2">
          {/* Mode toggle pills */}
          <div className="flex gap-1">
            {(["FT8", "FT4"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={`flex-1 rounded py-1 text-[11px] font-semibold tracking-wide transition-colors ${
                  mode === m
                    ? "bg-cosmic-cyan/20 text-cosmic-cyan ring-1 ring-cosmic-cyan/40"
                    : "bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <StatCell label="Total" value={stats.totalDecodes} />
            <StatCell label="Last" value={stats.lastCycleDecodes} />
            <StatCell label="Cycles" value={stats.cyclesCompleted} />
          </div>

          {/* Error display */}
          {error && (
            <div className="rounded bg-alert-red/10 px-2 py-1.5 text-[10px] leading-tight text-alert-red/90">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-white/[0.03] px-1.5 py-1">
      <div className="text-[13px] font-mono font-semibold tabular-nums text-white/80">
        {value.toLocaleString()}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-white/30">
        {label}
      </div>
    </div>
  );
}

/**
 * Ft8DecoderPanel — Sidebar panel for the native FT8/FT4 decoder.
 *
 * Shows ON/OFF toggle, FT8/FT4 mode pills, band preset bar, cycle progress,
 * decode stats, session stats dashboard, time sync warning, and a scrollable
 * enriched decode list.
 */

import { useEffect, useRef, useState } from "react";
import { Ft8CycleIndicator } from "./Ft8CycleIndicator";
import { Ft8BandPresetBar } from "./Ft8BandPresetBar";
import { Ft8DecodeList } from "./Ft8DecodeList";
import { Ft8StatsDashboard } from "./Ft8StatsDashboard";
import type { Ft8DecoderStats } from "@/stores/ft8DecoderStore";
import type { Ft8EnrichedDecode } from "@/lib/ft8/ft8EnrichedDecode";
import type { Ft8BandPreset } from "@/lib/ft8/ft8BandPresets";
import type { TimeSyncResult } from "@/lib/ft8/timeSyncCheck";
import { useSettingsStore } from "@/stores/settingsStore";
import { useFt8SessionStore } from "@/stores/ft8SessionStore";

// ─── Props ───────────────────────────────────────────────────────────────────

interface Ft8DecoderPanelProps {
  enabled: boolean;
  mode: "FT8" | "FT4";
  cycleProgress: number;
  stats: Ft8DecoderStats;
  error: string | null;
  enrichedDecodes: Ft8EnrichedDecode[];
  currentBand: string | null;
  timeSyncResult: TimeSyncResult | null;
  myCallsign: string | null;
  onToggle: () => void;
  onModeChange: (mode: "FT8" | "FT4") => void;
  onBandPresetSelect: (preset: Ft8BandPreset) => void;
  onCallsignClick?: (callsign: string) => void;
  onCallsignDoubleClick?: (callsign: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Ft8DecoderPanel({
  enabled,
  mode,
  cycleProgress,
  stats,
  error,
  enrichedDecodes,
  currentBand,
  timeSyncResult,
  myCallsign,
  onToggle,
  onModeChange,
  onBandPresetSelect,
  onCallsignClick,
  onCallsignDoubleClick,
}: Ft8DecoderPanelProps) {
  const showFlags = useSettingsStore((s) => s.sdrFt8ShowFlags);
  const showDistance = useSettingsStore((s) => s.sdrFt8ShowDistance);
  const highlightNeeded = useSettingsStore((s) => s.sdrFt8HighlightNeeded);
  const highlightCQ = useSettingsStore((s) => s.sdrFt8HighlightCQ);

  const sessionStats = useFt8SessionStore((s) => s.sessionStats);

  // Per-cycle decode counts for the sparkline (last 20 cycles), kept in state
  // so the chart reflects the current cycle rather than trailing one render.
  // Cycle boundaries are detected from cycleProgress resets, so empty cycles
  // register as 0; cyclesCompleted only increments on cycles that had decodes.
  const [cycleCounts, setCycleCounts] = useState<number[]>([]);
  const prevProgressRef = useRef(cycleProgress);
  const prevCyclesRef = useRef(stats.cyclesCompleted);

  useEffect(() => {
    const prevProgress = prevProgressRef.current;
    prevProgressRef.current = cycleProgress;

    if (!enabled) {
      // Keep the cycle baseline synced while idle so re-enabling the decoder
      // doesn't record a phantom cycle from stale counts.
      prevCyclesRef.current = stats.cyclesCompleted;
      return;
    }

    // A cycle boundary is where progress resets from the end back to the start.
    const rolledOver = prevProgress >= 0.5 && cycleProgress < 0.5;
    if (!rolledOver) return;

    const hadDecodes = stats.cyclesCompleted > prevCyclesRef.current;
    prevCyclesRef.current = stats.cyclesCompleted;
    setCycleCounts((prev) =>
      [...prev, hadDecodes ? stats.lastCycleDecodes : 0].slice(-20),
    );
  }, [enabled, cycleProgress, stats.cyclesCompleted, stats.lastCycleDecodes]);

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

      {/* Content — only visible when enabled */}
      {enabled && (
        <div className="space-y-1.5">
          {/* Mode toggle pills */}
          <div className="flex gap-1 px-3 pt-2">
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

          {/* Band preset bar */}
          <Ft8BandPresetBar
            mode={mode}
            currentBand={currentBand}
            onSelectPreset={onBandPresetSelect}
          />

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-1.5 px-3 text-center">
            <StatCell label="Total" value={stats.totalDecodes} />
            <StatCell label="Last" value={stats.lastCycleDecodes} />
            <StatCell label="Cycles" value={stats.cyclesCompleted} />
          </div>

          {/* Session stats dashboard */}
          <Ft8StatsDashboard stats={sessionStats} cycleCounts={cycleCounts} />

          {/* Time sync warning */}
          {timeSyncResult && !timeSyncResult.isAcceptable && (
            <div className="mx-3 rounded bg-caution-amber/10 px-2 py-1.5 text-[10px] leading-tight text-caution-amber/90">
              Clock drift: {timeSyncResult.offsetMs > 0 ? "+" : ""}
              {timeSyncResult.offsetMs}ms — FT8 requires &lt;500ms accuracy
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="mx-3 rounded bg-alert-red/10 px-2 py-1.5 text-[10px] leading-tight text-alert-red/90">
              {error}
            </div>
          )}

          {/* Decode list */}
          <Ft8DecodeList
            decodes={enrichedDecodes}
            showFlags={showFlags}
            showDistance={showDistance}
            highlightNeeded={highlightNeeded}
            highlightCQ={highlightCQ}
            myCallsign={myCallsign}
            onCallsignClick={onCallsignClick}
            onCallsignDoubleClick={onCallsignDoubleClick}
          />
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

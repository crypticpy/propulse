/**
 * MemoryPanel — Standalone memory channels UI for the SDR sidebar.
 *
 * Reads/writes memoryStore directly (Zustand subscription).
 * Only needs onRecallFrequency and effectiveState from parent.
 */

import { useState, useMemo, useCallback, type KeyboardEvent } from "react";
import type { RadioState } from "@/lib/radio/protocol";
import {
  useMemoryStore,
  MEMORY_BANKS,
  MAX_MEMORIES,
  type MemoryBank,
} from "@/stores/memoryStore";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface MemoryPanelProps {
  effectiveState: RadioState | null;
  onRecallFrequency: (freqHz: number) => void;
  canControl: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFreqMHz(hz: number): string {
  return `${(hz / 1_000_000).toFixed(6)}`;
}

const BANK_COLORS: Record<string, string> = {
  A: "bg-cosmic-cyan/20 text-cosmic-cyan border-cosmic-cyan/30",
  B: "bg-signal-green/20 text-signal-green border-signal-green/30",
  C: "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30",
  D: "bg-nebula-blue/20 text-nebula-blue border-nebula-blue/30",
  E: "bg-caution-amber/20 text-caution-amber border-caution-amber/30",
  F: "bg-alert-red/20 text-alert-red border-alert-red/30",
};

const DOT_COLORS: Record<string, string> = {
  A: "bg-cosmic-cyan",
  B: "bg-signal-green",
  C: "bg-plasma-orange",
  D: "bg-nebula-blue",
  E: "bg-caution-amber",
  F: "bg-alert-red",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function MemoryPanel({
  effectiveState,
  onRecallFrequency,
  canControl,
}: MemoryPanelProps) {
  const memories = useMemoryStore((s) => s.sdrMemories);
  const addMemory = useMemoryStore((s) => s.addMemory);
  const removeMemory = useMemoryStore((s) => s.removeMemory);
  const clearBank = useMemoryStore((s) => s.clearBank);

  const [activeBank, setActiveBank] = useState<MemoryBank | "ALL">("ALL");
  const [isStoring, setIsStoring] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeBank, setStoreBank] = useState<MemoryBank>("A");

  // Filter memories by active bank
  const filtered = useMemo(
    () =>
      activeBank === "ALL"
        ? memories
        : memories.filter((m) => m.bank === activeBank),
    [memories, activeBank],
  );

  // Bank counts for badges
  const bankCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: memories.length };
    for (const b of MEMORY_BANKS) counts[b] = 0;
    for (const m of memories) counts[m.bank] = (counts[m.bank] ?? 0) + 1;
    return counts;
  }, [memories]);

  // Current frequency for "active" highlighting
  const currentFreq = effectiveState?.freq ?? null;

  // ── Store handler ──────────────────────────────────────────────────────

  const handleStartStore = useCallback(() => {
    if (!effectiveState) return;
    const mode = effectiveState.mode ?? "USB";
    const freqStr = formatFreqMHz(effectiveState.freq);
    setStoreName(`${mode} ${freqStr}`);
    setIsStoring(true);
  }, [effectiveState]);

  const handleConfirmStore = useCallback(() => {
    if (!effectiveState || !storeName.trim()) return;
    addMemory({
      name: storeName.trim(),
      freq: effectiveState.freq,
      mode: effectiveState.mode ?? "USB",
      filter: effectiveState.filter
        ? { low: effectiveState.filter.low, high: effectiveState.filter.high }
        : undefined,
      antenna: effectiveState.antenna,
      bank: storeBank,
    });
    setIsStoring(false);
    setStoreName("");
  }, [effectiveState, storeName, storeBank, addMemory]);

  const handleCancelStore = useCallback(() => {
    setIsStoring(false);
    setStoreName("");
  }, []);

  const handleStoreKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirmStore();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelStore();
      }
    },
    [handleConfirmStore, handleCancelStore],
  );

  // ── Recall handler ─────────────────────────────────────────────────────

  const handleRecall = useCallback(
    (freqHz: number) => {
      if (!canControl) return;
      onRecallFrequency(freqHz);
    },
    [canControl, onRecallFrequency],
  );

  const isFull = memories.length >= MAX_MEMORIES;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Store button / inline form */}
      {isStoring ? (
        <div className="space-y-1.5">
          <input
            type="text"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            onKeyDown={handleStoreKeyDown}
            placeholder="Memory name"
            autoFocus
            className="w-full px-2 py-1 text-[11px] font-mono text-white
              bg-black/40 border border-white/10 rounded
              focus:border-cosmic-cyan/50 focus:outline-none
              placeholder:text-gray-600"
          />
          {/* Bank selector */}
          <div className="flex gap-0.5">
            {MEMORY_BANKS.map((b) => (
              <button
                key={b}
                onClick={() => setStoreBank(b)}
                className={`flex-1 px-1 py-0.5 text-[9px] font-bold rounded border transition-colors ${
                  storeBank === b
                    ? BANK_COLORS[b]
                    : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          {/* Confirm / Cancel */}
          <div className="flex gap-1">
            <button
              onClick={handleConfirmStore}
              disabled={!storeName.trim()}
              className="flex-1 px-2 py-1 text-[10px] font-semibold rounded border transition-colors
                bg-signal-green/10 border-signal-green/30 text-signal-green
                hover:bg-signal-green/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              onClick={handleCancelStore}
              className="flex-1 px-2 py-1 text-[10px] font-semibold rounded border transition-colors
                bg-white/5 border-white/10 text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleStartStore}
          disabled={!effectiveState || isFull}
          className="w-full px-2 py-1.5 text-[10px] font-semibold rounded border transition-colors
            bg-cosmic-cyan/10 border-cosmic-cyan/30 text-cosmic-cyan
            hover:bg-cosmic-cyan/20
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isFull ? `Full (${MAX_MEMORIES})` : "Store Current"}
        </button>
      )}

      {/* Bank filter tabs */}
      <div className="flex gap-0.5">
        <button
          onClick={() => setActiveBank("ALL")}
          className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
            activeBank === "ALL"
              ? "bg-white/10 border-white/20 text-white"
              : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
          }`}
        >
          ALL
          {bankCounts.ALL > 0 && (
            <span className="ml-0.5 text-[8px] opacity-60">
              {bankCounts.ALL}
            </span>
          )}
        </button>
        {MEMORY_BANKS.map((b) => (
          <button
            key={b}
            onClick={() => setActiveBank(b)}
            className={`flex-1 px-1 py-0.5 text-[9px] font-bold rounded border transition-colors ${
              activeBank === b
                ? BANK_COLORS[b]
                : "bg-white/5 border-white/10 text-gray-500 hover:text-gray-300"
            }`}
          >
            {b}
            {(bankCounts[b] ?? 0) > 0 && (
              <span className="ml-0.5 text-[8px] opacity-60">
                {bankCounts[b]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Clear bank action */}
      {activeBank !== "ALL" && (bankCounts[activeBank] ?? 0) > 0 && (
        <button
          onClick={() => clearBank(activeBank)}
          className="w-full text-[9px] text-alert-red/60 hover:text-alert-red transition-colors text-right"
        >
          Clear bank {activeBank}
        </button>
      )}

      {/* Memory list */}
      {filtered.length === 0 ? (
        <div className="text-[9px] text-gray-600 leading-tight py-2 text-center">
          {memories.length === 0
            ? "No memories saved. Store your first frequency."
            : `No memories in bank ${activeBank}.`}
        </div>
      ) : (
        <div className="space-y-0.5 max-h-[240px] overflow-y-auto">
          {filtered.map((mem) => {
            const isActive =
              currentFreq != null && Math.abs(currentFreq - mem.freq) < 100;
            return (
              <div
                key={mem.id}
                onClick={() => handleRecall(mem.freq)}
                className={`flex items-center gap-1.5 px-1.5 py-1 rounded border cursor-pointer transition-all group ${
                  isActive
                    ? "bg-cosmic-cyan/10 border-cosmic-cyan/25"
                    : "bg-white/[0.02] border-white/5 hover:bg-white/5 hover:border-white/10"
                }`}
                title={`${mem.name}\n${formatFreqMHz(mem.freq)} MHz ${mem.mode}\nClick to recall`}
              >
                {/* Bank dot */}
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_COLORS[mem.bank] ?? "bg-gray-500"}`}
                />

                {/* Name (truncated) */}
                <span className="text-[10px] text-gray-300 truncate flex-1 min-w-0">
                  {mem.name}
                </span>

                {/* Frequency */}
                <span className="text-[9px] font-mono text-gray-400 shrink-0">
                  {formatFreqMHz(mem.freq)}
                </span>

                {/* Mode badge */}
                <span className="text-[8px] font-bold text-gray-500 bg-white/5 px-1 py-0.5 rounded shrink-0">
                  {mem.mode}
                </span>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeMemory(mem.id);
                  }}
                  className="text-[9px] text-gray-600 hover:text-alert-red transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                  title="Delete memory"
                >
                  &times;
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer: count */}
      {memories.length > 0 && (
        <div className="text-[8px] text-gray-600 text-right">
          {memories.length}/{MAX_MEMORIES} memories
        </div>
      )}
    </div>
  );
}

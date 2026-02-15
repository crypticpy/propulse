/**
 * WasMap — Grid view of US states with status coloring for WAS tracking
 *
 * Displays all 50 states in a responsive grid with:
 * - confirmed = signal-green
 * - worked_unconfirmed = caution-yellow
 * - needed = gray
 *
 * Uses a grid layout with state abbreviations (no SVG map paths).
 */

import { useState, useMemo } from "react";
import type { WasState, SlotStatus } from "@/lib/awards/types";

// ─── Props ─────────────────────────────────────────────────────────────────

interface WasMapProps {
  slots: WasState[];
  totalStates: number;
  workedCount: number;
  confirmedCount: number;
  neededCount: number;
}

// ─── Status Styling ────────────────────────────────────────────────────────

function statusBg(status: SlotStatus): string {
  switch (status) {
    case "confirmed":
      return "bg-signal-green/20 border-signal-green/50";
    case "worked_unconfirmed":
      return "bg-caution-yellow/20 border-caution-yellow/50";
    case "needed":
      return "bg-gray-800/40 border-gray-700/40";
  }
}

function statusText(status: SlotStatus): string {
  switch (status) {
    case "confirmed":
      return "text-signal-green";
    case "worked_unconfirmed":
      return "text-caution-yellow";
    case "needed":
      return "text-gray-500";
  }
}

function statusLabel(status: SlotStatus): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "worked_unconfirmed":
      return "Worked";
    case "needed":
      return "Needed";
  }
}

// ─── State Detail Modal ────────────────────────────────────────────────────

interface StateDetailProps {
  slot: WasState;
  onClose: () => void;
}

function StateDetail({ slot, onClose }: StateDetailProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${slot.name}`}
    >
      <div
        className="bg-void-black border border-gray-700 rounded-xl p-5 w-full max-w-sm mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{slot.name}</h3>
            <span className="text-sm text-gray-400 font-mono">{slot.abbr}</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${statusBg(slot.status)} ${statusText(slot.status)} border`}
          >
            {statusLabel(slot.status)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">QSOs</span>
            <p className="text-white">{slot.qsoCount}</p>
          </div>
          <div>
            <span className="text-gray-500">Status</span>
            <p className={statusText(slot.status)}>
              {statusLabel(slot.status)}
            </p>
          </div>
        </div>

        {slot.bands.length > 0 && (
          <div className="mt-3">
            <span className="text-gray-500 text-sm">Bands</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {slot.bands.map((b) => (
                <span
                  key={b}
                  className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 text-xs"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        )}

        {slot.modes.length > 0 && (
          <div className="mt-3">
            <span className="text-gray-500 text-sm">Modes</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {slot.modes.map((m) => (
                <span
                  key={m}
                  className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 text-xs"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Filter Options ────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ label: string; value: SlotStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Worked", value: "worked_unconfirmed" },
  { label: "Needed", value: "needed" },
];

// ─── Component ─────────────────────────────────────────────────────────────

export function WasMap({
  slots,
  totalStates,
  workedCount,
  confirmedCount,
  neededCount,
}: WasMapProps) {
  const [statusFilter, setStatusFilter] = useState<SlotStatus | "all">("all");
  const [selectedSlot, setSelectedSlot] = useState<WasState | null>(null);

  const filteredSlots = useMemo(() => {
    if (statusFilter === "all") return slots;
    return slots.filter((s) => s.status === statusFilter);
  }, [slots, statusFilter]);

  // Progress percentage
  const progressPct =
    totalStates > 0 ? Math.round((workedCount / totalStates) * 100) : 0;
  const confirmedPct =
    totalStates > 0 ? Math.round((confirmedCount / totalStates) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-signal-green/60" />
          <span className="text-gray-300">
            Confirmed:{" "}
            <span className="text-white font-medium">{confirmedCount}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-caution-yellow/60" />
          <span className="text-gray-300">
            Worked:{" "}
            <span className="text-white font-medium">
              {workedCount - confirmedCount}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gray-700" />
          <span className="text-gray-300">
            Needed:{" "}
            <span className="text-white font-medium">{neededCount}</span>
          </span>
        </div>
        <span className="text-gray-500 ml-auto">
          {workedCount} / {totalStates} states ({progressPct}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
        <div className="h-full flex">
          <div
            className="bg-signal-green transition-all duration-500"
            style={{ width: `${confirmedPct}%` }}
          />
          <div
            className="bg-caution-yellow transition-all duration-500"
            style={{ width: `${progressPct - confirmedPct}%` }}
          />
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as SlotStatus | "all")
          }
          className="px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700 text-white text-sm focus:outline-none focus:border-plasma-orange/50"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* States Grid */}
      <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
        {filteredSlots.map((slot) => (
          <button
            key={slot.abbr}
            onClick={() => setSelectedSlot(slot)}
            className={`
              p-2 rounded-lg border text-center transition-all cursor-pointer
              hover:scale-105 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/50
              ${statusBg(slot.status)}
            `}
            title={`${slot.name} — ${statusLabel(slot.status)}`}
          >
            <div
              className={`text-sm font-mono font-bold ${statusText(slot.status)}`}
            >
              {slot.abbr}
            </div>
            <div className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">
              {slot.name.length > 8
                ? slot.name.slice(0, 7) + "\u2026"
                : slot.name}
            </div>
            {slot.qsoCount > 0 && (
              <div className="text-[9px] text-gray-600 mt-0.5">
                {slot.qsoCount} QSO{slot.qsoCount !== 1 ? "s" : ""}
              </div>
            )}
          </button>
        ))}
      </div>

      {filteredSlots.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No states match the current filter.
        </div>
      )}

      {/* Detail modal */}
      {selectedSlot && (
        <StateDetail
          slot={selectedSlot}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </div>
  );
}

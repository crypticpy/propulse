/**
 * WasMap — Grid view of US states with status coloring for WAS tracking
 *
 * Displays all 50 states in a responsive grid with:
 * - confirmed = signal-green
 * - worked_unconfirmed = caution-amber
 * - needed = gray
 *
 * Uses a grid layout with state abbreviations (no SVG map paths).
 */

import { useState, useMemo } from "react";
import type { WasState, SlotStatus } from "@/lib/awards/types";
import {
  statusBg,
  statusText,
  statusLabel,
  STATUS_OPTIONS,
  legendSwatchConfirmed,
  legendSwatchWorked,
  legendSwatchNeeded,
  progressFillConfirmed,
  progressFillWorked,
  SlotDetailPanel,
} from "@/components/awards/shared";

// ─── Props ─────────────────────────────────────────────────────────────────

interface WasMapProps {
  slots: WasState[];
  totalStates: number;
  workedCount: number;
  confirmedCount: number;
  neededCount: number;
}

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
          <span className={`w-3 h-3 rounded-sm ${legendSwatchConfirmed}`} />
          <span className="text-su-muted">
            Confirmed:{" "}
            <span className="text-su-text font-medium">{confirmedCount}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-sm ${legendSwatchWorked}`} />
          <span className="text-su-muted">
            Worked:{" "}
            <span className="text-su-text font-medium">
              {workedCount - confirmedCount}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-sm ${legendSwatchNeeded}`} />
          <span className="text-su-muted">
            Needed:{" "}
            <span className="text-su-text font-medium">{neededCount}</span>
          </span>
        </div>
        <span className="text-su-muted ml-auto">
          {workedCount} / {totalStates} states ({progressPct}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-su-panel overflow-hidden">
        <div className="h-full flex">
          <div
            className={`${progressFillConfirmed} transition-all duration-500`}
            style={{ width: `${confirmedPct}%` }}
          />
          <div
            className={`${progressFillWorked} transition-all duration-500`}
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
          className="px-3 py-1.5 rounded-lg bg-su-panel/60 border border-su-line/40 text-su-text text-sm focus:outline-none focus:border-plasma-orange/50"
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
            <div className="text-[10px] text-su-muted truncate leading-tight mt-0.5">
              {slot.name.length > 8 ? slot.name.slice(0, 7) + "…" : slot.name}
            </div>
            {slot.qsoCount > 0 && (
              <div className="text-[9px] text-su-muted mt-0.5">
                {slot.qsoCount} QSO{slot.qsoCount !== 1 ? "s" : ""}
              </div>
            )}
          </button>
        ))}
      </div>

      {filteredSlots.length === 0 && (
        <div className="text-center py-8 text-su-muted text-sm">
          No states match the current filter.
        </div>
      )}

      {/* Detail modal */}
      {selectedSlot && (
        <SlotDetailPanel
          title={selectedSlot.name}
          subtitle={selectedSlot.abbr}
          subtitleClassName="text-sm text-su-muted font-mono"
          status={selectedSlot.status}
          fields={[
            { label: "QSOs", value: selectedSlot.qsoCount },
            {
              label: "Status",
              value: statusLabel(selectedSlot.status),
              tone: "status",
            },
          ]}
          bands={selectedSlot.bands}
          modes={selectedSlot.modes}
          ariaLabel={`Details for ${selectedSlot.name}`}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </div>
  );
}

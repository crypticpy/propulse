/**
 * WazGrid — 40-zone grid with status coloring for WAZ tracking
 *
 * Displays all 40 CQ zones as cells with color-coded status:
 * - confirmed = signal-green
 * - worked_unconfirmed = caution-yellow
 * - needed = gray
 */

import { useState, useMemo } from "react";
import type { WazZone, SlotStatus } from "@/lib/awards/types";
import {
  statusBg,
  statusText,
  statusLabel,
  STATUS_OPTIONS,
  SlotDetailPanel,
} from "@/components/awards/shared";

// ─── Props ─────────────────────────────────────────────────────────────────

interface WazGridProps {
  slots: WazZone[];
  totalZones: number;
  workedCount: number;
  confirmedCount: number;
  neededCount: number;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function WazGrid({
  slots,
  totalZones,
  workedCount,
  confirmedCount,
  neededCount,
}: WazGridProps) {
  const [statusFilter, setStatusFilter] = useState<SlotStatus | "all">("all");
  const [selectedSlot, setSelectedSlot] = useState<WazZone | null>(null);

  const filteredSlots = useMemo(() => {
    if (statusFilter === "all") return slots;
    return slots.filter((s) => s.status === statusFilter);
  }, [slots, statusFilter]);

  // Progress percentage
  const progressPct =
    totalZones > 0 ? Math.round((workedCount / totalZones) * 100) : 0;
  const confirmedPct =
    totalZones > 0 ? Math.round((confirmedCount / totalZones) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-signal-green/60" />
          <span className="text-su-muted">
            Confirmed:{" "}
            <span className="text-su-text font-medium">{confirmedCount}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-caution-yellow/60" />
          <span className="text-su-muted">
            Worked:{" "}
            <span className="text-su-text font-medium">
              {workedCount - confirmedCount}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-su-input" />
          <span className="text-su-muted">
            Needed:{" "}
            <span className="text-su-text font-medium">{neededCount}</span>
          </span>
        </div>
        <span className="text-su-muted ml-auto">
          {workedCount} / {totalZones} zones ({progressPct}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-su-panel overflow-hidden">
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

      {/* 40-Zone Grid: 8 columns x 5 rows */}
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
        {filteredSlots.map((slot) => (
          <button
            key={slot.zone}
            onClick={() => setSelectedSlot(slot)}
            className={`
              p-3 rounded-lg border text-center transition-all cursor-pointer
              hover:scale-105 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/50
              ${statusBg(slot.status)}
            `}
            title={`CQ Zone ${slot.zone} — ${statusLabel(slot.status)}`}
          >
            <div
              className={`text-lg font-mono font-bold ${statusText(slot.status)}`}
            >
              {slot.zone}
            </div>
            {slot.qsoCount > 0 && (
              <div className="text-[10px] text-su-muted mt-0.5">
                {slot.qsoCount} QSO{slot.qsoCount !== 1 ? "s" : ""}
              </div>
            )}
          </button>
        ))}
      </div>

      {filteredSlots.length === 0 && (
        <div className="text-center py-8 text-su-muted text-sm">
          No zones match the current filter.
        </div>
      )}

      {/* Detail modal */}
      {selectedSlot && (
        <SlotDetailPanel
          title={`CQ Zone ${selectedSlot.zone}`}
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
          ariaLabel={`Details for CQ Zone ${selectedSlot.zone}`}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </div>
  );
}

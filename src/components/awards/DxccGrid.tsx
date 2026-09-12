/**
 * DxccGrid — Color-coded grid of DXCC entities for the Awards page
 *
 * Displays all DXCC entities as compact cells with status coloring:
 * - confirmed = signal-green
 * - worked_unconfirmed = caution-yellow
 * - needed = gray
 *
 * Filterable by band, mode, continent, and search query.
 */

import { useState, useMemo } from "react";
import type { DxccSlot, SlotStatus } from "@/lib/awards/types";
import {
  statusBg,
  statusText,
  statusLabel,
  STATUS_OPTIONS,
  SlotDetailPanel,
} from "@/components/awards/shared";

// ─── Props ─────────────────────────────────────────────────────────────────

interface DxccGridProps {
  slots: DxccSlot[];
  totalEntities: number;
  workedCount: number;
  confirmedCount: number;
  neededCount: number;
}

// ─── Filter Bar ────────────────────────────────────────────────────────────

const CONTINENTS = ["All", "NA", "SA", "EU", "AF", "AS", "OC", "AN"] as const;

const BANDS = [
  "All",
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
] as const;

// ─── Component ─────────────────────────────────────────────────────────────

export function DxccGrid({
  slots,
  totalEntities,
  workedCount,
  confirmedCount,
  neededCount,
}: DxccGridProps) {
  const [search, setSearch] = useState("");
  const [continent, setContinent] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<SlotStatus | "all">("all");
  const [bandFilter, setBandFilter] = useState<string>("All");
  const [selectedSlot, setSelectedSlot] = useState<DxccSlot | null>(null);

  // Filter slots based on current filters
  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      // Continent filter
      if (continent !== "All" && slot.continent !== continent) return false;

      // Status filter
      if (statusFilter !== "all" && slot.status !== statusFilter) return false;

      // Band filter: only show entities worked on this band (or needed entities)
      if (bandFilter !== "All") {
        if (slot.status !== "needed" && !slot.bands.includes(bandFilter)) {
          return false;
        }
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          slot.name.toLowerCase().includes(q) ||
          slot.prefix.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [slots, continent, statusFilter, bandFilter, search]);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
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
          {workedCount} / {totalEntities} entities
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search entity or prefix..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-su-panel/60 border border-su-line/40 text-su-text text-sm placeholder:text-su-muted/80 focus:outline-none focus:border-plasma-orange/50 w-48"
        />
        <select
          value={continent}
          onChange={(e) => setContinent(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-su-panel/60 border border-su-line/40 text-su-text text-sm focus:outline-none focus:border-plasma-orange/50"
          aria-label="Filter by continent"
        >
          {CONTINENTS.map((c) => (
            <option key={c} value={c}>
              {c === "All" ? "All Continents" : c}
            </option>
          ))}
        </select>
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
        <select
          value={bandFilter}
          onChange={(e) => setBandFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-su-panel/60 border border-su-line/40 text-su-text text-sm focus:outline-none focus:border-plasma-orange/50"
          aria-label="Filter by band"
        >
          {BANDS.map((b) => (
            <option key={b} value={b}>
              {b === "All" ? "All Bands" : b}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1.5">
        {filteredSlots.map((slot) => (
          <button
            key={slot.entityId}
            onClick={() => setSelectedSlot(slot)}
            className={`
              p-1.5 rounded border text-center transition-all cursor-pointer
              hover:scale-105 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/50
              ${statusBg(slot.status)}
            `}
            title={`${slot.name} (${slot.prefix}) — ${statusLabel(slot.status)}`}
          >
            <div
              className={`text-xs font-mono font-medium truncate ${statusText(slot.status)}`}
            >
              {slot.prefix}
            </div>
            <div className="text-[10px] text-su-muted truncate leading-tight">
              {slot.name.length > 12 ? slot.name.slice(0, 11) + "…" : slot.name}
            </div>
          </button>
        ))}
      </div>

      {filteredSlots.length === 0 && (
        <div className="text-center py-8 text-su-muted text-sm">
          No entities match the current filters.
        </div>
      )}

      {/* Detail modal */}
      {selectedSlot && (
        <SlotDetailPanel
          title={selectedSlot.name}
          subtitle={selectedSlot.prefix}
          status={selectedSlot.status}
          fields={[
            { label: "Continent", value: selectedSlot.continent },
            { label: "CQ Zone", value: selectedSlot.cqZone },
            { label: "QSOs", value: selectedSlot.qsoCount },
            { label: "Entity ID", value: selectedSlot.entityId },
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

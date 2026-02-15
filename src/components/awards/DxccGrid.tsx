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
const STATUS_OPTIONS: Array<{ label: string; value: SlotStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Worked", value: "worked_unconfirmed" },
  { label: "Needed", value: "needed" },
];

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

// ─── Status Color Utilities ────────────────────────────────────────────────

function statusBg(status: SlotStatus): string {
  switch (status) {
    case "confirmed":
      return "bg-signal-green/20 border-signal-green/40";
    case "worked_unconfirmed":
      return "bg-caution-yellow/20 border-caution-yellow/40";
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

// ─── Entity Detail Popover ─────────────────────────────────────────────────

interface EntityDetailProps {
  slot: DxccSlot;
  onClose: () => void;
}

function EntityDetail({ slot, onClose }: EntityDetailProps) {
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
            <span className="text-sm text-gray-400">{slot.prefix}</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${statusBg(slot.status)} ${statusText(slot.status)} border`}
          >
            {slot.status === "confirmed"
              ? "Confirmed"
              : slot.status === "worked_unconfirmed"
                ? "Worked"
                : "Needed"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Continent</span>
            <p className="text-white">{slot.continent}</p>
          </div>
          <div>
            <span className="text-gray-500">CQ Zone</span>
            <p className="text-white">{slot.cqZone}</p>
          </div>
          <div>
            <span className="text-gray-500">QSOs</span>
            <p className="text-white">{slot.qsoCount}</p>
          </div>
          <div>
            <span className="text-gray-500">Entity ID</span>
            <p className="text-white">{slot.entityId}</p>
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
          className="px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 w-48"
        />
        <select
          value={continent}
          onChange={(e) => setContinent(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700 text-white text-sm focus:outline-none focus:border-plasma-orange/50"
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
          className="px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700 text-white text-sm focus:outline-none focus:border-plasma-orange/50"
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
          className="px-3 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700 text-white text-sm focus:outline-none focus:border-plasma-orange/50"
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
            title={`${slot.name} (${slot.prefix}) — ${slot.status === "confirmed" ? "Confirmed" : slot.status === "worked_unconfirmed" ? "Worked" : "Needed"}`}
          >
            <div
              className={`text-xs font-mono font-medium truncate ${statusText(slot.status)}`}
            >
              {slot.prefix}
            </div>
            <div className="text-[10px] text-gray-500 truncate leading-tight">
              {slot.name.length > 12
                ? slot.name.slice(0, 11) + "\u2026"
                : slot.name}
            </div>
          </button>
        ))}
      </div>

      {filteredSlots.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          No entities match the current filters.
        </div>
      )}

      {/* Detail modal */}
      {selectedSlot && (
        <EntityDetail
          slot={selectedSlot}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </div>
  );
}

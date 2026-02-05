/**
 * SkedScheduler Component (C21)
 *
 * QSO scheduling interface with propagation window recommendations.
 * Create, view, and manage DX skeds.
 */

import { useState, useMemo, useCallback } from "react";
import { useSkedStore } from "@/stores/skedStore";
import type { Sked } from "@/stores/skedStore";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkedForm({ onClose }: { onClose: () => void }) {
  const addSked = useSkedStore((s) => s.addSked);
  const [callsign, setCallsign] = useState("");
  const [band, setBand] = useState("20m");
  const [mode, setMode] = useState("SSB");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!callsign.trim()) return;

      const id = addSked({
        targetCallsign: callsign.toUpperCase().trim(),
        preferredBand: band,
        preferredMode: mode,
        dateRange: [startDate, endDate],
        recommendedWindows: [],
        notes: notes || undefined,
      });

      if (id === null) {
        alert("Maximum 20 active skeds reached.");
        return;
      }
      onClose();
    },
    [callsign, band, mode, startDate, endDate, notes, addSked, onClose],
  );

  const bands = [
    "160m",
    "80m",
    "40m",
    "30m",
    "20m",
    "17m",
    "15m",
    "12m",
    "10m",
    "6m",
  ];
  const modes = ["SSB", "CW", "FT8", "FT4", "RTTY"];

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">
          Target Callsign
        </label>
        <input
          type="text"
          value={callsign}
          onChange={(e) => setCallsign(e.target.value)}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm focus:border-cosmic-cyan/50 focus:outline-none"
          placeholder="W1ABC"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Band</label>
          <div className="flex flex-wrap gap-1">
            {bands.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBand(b)}
                className={`px-2 py-1 text-[10px] rounded font-bold transition-colors ${
                  band === b
                    ? "bg-cosmic-cyan/30 text-cosmic-cyan border border-cosmic-cyan/50"
                    : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Mode</label>
          <div className="flex flex-wrap gap-1">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-2 py-1 text-[10px] rounded font-bold transition-colors ${
                  mode === m
                    ? "bg-plasma-orange/30 text-plasma-orange border border-plasma-orange/50"
                    : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:border-cosmic-cyan/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:border-cosmic-cyan/50 focus:outline-none"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:border-cosmic-cyan/50 focus:outline-none"
          placeholder="Optional notes..."
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 text-xs font-medium bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30 rounded-lg hover:bg-cosmic-cyan/30 transition-colors"
        >
          Create Sked
        </button>
      </div>
    </form>
  );
}

function SkedCard({
  sked,
  onStatusChange,
  onRemove,
}: {
  sked: Sked;
  onStatusChange: (id: string, status: Sked["status"]) => void;
  onRemove: (id: string) => void;
}) {
  const statusColors: Record<Sked["status"], string> = {
    active: "text-signal-green",
    worked: "text-cosmic-cyan",
    missed: "text-alert-red",
    cancelled: "text-gray-500",
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold text-white">
            {sked.targetCallsign}
          </span>
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-white/10 text-gray-300">
            {sked.preferredBand} {sked.preferredMode}
          </span>
          <span
            className={`text-[10px] font-bold ${statusColors[sked.status]}`}
          >
            {sked.status.toUpperCase()}
          </span>
        </div>
        <button
          onClick={() => onRemove(sked.id)}
          className="p-1 text-gray-500 hover:text-alert-red transition-colors"
          title="Delete sked"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="text-[10px] text-gray-400 mb-2">
        {sked.dateRange[0]} to {sked.dateRange[1]}
        {sked.notes && (
          <span className="ml-2 text-gray-500">— {sked.notes}</span>
        )}
      </div>
      {sked.status === "active" && (
        <div className="flex gap-1.5">
          <button
            onClick={() => onStatusChange(sked.id, "worked")}
            className="px-2 py-1 text-[10px] font-medium bg-signal-green/20 text-signal-green border border-signal-green/30 rounded hover:bg-signal-green/30 transition-colors"
          >
            Worked
          </button>
          <button
            onClick={() => onStatusChange(sked.id, "missed")}
            className="px-2 py-1 text-[10px] font-medium bg-alert-red/20 text-alert-red border border-alert-red/30 rounded hover:bg-alert-red/30 transition-colors"
          >
            Missed
          </button>
          <button
            onClick={() => onStatusChange(sked.id, "cancelled")}
            className="px-2 py-1 text-[10px] font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30 rounded hover:bg-gray-500/30 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SkedScheduler() {
  const [showForm, setShowForm] = useState(false);
  const skeds = useSkedStore((s) => s.skeds);
  const updateSkedStatus = useSkedStore((s) => s.updateSkedStatus);
  const removeSked = useSkedStore((s) => s.removeSked);

  const upcoming = useMemo(
    () =>
      skeds
        .filter(
          (s) =>
            s.status === "active" &&
            s.dateRange[1] >= new Date().toISOString().slice(0, 10),
        )
        .sort((a, b) => a.dateRange[0].localeCompare(b.dateRange[0])),
    [skeds],
  );

  const past = useMemo(
    () =>
      skeds
        .filter((s) => s.status !== "active")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 10),
    [skeds],
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-sans text-lg font-semibold text-white tracking-wide">
          DX Skeds
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-xs font-medium bg-cosmic-cyan/20 text-cosmic-cyan border border-cosmic-cyan/30 rounded-lg hover:bg-cosmic-cyan/30 transition-colors"
        >
          {showForm ? "Close" : "+ New Sked"}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 p-3 rounded-xl border border-white/10 bg-white/[0.02]">
          <SkedForm onClose={() => setShowForm(false)} />
        </div>
      )}

      {upcoming.length > 0 ? (
        <div className="space-y-2 mb-4">
          <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
            Upcoming ({upcoming.length})
          </div>
          {upcoming.map((sked) => (
            <SkedCard
              key={sked.id}
              sked={sked}
              onStatusChange={updateSkedStatus}
              onRemove={removeSked}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-500 text-sm mb-4">
          No active skeds. Create one to track propagation windows.
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
            History
          </div>
          {past.map((sked) => (
            <SkedCard
              key={sked.id}
              sked={sked}
              onStatusChange={updateSkedStatus}
              onRemove={removeSked}
            />
          ))}
        </div>
      )}
    </section>
  );
}

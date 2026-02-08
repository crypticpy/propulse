/**
 * LicenseHistory -- Vertical timeline showing license upgrade history.
 *
 * Renders colored dots on a vertical line with date, class name, and optional notes.
 * Data comes from profileStore's licenseHistory array.
 */

import { useState } from "react";
import { useProfileStore } from "@/stores/profileStore";
import type { LicenseHistoryEntry } from "@/stores/profileStore";

const MAX_ENTRIES = 10;

export function LicenseHistory() {
  const history = useProfileStore((s) => s.licenseHistory);
  const addEntry = useProfileStore((s) => s.addLicenseHistoryEntry);
  const removeEntry = useProfileStore((s) => s.removeLicenseHistoryEntry);

  const [isAdding, setIsAdding] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newClass, setNewClass] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const sorted = [...history].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  function handleAdd() {
    if (!newDate || !newClass) return;
    const entry: LicenseHistoryEntry = {
      id: crypto.randomUUID(),
      date: newDate,
      class: newClass,
      ...(newNotes.trim() ? { notes: newNotes.trim() } : {}),
    };
    addEntry(entry);
    setNewDate("");
    setNewClass("");
    setNewNotes("");
    setIsAdding(false);
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 && !isAdding && (
        <p className="text-sm text-gray-500 italic">
          No license history recorded yet.
        </p>
      )}

      {/* Timeline */}
      {sorted.length > 0 && (
        <div className="relative ml-3">
          {/* Vertical line */}
          <div className="absolute left-0 top-2 bottom-2 w-px bg-white/10" />

          <div className="space-y-4">
            {sorted.map((entry, idx) => {
              const isCurrent = idx === 0;
              return (
                <div key={entry.id} className="relative pl-6 group">
                  {/* Dot */}
                  <div
                    className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 -translate-x-1/2 ${
                      isCurrent
                        ? "bg-signal-green border-signal-green/50"
                        : "bg-gray-600 border-gray-500"
                    }`}
                  />

                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${isCurrent ? "text-white" : "text-gray-300"}`}
                        >
                          {entry.class}
                        </span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-signal-green/20 text-signal-green rounded">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatDate(entry.date)}
                      </div>
                      {entry.notes && (
                        <div className="text-xs text-gray-400 mt-1">
                          {entry.notes}
                        </div>
                      )}
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeEntry(entry.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-alert-red text-xs p-1 shrink-0"
                      title="Remove entry"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add entry form */}
      {isAdding && (
        <div className="bg-panel/30 backdrop-blur-sm border border-white/5 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Date</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full bg-void-black/50 border border-white/10 rounded-lg px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-plasma-orange/50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Class</label>
              <input
                type="text"
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                placeholder="e.g. General"
                className="w-full bg-void-black/50 border border-white/10 rounded-lg px-2 py-1 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Notes (optional)
            </label>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="e.g. Passed VE exam"
              className="w-full bg-void-black/50 border border-white/10 rounded-lg px-2 py-1 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-plasma-orange/50"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setIsAdding(false)}
              className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!newDate || !newClass}
              className="text-xs bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 rounded-lg transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Add entry button */}
      {!isAdding && history.length < MAX_ENTRIES && (
        <button
          onClick={() => setIsAdding(true)}
          className="text-xs text-gray-500 hover:text-plasma-orange transition-colors flex items-center gap-1"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Entry
        </button>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

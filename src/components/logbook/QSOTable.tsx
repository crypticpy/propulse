/**
 * QSOTable - Sortable table display for QSO log entries
 * Shows guest entries with visual distinction and badges
 */

import { useState, useMemo, useCallback } from "react";
import type { LogEntry } from "@/lib/db/types";
import { Card } from "@/components/ui";
import { GuestLogEntryBadge } from "@/components/guest/GuestLogEntryBadge";

type SortField = "date" | "callsign" | "band" | "mode" | "name";
type SortDirection = "asc" | "desc";

export interface QSOTableProps {
  /** Log entries to display */
  entries: LogEntry[];
  /** Callback when an entry should be deleted */
  onDelete?: (id: string) => Promise<void>;
  /** Whether delete operations are in progress */
  isDeleting?: boolean;
  /** Loading state */
  loading?: boolean;
}

/**
 * Format date for display (YYYY-MM-DD to more readable format)
 */
function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year.slice(2)}`;
}

/**
 * Parse band for sorting (extract numeric portion)
 */
function parseBandNumber(band: string): number {
  const match = band.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 999;
}

export function QSOTable({
  entries,
  onDelete,
  isDeleting = false,
  loading = false,
}: QSOTableProps) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Count guest entries
  const guestEntryCount = useMemo(
    () => entries.filter((e) => e.isGuestEntry).length,
    [entries],
  );

  // Sort entries
  const sortedEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "date":
          comparison = a.date.localeCompare(b.date);
          if (comparison === 0) {
            comparison = a.timeOn.localeCompare(b.timeOn);
          }
          break;
        case "callsign":
          comparison = a.callsign.localeCompare(b.callsign);
          break;
        case "band":
          comparison = parseBandNumber(a.band) - parseBandNumber(b.band);
          break;
        case "mode":
          comparison = a.mode.localeCompare(b.mode);
          break;
        case "name":
          comparison = (a.name || "").localeCompare(b.name || "");
          break;
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [entries, sortField, sortDirection]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("desc");
      }
    },
    [sortField],
  );

  const handleDeleteClick = useCallback((id: string) => {
    setDeleteConfirm(id);
  }, []);

  const handleDeleteConfirm = useCallback(
    async (id: string) => {
      if (onDelete) {
        await onDelete(id);
      }
      setDeleteConfirm(null);
    },
    [onDelete],
  );

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg
          className="w-4 h-4 opacity-30"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
          />
        </svg>
      );
    }

    return sortDirection === "asc" ? (
      <svg
        className="w-4 h-4 text-plasma-orange"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      </svg>
    ) : (
      <svg
        className="w-4 h-4 text-plasma-orange"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    );
  };

  const headerClass =
    "px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none";

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-gray-400">
            <svg
              className="w-6 h-6 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading logbook...
          </div>
        </div>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <svg
            className="w-12 h-12 mb-4 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-lg font-medium">No QSOs logged yet</p>
          <p className="text-sm mt-1">
            Start logging contacts or import from ADIF
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className={headerClass} onClick={() => handleSort("date")}>
                <div className="flex items-center gap-1">
                  Date/Time
                  <SortIcon field="date" />
                </div>
              </th>
              <th
                className={headerClass}
                onClick={() => handleSort("callsign")}
              >
                <div className="flex items-center gap-1">
                  Callsign
                  <SortIcon field="callsign" />
                </div>
              </th>
              <th className={headerClass} onClick={() => handleSort("band")}>
                <div className="flex items-center gap-1">
                  Band
                  <SortIcon field="band" />
                </div>
              </th>
              <th className={headerClass} onClick={() => handleSort("mode")}>
                <div className="flex items-center gap-1">
                  Mode
                  <SortIcon field="mode" />
                </div>
              </th>
              <th className={headerClass} onClick={() => handleSort("name")}>
                <div className="flex items-center gap-1">
                  Name
                  <SortIcon field="name" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                RST
              </th>
              {onDelete && <th className="px-4 py-3 w-16" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sortedEntries.map((entry) => (
              <tr
                key={entry.id}
                className={`
                  transition-colors hover:bg-white/5
                  ${entry.isGuestEntry ? "bg-cosmic-cyan/5" : ""}
                `}
              >
                <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                  <div className="font-mono">
                    {formatDate(entry.date)} {entry.timeOn}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-white">
                      {entry.callsign}
                    </span>
                    {entry.isGuestEntry && entry.operatorCallsign && (
                      <GuestLogEntryBadge
                        operatorCallsign={entry.operatorCallsign}
                        variant="inline"
                      />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                  <span className="px-2 py-0.5 bg-aurora-purple/20 text-aurora-purple rounded text-xs font-mono">
                    {entry.band}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                  <span className="px-2 py-0.5 bg-plasma-orange/20 text-plasma-orange rounded text-xs font-mono">
                    {entry.mode}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-300">
                  {entry.name || "-"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap font-mono">
                  {entry.rstSent && entry.rstRcvd
                    ? `${entry.rstSent}/${entry.rstRcvd}`
                    : entry.rstSent || entry.rstRcvd || "-"}
                </td>
                {onDelete && (
                  <td className="px-4 py-3">
                    {deleteConfirm === entry.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteConfirm(entry.id)}
                          disabled={isDeleting}
                          className="p-1 text-alert-red hover:bg-alert-red/20 rounded transition-colors"
                          title="Confirm delete"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={handleDeleteCancel}
                          disabled={isDeleting}
                          className="p-1 text-gray-400 hover:bg-white/10 rounded transition-colors"
                          title="Cancel"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDeleteClick(entry.id)}
                        className="p-1 text-gray-500 hover:text-alert-red hover:bg-alert-red/10 rounded transition-colors"
                        title="Delete entry"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-white/5 border-t border-white/10 flex items-center justify-between text-sm text-gray-400">
        <div>
          <span className="font-medium text-white">{entries.length}</span>{" "}
          {entries.length === 1 ? "QSO" : "QSOs"} total
        </div>
        {guestEntryCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-cosmic-cyan/20 text-cosmic-cyan rounded text-xs">
              {guestEntryCount} guest{" "}
              {guestEntryCount === 1 ? "entry" : "entries"}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

export default QSOTable;

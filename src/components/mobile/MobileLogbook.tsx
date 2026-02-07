/**
 * MobileLogbook Component
 *
 * Card-based QSO log view for mobile viewports, replacing the desktop table.
 * Shows QSO cards with callsign, band, mode, RST, and date.
 * Includes search, import/export actions, and scrollable card list.
 *
 * All data and callbacks are passed as props from the parent Logbook page.
 */

import { useState, useMemo } from "react";
import type { LogEntry } from "@/lib/db/types";

export interface MobileLogbookProps {
  entries: LogEntry[];
  loading: boolean;
  error: string | null;
  count: number;
  isGuestMode: boolean;
  guestLabel: string | null;
  onDelete: (id: string) => void;
  isDeleting: boolean;
  onExport: () => void;
  onShowImportModal: () => void;
  onShowUploadModal: () => void;
  onShowAwards: () => void;
  showAwards: boolean;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  // dateStr is ISO format YYYY-MM-DD
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}`;
  }
  return dateStr;
}

export function MobileLogbook(props: MobileLogbookProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return props.entries;
    const q = searchQuery.trim().toLowerCase();
    return props.entries.filter(
      (e) =>
        e.callsign.toLowerCase().includes(q) ||
        e.band?.toLowerCase().includes(q) ||
        e.mode?.toLowerCase().includes(q) ||
        e.grid?.toLowerCase().includes(q) ||
        e.name?.toLowerCase().includes(q) ||
        e.qth?.toLowerCase().includes(q),
    );
  }, [props.entries, searchQuery]);

  if (props.loading) {
    return (
      <div className="p-4 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-400 text-sm">Loading logbook...</div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-orbitron text-xl font-bold text-gradient-orange tracking-wider">
            Logbook
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">
              {props.count} {props.count === 1 ? "QSO" : "QSOs"}
            </span>
            {props.isGuestMode && props.guestLabel && (
              <span className="text-xs text-cosmic-cyan">(Guest)</span>
            )}
          </div>
        </div>
        <button
          onClick={props.onShowAwards}
          className={`p-2 rounded-xl border transition-colors ${
            props.showAwards
              ? "bg-signal-green/20 border-signal-green/50 text-signal-green"
              : "bg-white/[0.03] border-white/10 text-gray-400"
          }`}
          aria-label="Awards"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
        </button>
      </div>

      {/* Error banner */}
      {props.error && (
        <div className="bg-alert-red/10 border border-alert-red/30 rounded-xl p-3">
          <span className="text-sm text-alert-red">{props.error}</span>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search callsign, band, mode..."
          className="w-full pl-10 pr-3 py-2.5 bg-white/[0.03] border border-white/10 rounded-xl
                     text-white placeholder-gray-500 text-sm
                     focus:outline-none focus:border-plasma-orange/50"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={props.onShowImportModal}
          className="flex-1 py-2 bg-white/[0.03] border border-white/10 rounded-xl
                     text-gray-300 text-xs font-medium flex items-center justify-center gap-1.5"
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
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Import
        </button>
        <button
          onClick={props.onExport}
          disabled={props.count === 0}
          className="flex-1 py-2 bg-white/[0.03] border border-white/10 rounded-xl
                     text-gray-300 text-xs font-medium flex items-center justify-center gap-1.5
                     disabled:opacity-50 disabled:cursor-not-allowed"
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
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          Export
        </button>
        <button
          onClick={props.onShowUploadModal}
          disabled={props.count === 0}
          className="flex-1 py-2 bg-cosmic-cyan/10 border border-cosmic-cyan/20 rounded-xl
                     text-cosmic-cyan text-xs font-medium flex items-center justify-center gap-1.5
                     disabled:opacity-50 disabled:cursor-not-allowed"
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
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          Upload
        </button>
      </div>

      {/* QSO cards */}
      {filteredEntries.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          {searchQuery.trim() ? "No matching QSOs found" : "No QSOs logged yet"}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredEntries.map((qso) => {
            const isExpanded = expandedId === qso.id;
            return (
              <div
                key={qso.id}
                className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-1"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : qso.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-base font-bold text-white">
                      {qso.callsign}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(qso.date)}{" "}
                      {qso.timeOn && (
                        <span className="font-mono">{qso.timeOn}z</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                    <span className="font-mono text-plasma-orange">
                      {qso.band}
                    </span>
                    <span>{qso.mode}</span>
                    {(qso.rstSent || qso.rstRcvd) && (
                      <span>
                        RST: {qso.rstSent || "-"}/{qso.rstRcvd || "-"}
                      </span>
                    )}
                    {qso.grid && (
                      <span className="font-mono text-gray-500">
                        {qso.grid}
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="pt-2 mt-2 border-t border-white/10 space-y-1.5">
                    {qso.frequency > 0 && (
                      <div className="text-xs text-gray-400">
                        Freq:{" "}
                        <span className="font-mono text-white">
                          {(qso.frequency / 1000).toFixed(3)} MHz
                        </span>
                      </div>
                    )}
                    {qso.name && (
                      <div className="text-xs text-gray-400">
                        Name: <span className="text-white">{qso.name}</span>
                      </div>
                    )}
                    {qso.qth && (
                      <div className="text-xs text-gray-400">
                        QTH: <span className="text-white">{qso.qth}</span>
                      </div>
                    )}
                    {qso.notes && (
                      <div className="text-xs text-gray-400">
                        Notes:{" "}
                        <span className="text-gray-300">{qso.notes}</span>
                      </div>
                    )}
                    {qso.isGuestEntry && (
                      <div className="text-xs text-cosmic-cyan">
                        Guest op: {qso.operatorCallsign || "unknown"}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => props.onDelete(qso.id)}
                      disabled={props.isDeleting}
                      className="text-xs text-alert-red/70 hover:text-alert-red
                                 disabled:opacity-50 mt-1"
                    >
                      Delete QSO
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

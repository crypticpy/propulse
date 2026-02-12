/**
 * QSOExportMenu — Dropdown menu for exporting QSO log entries
 *
 * Offers ADIF (.adi), Cabrillo (.cbr), and CSV formats.
 * Can export full log, filtered results, or selected entries.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import { getAllLogEntries } from "@/lib/db/logStore";
import { exportADIF, exportCSV } from "@/lib/adif/export";
import { exportCabrillo } from "@/lib/adif/cabrillo";
import type { CabrilloHeader } from "@/lib/adif/types";
import type { LogEntry } from "@/lib/db/types";
import { downloadBlob } from "@/lib/utils/downloadBlob";

function getDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Menu Item ───────────────────────────────────────────────────────────────

function MenuItem({
  label,
  description,
  onClick,
  disabled,
}: {
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <div className="text-sm text-white font-medium">{label}</div>
      <div className="text-xs text-gray-500">{description}</div>
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function QSOExportMenu() {
  const entries = useQSOStore((s) => s.entries);
  const selectedIds = useQSOStore((s) => s.selectedIds);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasSelection = selectedIds.size > 0;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const getSelectedEntries = useCallback((): LogEntry[] => {
    return entries.filter((e) => selectedIds.has(e.id));
  }, [entries, selectedIds]);

  // Export handlers
  const handleExportADIF = useCallback(
    async (scope: "all" | "filtered" | "selected") => {
      setOpen(false);
      let entriesToExport: LogEntry[];

      if (scope === "all") {
        entriesToExport = await getAllLogEntries();
      } else if (scope === "selected") {
        entriesToExport = getSelectedEntries();
      } else {
        entriesToExport = entries;
      }

      const content = exportADIF(entriesToExport);
      downloadBlob(
        content,
        `propulse-${scope}-${getDateStamp()}.adi`,
        "text/plain",
      );
    },
    [entries, getSelectedEntries],
  );

  const handleExportCSV = useCallback(
    async (scope: "all" | "filtered" | "selected") => {
      setOpen(false);
      let entriesToExport: LogEntry[];

      if (scope === "all") {
        entriesToExport = await getAllLogEntries();
      } else if (scope === "selected") {
        entriesToExport = getSelectedEntries();
      } else {
        entriesToExport = entries;
      }

      const content = exportCSV(entriesToExport);
      downloadBlob(
        content,
        `propulse-${scope}-${getDateStamp()}.csv`,
        "text/csv",
      );
    },
    [entries, getSelectedEntries],
  );

  const handleExportCabrillo = useCallback(
    async (scope: "all" | "filtered" | "selected") => {
      setOpen(false);
      let entriesToExport: LogEntry[];

      if (scope === "all") {
        entriesToExport = await getAllLogEntries();
      } else if (scope === "selected") {
        entriesToExport = getSelectedEntries();
      } else {
        entriesToExport = entries;
      }

      // Basic Cabrillo header (user would normally configure this)
      const header: CabrilloHeader = {
        contest: "UNKNOWN",
        callsign: entriesToExport[0]?.stationCallsign || "N0CALL",
        categoryOperator: "SINGLE-OP",
        categoryPower: "HIGH",
        categoryMode: "MIXED",
      };

      const content = exportCabrillo(entriesToExport, header);
      downloadBlob(
        content,
        `propulse-${scope}-${getDateStamp()}.cbr`,
        "text/plain",
      );
    },
    [entries, getSelectedEntries],
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"
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
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        Export
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
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
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-deep-space border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          {/* ADIF Section */}
          <div className="border-b border-white/5">
            <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
              ADIF (.adi)
            </div>
            <MenuItem
              label="Export All"
              description="Complete logbook"
              onClick={() => handleExportADIF("all")}
            />
            <MenuItem
              label="Export Filtered"
              description={`Current view (${entries.length} entries)`}
              onClick={() => handleExportADIF("filtered")}
            />
            {hasSelection && (
              <MenuItem
                label="Export Selected"
                description={`${selectedIds.size} selected entries`}
                onClick={() => handleExportADIF("selected")}
              />
            )}
          </div>

          {/* CSV Section */}
          <div className="border-b border-white/5">
            <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
              CSV
            </div>
            <MenuItem
              label="Export CSV"
              description="Spreadsheet-compatible"
              onClick={() => handleExportCSV("filtered")}
            />
          </div>

          {/* Cabrillo Section */}
          <div>
            <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
              Cabrillo (.cbr)
            </div>
            <MenuItem
              label="Export Cabrillo"
              description="Contest submission format"
              onClick={() => handleExportCabrillo("filtered")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

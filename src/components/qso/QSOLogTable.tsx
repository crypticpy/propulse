/**
 * QSOLogTable — Desktop table view for the QSO log viewer
 *
 * Sortable columns, row selection via checkbox, click to view detail,
 * double-click to inline edit. Confirmation status shown as L/E/C/Q letters.
 */

import { useCallback } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import type { LogEntry } from "@/lib/db/types";
import { QSOInlineEditor } from "./QSOInlineEditor";
import { QslStatusIcons } from "./QslStatusIcons";
import { FilterChips } from "./FilterChips";

// ── Column Definitions ──────────────────────────────────────────────────────

interface ColumnDef {
  key: string;
  label: string;
  sortable: boolean;
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "date", label: "Date", sortable: true, className: "w-28" },
  { key: "timeOn", label: "Time", sortable: true, className: "w-16" },
  { key: "callsign", label: "Callsign", sortable: true, className: "w-28" },
  { key: "band", label: "Band", sortable: true, className: "w-16" },
  { key: "mode", label: "Mode", sortable: true, className: "w-16" },
  { key: "rstSent", label: "RST S", sortable: false, className: "w-14" },
  { key: "rstRcvd", label: "RST R", sortable: false, className: "w-14" },
  { key: "grid", label: "Grid", sortable: true, className: "w-20" },
  { key: "name", label: "Name", sortable: true, className: "w-32" },
  { key: "confirmed", label: "QSL", sortable: false, className: "w-24" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getConfirmationLetters(entry: LogEntry): string {
  const letters: string[] = [];
  if (entry.lotw || entry.lotwQslSent === "Y" || entry.lotwQslRcvd === "Y") {
    letters.push("L");
  }
  if (entry.eqsl) {
    letters.push("E");
  }
  if (entry.clublogStatus === "Y") {
    letters.push("C");
  }
  if (entry.qrzcomStatus === "Y") {
    letters.push("Q");
  }
  return letters.join("");
}

// ── Sort Header ─────────────────────────────────────────────────────────────

function SortHeader({
  column,
  currentField,
  currentDir,
  onSort,
}: {
  column: ColumnDef;
  currentField: string;
  currentDir: "asc" | "desc";
  onSort: (field: string, dir: "asc" | "desc") => void;
}) {
  const isActive = currentField === column.key;

  const handleSort = () => {
    if (!column.sortable) return;
    if (isActive) {
      onSort(column.key, currentDir === "asc" ? "desc" : "asc");
    } else {
      onSort(column.key, "desc");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSort();
    }
  };

  const ariaSortValue: "ascending" | "descending" | "none" = isActive
    ? currentDir === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th
      className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider ${
        column.sortable
          ? "cursor-pointer select-none text-gray-400 hover:text-white"
          : "text-gray-500"
      } ${column.className ?? ""}`}
      onClick={handleSort}
      onKeyDown={column.sortable ? handleKeyDown : undefined}
      tabIndex={column.sortable ? 0 : undefined}
      aria-sort={column.sortable ? ariaSortValue : undefined}
    >
      <span className="inline-flex items-center gap-1">
        {column.label}
        {column.sortable && isActive && (
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={currentDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"}
            />
          </svg>
        )}
      </span>
    </th>
  );
}

// ── Props ───────────────────────────────────────────────────────────────────

interface QSOLogTableProps {
  onRowClick: (entry: LogEntry) => void;
  editingCell: { entryId: string; field: string } | null;
  onStartEdit: (entryId: string, field: string) => void;
  onCancelEdit: () => void;
}

// ── Main Component ──────────────────────────────────────────────────────────

export function QSOLogTable({
  onRowClick,
  editingCell,
  onStartEdit,
  onCancelEdit,
}: QSOLogTableProps) {
  const entries = useQSOStore((s) => s.entries);
  const selectedIds = useQSOStore((s) => s.selectedIds);
  const sortField = useQSOStore((s) => s.sortField);
  const sortDirection = useQSOStore((s) => s.sortDirection);
  const setSort = useQSOStore((s) => s.setSort);
  const selectEntry = useQSOStore((s) => s.selectEntry);
  const deselectEntry = useQSOStore((s) => s.deselectEntry);
  const selectAll = useQSOStore((s) => s.selectAll);
  const deselectAll = useQSOStore((s) => s.deselectAll);

  const allSelected =
    entries.length > 0 && entries.every((e) => selectedIds.has(e.id));

  const handleToggleAll = useCallback(() => {
    if (allSelected) {
      deselectAll();
    } else {
      selectAll();
    }
  }, [allSelected, selectAll, deselectAll]);

  const handleToggleRow = useCallback(
    (id: string) => {
      if (selectedIds.has(id)) {
        deselectEntry(id);
      } else {
        selectEntry(id);
      }
    },
    [selectedIds, selectEntry, deselectEntry],
  );

  const getCellValue = (entry: LogEntry, key: string): string => {
    if (key === "confirmed") return getConfirmationLetters(entry);
    const val = (entry as unknown as Record<string, unknown>)[key];
    if (val == null) return "";
    return String(val);
  };

  const isEditableField = (key: string): boolean => {
    return [
      "callsign",
      "band",
      "mode",
      "rstSent",
      "rstRcvd",
      "grid",
      "name",
    ].includes(key);
  };

  return (
    <div>
      <FilterChips />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              {/* Checkbox header */}
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleToggleAll}
                  className="rounded border-white/20 bg-white/5 text-plasma-orange focus:ring-plasma-orange/50"
                  aria-label="Select all entries"
                />
              </th>
              {COLUMNS.map((col) => (
                <SortHeader
                  key={col.key}
                  column={col}
                  currentField={sortField}
                  currentDir={sortDirection}
                  onSort={setSort}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length + 1}
                  className="text-center py-12 text-gray-500"
                >
                  No QSOs found. Start logging contacts to see them here.
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const isSelected = selectedIds.has(entry.id);
              return (
                <tr
                  key={entry.id}
                  className={`border-b border-white/5 transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-plasma-orange/10 border-l-2 border-l-plasma-orange"
                      : "bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                  onClick={() => onRowClick(entry)}
                >
                  {/* Checkbox */}
                  <td
                    className="px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleRow(entry.id)}
                      className="rounded border-white/20 bg-white/5 text-plasma-orange focus:ring-plasma-orange/50"
                      aria-label={`Select ${entry.callsign}`}
                    />
                  </td>

                  {/* Data columns */}
                  {COLUMNS.map((col) => {
                    const isEditing =
                      editingCell?.entryId === entry.id &&
                      editingCell?.field === col.key;

                    if (isEditing) {
                      return (
                        <td
                          key={col.key}
                          className="px-1 py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <QSOInlineEditor
                            entryId={entry.id}
                            field={col.key}
                            currentValue={getCellValue(entry, col.key)}
                            onCancel={onCancelEdit}
                          />
                        </td>
                      );
                    }

                    const isMono = [
                      "callsign",
                      "grid",
                      "band",
                      "rstSent",
                      "rstRcvd",
                      "confirmed",
                    ].includes(col.key);

                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-2 ${isMono ? "font-mono" : ""} ${
                          col.key === "callsign"
                            ? "text-white font-semibold"
                            : "text-gray-300"
                        }`}
                        onDoubleClick={(e) => {
                          if (isEditableField(col.key)) {
                            e.stopPropagation();
                            onStartEdit(entry.id, col.key);
                          }
                        }}
                      >
                        {col.key === "confirmed" ? (
                          <QslStatusIcons entry={entry} size="sm" />
                        ) : (
                          getCellValue(entry, col.key)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

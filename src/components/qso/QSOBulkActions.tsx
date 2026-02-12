/**
 * QSOBulkActions — Multi-select action bar for the QSO log viewer
 *
 * Appears as a floating bar at the bottom when selectedIds.size > 0.
 * Provides Delete, Export ADIF, and Mark QSL Sent actions.
 */

import { useState, useCallback } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { exportADIF } from "@/lib/adif/export";
import { downloadBlob } from "@/lib/utils/downloadBlob";

// ── Main Component ──────────────────────────────────────────────────────────

export function QSOBulkActions() {
  const entries = useQSOStore((s) => s.entries);
  const selectedIds = useQSOStore((s) => s.selectedIds);
  const deselectAll = useQSOStore((s) => s.deselectAll);
  const deleteQSO = useQSOStore((s) => s.deleteQSO);
  const editQSO = useQSOStore((s) => s.editQSO);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [processing, setProcessing] = useState(false);

  const count = selectedIds.size;

  const selectedEntries = entries.filter((e) => selectedIds.has(e.id));

  const handleDelete = useCallback(async () => {
    setProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await deleteQSO(id);
      }
      deselectAll();
    } catch (err) {
      console.error("[QSOBulkActions] delete failed:", err);
    } finally {
      setProcessing(false);
      setConfirmDelete(false);
    }
  }, [selectedIds, deleteQSO, deselectAll]);

  const handleExportADIF = useCallback(() => {
    if (selectedEntries.length === 0) return;
    const adif = exportADIF(selectedEntries);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(adif, `propulse-selected-${dateStr}.adi`, "text/plain");
  }, [selectedEntries]);

  const handleMarkQSLSent = useCallback(async () => {
    setProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        await editQSO(id, { qslSent: "Y" });
      }
      deselectAll();
    } catch (err) {
      console.error("[QSOBulkActions] markQSL failed:", err);
    } finally {
      setProcessing(false);
    }
  }, [selectedIds, editQSO, deselectAll]);

  if (count === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[400] flex items-center gap-3 px-5 py-3 bg-deep-space/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4">
        {/* Count */}
        <span className="text-sm text-white font-medium whitespace-nowrap">
          {count} selected
        </span>

        <div className="w-px h-6 bg-white/10" />

        {/* Export ADIF */}
        <button
          type="button"
          onClick={handleExportADIF}
          disabled={processing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 disabled:opacity-50"
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
          Export ADIF
        </button>

        {/* Mark QSL Sent */}
        <button
          type="button"
          onClick={handleMarkQSLSent}
          disabled={processing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 disabled:opacity-50"
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
              d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
            />
          </svg>
          QSL Sent
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={processing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors bg-alert-red/20 text-alert-red hover:bg-alert-red/30 border border-alert-red/30 disabled:opacity-50"
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
          Delete
        </button>

        <div className="w-px h-6 bg-white/10" />

        {/* Deselect */}
        <button
          type="button"
          onClick={deselectAll}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        title={`Delete ${count} QSO${count > 1 ? "s" : ""}?`}
        message={`This will permanently delete ${count} selected QSO${count > 1 ? "s" : ""}. This action cannot be undone.`}
        confirmLabel="Delete All"
        variant="destructive"
      />
    </>
  );
}

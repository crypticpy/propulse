/**
 * Logbook Page
 *
 * Main logbook page for managing QSO (contact) records.
 * Features entry form, table display, filtering, and import/export.
 */

import { useState, useMemo, useCallback } from "react";
import { Card, LoadingSpinner } from "@/components/ui";
import {
  QSOEntryForm,
  QSOTable,
  QSOFiltersPanel,
  QSOEditModal,
  ADIFImportModal,
  ADIFExportModal,
  type QSOFilters,
} from "@/components/logbook";
import { useLogbook } from "@/hooks/useLogbook";
import type { LogEntry } from "@/lib/db/types";

/** Initial filter state */
const initialFilters: QSOFilters = {
  searchText: "",
  bands: [],
  modes: [],
  dateFrom: "",
  dateTo: "",
};

/**
 * Logbook - Main logbook page component
 */
export function Logbook() {
  const {
    entries,
    loading,
    error,
    addEntry,
    updateEntry,
    deleteEntry,
    importADIF,
    count,
  } = useLogbook();

  const [filters, setFilters] = useState<QSOFilters>(initialFilters);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Calculate statistics
  const stats = useMemo(() => {
    const uniqueCallsigns = new Set(
      entries.map((e) => e.callsign.toUpperCase()),
    );
    const uniqueBands = new Set(entries.map((e) => e.band));
    const uniqueModes = new Set(entries.map((e) => e.mode));

    // Count by band
    const bandCounts: Record<string, number> = {};
    for (const entry of entries) {
      bandCounts[entry.band] = (bandCounts[entry.band] || 0) + 1;
    }

    // Find top band
    const topBand = Object.entries(bandCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      totalQSOs: count,
      uniqueCallsigns: uniqueCallsigns.size,
      uniqueBands: uniqueBands.size,
      uniqueModes: uniqueModes.size,
      topBand: topBand ? topBand[0] : null,
    };
  }, [entries, count]);

  // Handle row click to edit
  const handleRowClick = useCallback((entry: LogEntry) => {
    setEditingEntry(entry);
  }, []);

  // Handle edit modal close
  const handleEditClose = useCallback(() => {
    setEditingEntry(null);
  }, []);

  // Handle save from edit modal
  const handleEditSave = useCallback(
    async (
      id: string,
      updates: Partial<Omit<LogEntry, "id" | "createdAt">>,
    ) => {
      await updateEntry(id, updates);
    },
    [updateEntry],
  );

  // Handle delete from edit modal
  const handleEditDelete = useCallback(
    async (id: string) => {
      await deleteEntry(id);
    },
    [deleteEntry],
  );

  return (
    <div className="min-h-screen">
      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-orbitron text-2xl font-bold text-gradient-orange">
              LogBook
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Manage your QSO records
            </p>
          </div>

          {/* Import/Export buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
              title="Import ADIF file"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Import
            </button>
            <button
              onClick={() => setExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
              title="Export to ADIF file"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <div className="text-2xl font-orbitron font-bold text-plasma-orange">
              {stats.totalQSOs}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">
              Total QSOs
            </div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-orbitron font-bold text-signal-green">
              {stats.uniqueCallsigns}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">
              Unique Calls
            </div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-orbitron font-bold text-nebula-blue">
              {stats.uniqueBands}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">
              Bands Worked
            </div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-orbitron font-bold text-purple-400">
              {stats.uniqueModes}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mt-1">
              Modes Used
            </div>
          </Card>
        </div>

        {/* Error message */}
        {error && (
          <Card className="p-4 border-alert-red/30 bg-alert-red/10">
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-alert-red flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-alert-red text-sm">{error}</p>
            </div>
          </Card>
        )}

        {/* QSO Entry Form */}
        <QSOEntryForm onSave={addEntry} loading={loading} />

        {/* Filters */}
        <QSOFiltersPanel filters={filters} onFiltersChange={setFilters} />

        {/* QSO Table */}
        {loading && entries.length === 0 ? (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <LoadingSpinner size="lg" />
              <p className="text-gray-500">Loading logbook...</p>
            </div>
          </Card>
        ) : (
          <QSOTable
            entries={entries}
            filters={filters}
            onRowClick={handleRowClick}
            loading={loading}
          />
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-gray-500 pt-4">
          <p>
            {stats.topBand && stats.totalQSOs > 0 && (
              <span>Most active band: {stats.topBand}</span>
            )}
          </p>
        </footer>
      </main>

      {/* Edit Modal */}
      <QSOEditModal
        isOpen={editingEntry !== null}
        onClose={handleEditClose}
        entry={editingEntry}
        onSave={handleEditSave}
        onDelete={handleEditDelete}
      />

      {/* ADIF Import Modal */}
      <ADIFImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        importADIF={importADIF}
        onImportComplete={() => {
          setImportModalOpen(false);
        }}
      />

      {/* ADIF Export Modal */}
      <ADIFExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        entries={entries}
        entryCount={count}
      />
    </div>
  );
}

Logbook.displayName = "Logbook";

export default Logbook;

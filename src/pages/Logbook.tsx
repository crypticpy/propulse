/**
 * Logbook Page - Main QSO logging interface
 * Supports guest logging mode with session management
 */

import { useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui";
import {
  QSOEntryForm,
  QSOTable,
  LogUploadModal,
  AwardsTracker,
} from "@/components/logbook";
import {
  GuestModeToggle,
  CreateGuestSessionModal,
  JoinGuestSessionModal,
} from "@/components/guest";
import { useLogbook, useGuestContext } from "@/hooks/useLogbook";
import { useUserStore } from "@/stores/userStore";
import { useGuestStore } from "@/stores/guestStore";
import type { LogEntry } from "@/lib/db/types";

export function Logbook() {
  const {
    entries,
    loading,
    error,
    addEntry,
    deleteEntry,
    importADIF,
    exportADIF,
    count,
  } = useLogbook();

  const station = useUserStore((state) => state.station);
  const { activeSession, isGuestMode } = useGuestStore();
  const guestContext = useGuestContext();

  // Modal states
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [showJoinSession, setShowJoinSession] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAwards, setShowAwards] = useState(false);

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [importContent, setImportContent] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    async (entry: Omit<LogEntry, "id" | "createdAt" | "updatedAt">) => {
      setIsSubmitting(true);
      try {
        await addEntry(entry, guestContext ? { guestContext } : undefined);
      } finally {
        setIsSubmitting(false);
      }
    },
    [addEntry, guestContext],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setIsDeleting(true);
      try {
        await deleteEntry(id);
      } finally {
        setIsDeleting(false);
      }
    },
    [deleteEntry],
  );

  const handleExport = useCallback(() => {
    const adif = exportADIF();
    const blob = new Blob([adif], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `propulse-log-${new Date().toISOString().split("T")[0]}.adi`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportADIF]);

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setImportContent(content);
        setImportError(null);
        setImportSuccess(null);
      };
      reader.onerror = () => {
        setImportError("Failed to read file");
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleImportSubmit = useCallback(async () => {
    if (!importContent.trim()) {
      setImportError("Please paste ADIF content or upload a file");
      return;
    }

    setImportError(null);
    setImportSuccess(null);

    try {
      const count = await importADIF(importContent);
      setImportSuccess(count);
      setImportContent("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Failed to import ADIF",
      );
    }
  }, [importContent, importADIF]);

  const handleCloseImport = useCallback(() => {
    setShowImportModal(false);
    setImportContent("");
    setImportError(null);
    setImportSuccess(null);
  }, []);

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-orbitron text-2xl font-black text-gradient-orange tracking-wider">
              Logbook
            </h1>
            <p className="text-gray-400 text-sm">
              {count} {count === 1 ? "QSO" : "QSOs"} logged
              {isGuestMode && guestContext && (
                <span className="ml-2 text-cosmic-cyan">
                  (Guest mode active)
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Guest Mode Toggle */}
            <GuestModeToggle
              onCreateSession={() => setShowCreateSession(true)}
              onJoinSession={() => setShowJoinSession(true)}
            />

            {/* Import/Export/Upload/Awards Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="px-3 py-2 bg-nebula-blue border border-white/10 rounded-lg text-gray-300 hover:text-white hover:border-white/20 transition-colors text-sm font-medium flex items-center gap-2"
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
                onClick={handleExport}
                disabled={count === 0}
                className="px-3 py-2 bg-nebula-blue border border-white/10 rounded-lg text-gray-300 hover:text-white hover:border-white/20 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <button
                onClick={() => setShowUploadModal(true)}
                disabled={count === 0}
                className="px-3 py-2 bg-cosmic-cyan/20 border border-cosmic-cyan/30 rounded-lg text-cosmic-cyan hover:bg-cosmic-cyan/30 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                Upload
              </button>
              <button
                onClick={() => setShowAwards(!showAwards)}
                className={`px-3 py-2 border rounded-lg transition-colors text-sm font-medium flex items-center gap-2 ${
                  showAwards
                    ? "bg-signal-green/20 border-signal-green/50 text-signal-green"
                    : "bg-nebula-blue border-white/10 text-gray-300 hover:text-white hover:border-white/20"
                }`}
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
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
                Awards
              </button>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <Card variant="alert" className="p-4">
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
              <span className="text-alert-red">{error}</span>
            </div>
          </Card>
        )}

        {/* Station Not Set Warning */}
        {!station && !isGuestMode && (
          <Card className="p-4 border-caution-amber/30">
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-caution-amber flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <span className="text-caution-amber font-medium">
                  Station not configured
                </span>
                <span className="text-gray-400 ml-2">
                  Set your callsign in Settings to enable guest hosting.
                </span>
              </div>
            </div>
          </Card>
        )}

        {/* QSO Entry Form */}
        <QSOEntryForm
          onSubmit={handleSubmit}
          guestContext={guestContext}
          stationCallsign={activeSession?.stationCallsign || station?.callsign}
          isSubmitting={isSubmitting}
        />

        {/* QSO Table */}
        <QSOTable
          entries={entries}
          onDelete={handleDelete}
          isDeleting={isDeleting}
          loading={loading}
        />

        {/* Awards Tracker (toggleable) */}
        {showAwards && entries.length > 0 && (
          <AwardsTracker entries={entries} />
        )}
      </div>

      {/* Guest Session Modals */}
      <CreateGuestSessionModal
        isOpen={showCreateSession}
        onClose={() => setShowCreateSession(false)}
      />
      <JoinGuestSessionModal
        isOpen={showJoinSession}
        onClose={() => setShowJoinSession(false)}
      />

      {/* Log Upload Modal */}
      <LogUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        entries={entries}
      />

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleCloseImport}
          />
          <Card className="relative z-10 w-full max-w-lg p-6" animate>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
                Import ADIF
              </h2>
              <button
                onClick={handleCloseImport}
                className="p-1 text-gray-400 hover:text-white transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-6 h-6"
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

            {/* File Upload */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Upload ADIF File
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".adi,.adif,.ADI,.ADIF"
                onChange={handleImportFile}
                className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-plasma-orange/20 file:text-plasma-orange file:font-medium hover:file:bg-plasma-orange/30 file:cursor-pointer"
              />
            </div>

            {/* Paste Area */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Or Paste ADIF Content
              </label>
              <textarea
                value={importContent}
                onChange={(e) => {
                  setImportContent(e.target.value);
                  setImportError(null);
                  setImportSuccess(null);
                }}
                placeholder="Paste ADIF content here..."
                rows={8}
                className="w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white placeholder-gray-500 font-mono text-sm focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30 resize-none"
              />
            </div>

            {/* Error/Success Messages */}
            {importError && (
              <div className="mb-4 p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg">
                <p className="text-sm text-alert-red">{importError}</p>
              </div>
            )}
            {importSuccess !== null && (
              <div className="mb-4 p-3 bg-signal-green/10 border border-signal-green/30 rounded-lg">
                <p className="text-sm text-signal-green">
                  Successfully imported {importSuccess}{" "}
                  {importSuccess === 1 ? "entry" : "entries"}!
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleCloseImport}
                className="flex-1 px-4 py-2 bg-nebula-blue border border-white/10 rounded-lg text-gray-300 hover:text-white hover:border-white/20 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleImportSubmit}
                disabled={!importContent.trim()}
                className="flex-1 px-4 py-2 bg-plasma-orange/20 border border-plasma-orange/50 rounded-lg text-plasma-orange hover:bg-plasma-orange/30 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default Logbook;

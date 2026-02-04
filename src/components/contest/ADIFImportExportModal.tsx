/**
 * ADIFImportExportModal - Modal for importing and exporting ADIF files for contest sessions
 *
 * Features:
 * - Tab-based toggle between Import and Export modes
 * - Export: Preview ADIF content and download as .adi file
 * - Import: File upload, preview parsed QSOs, and confirm import
 * - Shows warnings for any import issues
 * - ProPulse aesthetic styling
 */

import { useState, useCallback, useMemo, useRef } from "react";
import { Card } from "@/components/ui";
import { useContestStore } from "@/stores/contestStore";
import {
  exportSessionToADIF,
  importADIFToSession,
  isValidADIF,
  getADIFStats,
  downloadADIF,
  type ADIFImportResult,
} from "@/lib/contest/adif";
import { getContestById } from "@/lib/data/contests";

export interface ADIFImportExportModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Initial mode to display */
  initialMode?: "import" | "export";
}

type TabMode = "import" | "export";

/**
 * ADIFImportExportModal Component
 */
export function ADIFImportExportModal({
  isOpen,
  onClose,
  initialMode = "export",
}: ADIFImportExportModalProps) {
  const activeSession = useContestStore((state) => state.activeSession);
  const logQSO = useContestStore((state) => state.logQSO);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabMode>(initialMode);

  // Export state
  const [exportContent, setExportContent] = useState<string>("");
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeAppFields, setIncludeAppFields] = useState(true);

  // Import state
  const [importContent, setImportContent] = useState<string>("");
  const [importFileName, setImportFileName] = useState<string>("");
  const [importResult, setImportResult] = useState<ADIFImportResult | null>(
    null,
  );
  const [importError, setImportError] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get contest info
  const contest = activeSession
    ? getContestById(activeSession.contestId)
    : null;

  // Generate export content when tab changes or options change
  const handleGenerateExport = useCallback(() => {
    if (!activeSession) {
      return;
    }

    const content = exportSessionToADIF(activeSession, {
      includeHeader,
      includeAppFields,
      programId: "ProPulse",
      programVersion: "1.0.0",
    });
    setExportContent(content);
  }, [activeSession, includeHeader, includeAppFields]);

  // Handle tab change
  const handleTabChange = useCallback(
    (tab: TabMode) => {
      setActiveTab(tab);
      if (tab === "export") {
        handleGenerateExport();
      } else {
        // Reset import state
        setImportContent("");
        setImportFileName("");
        setImportResult(null);
        setImportError("");
      }
    },
    [handleGenerateExport],
  );

  // Handle file selection for import
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      setImportFileName(file.name);
      setImportError("");
      setImportResult(null);

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setImportContent(content);

        // Validate ADIF content
        if (!isValidADIF(content)) {
          setImportError(
            "Invalid ADIF file: The file does not appear to be a valid ADIF format.",
          );
          return;
        }

        // Parse and preview
        if (activeSession) {
          const result = importADIFToSession(content, activeSession);
          setImportResult(result);
        }
      };
      reader.onerror = () => {
        setImportError("Failed to read file. Please try again.");
      };
      reader.readAsText(file);
    },
    [activeSession],
  );

  // Handle export download
  const handleDownload = useCallback(() => {
    if (!exportContent || !activeSession) {
      return;
    }

    const contestName = contest?.cabrilloId || "contest";
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `${contestName}-${date}.adi`;

    downloadADIF(exportContent, filename);
  }, [exportContent, activeSession, contest]);

  // Handle import confirmation
  const handleConfirmImport = useCallback(async () => {
    if (!importResult || !activeSession) {
      return;
    }

    setIsImporting(true);

    // Import each QSO
    for (const qso of importResult.importedQSOs) {
      logQSO(qso);
    }

    setIsImporting(false);
    onClose();
  }, [importResult, activeSession, logQSO, onClose]);

  // Copy export content to clipboard
  const handleCopyToClipboard = useCallback(async () => {
    if (!exportContent) {
      return;
    }
    await navigator.clipboard.writeText(exportContent);
  }, [exportContent]);

  // ADIF stats for preview
  const adifStats = useMemo(() => {
    if (!importContent) {
      return null;
    }
    return getADIFStats(importContent);
  }, [importContent]);

  // Trigger file input click
  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) {
    return null;
  }

  const inputClass =
    "w-full px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30";

  const tabClass = (active: boolean) =>
    `px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
      active
        ? "bg-nebula-blue text-white border-b-2 border-plasma-orange"
        : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
    }`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <Card
        className="relative z-10 w-full max-w-2xl p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        animate
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
            ADIF Import/Export
          </h2>
          <button
            onClick={handleClose}
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

        {/* Session info */}
        {activeSession && contest && (
          <div className="mb-4 p-3 bg-nebula-blue rounded-lg border border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{contest.name}</p>
                <p className="text-xs text-gray-400">
                  {activeSession.qsos.length} QSOs logged
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-plasma-orange font-mono">
                  {activeSession.totalScore.toLocaleString()} pts
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No active session warning */}
        {!activeSession && (
          <div className="mb-4 p-4 bg-red-900/30 rounded-lg border border-red-500/30">
            <p className="text-sm text-red-300">
              No active contest session. Please start a contest before importing
              or exporting ADIF files.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-white/10">
          <button
            onClick={() => handleTabChange("export")}
            className={tabClass(activeTab === "export")}
          >
            Export
          </button>
          <button
            onClick={() => handleTabChange("import")}
            className={tabClass(activeTab === "import")}
          >
            Import
          </button>
        </div>

        {/* Export Tab */}
        {activeTab === "export" && activeSession && (
          <div className="space-y-4">
            {/* Export options */}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={(e) => setIncludeHeader(e.target.checked)}
                  className="rounded border-white/20 bg-deep-space text-plasma-orange focus:ring-plasma-orange/30"
                />
                Include ADIF header
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAppFields}
                  onChange={(e) => setIncludeAppFields(e.target.checked)}
                  className="rounded border-white/20 bg-deep-space text-plasma-orange focus:ring-plasma-orange/30"
                />
                Include ProPulse fields
              </label>
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerateExport}
              className="px-4 py-2 bg-nebula-blue text-white text-sm font-medium rounded-lg hover:bg-nebula-blue/80 transition-colors"
            >
              Generate Preview
            </button>

            {/* Preview */}
            {exportContent && (
              <>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    ADIF Preview ({activeSession.qsos.length} QSOs)
                  </label>
                  <textarea
                    value={exportContent}
                    readOnly
                    className={`${inputClass} font-mono text-xs h-64 resize-none`}
                  />
                  <button
                    onClick={handleCopyToClipboard}
                    className="absolute top-8 right-2 p-1.5 text-gray-400 hover:text-white transition-colors"
                    title="Copy to clipboard"
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
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </div>

                {/* Download button */}
                <button
                  onClick={handleDownload}
                  className="w-full px-4 py-3 bg-plasma-orange text-deep-space font-bold rounded-lg
                             hover:bg-plasma-orange/90 shadow-[0_0_20px_rgba(255,170,0,0.3)]
                             transition-all duration-200"
                >
                  Download ADIF File
                </button>
              </>
            )}
          </div>
        )}

        {/* Import Tab */}
        {activeTab === "import" && activeSession && (
          <div className="space-y-4">
            {/* File input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select ADIF File
              </label>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".adi,.adif,.ADI,.ADIF"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  type="text"
                  value={importFileName}
                  readOnly
                  placeholder="No file selected..."
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={handleBrowseClick}
                  className="px-4 py-2 bg-nebula-blue text-white text-sm font-medium rounded-lg hover:bg-nebula-blue/80 transition-colors whitespace-nowrap"
                >
                  Browse...
                </button>
              </div>
            </div>

            {/* Import error */}
            {importError && (
              <div className="p-3 bg-red-900/30 rounded-lg border border-red-500/30">
                <p className="text-sm text-red-300">{importError}</p>
              </div>
            )}

            {/* File stats */}
            {adifStats && !importError && (
              <div className="p-3 bg-nebula-blue rounded-lg border border-white/10">
                <p className="text-sm text-gray-300">
                  <span className="text-white font-medium">
                    {adifStats.recordCount}
                  </span>{" "}
                  records found
                  {adifStats.hasHeader && " (with header)"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Fields: {adifStats.fields.slice(0, 8).join(", ")}
                  {adifStats.fields.length > 8 &&
                    ` +${adifStats.fields.length - 8} more`}
                </p>
              </div>
            )}

            {/* Import result preview */}
            {importResult && (
              <div className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 bg-green-900/30 rounded-lg border border-green-500/30 text-center">
                    <p className="text-2xl font-bold text-green-400">
                      {importResult.importedCount}
                    </p>
                    <p className="text-xs text-green-300">Ready to import</p>
                  </div>
                  <div className="p-3 bg-yellow-900/30 rounded-lg border border-yellow-500/30 text-center">
                    <p className="text-2xl font-bold text-yellow-400">
                      {importResult.skippedCount}
                    </p>
                    <p className="text-xs text-yellow-300">Skipped (dupes)</p>
                  </div>
                  <div className="p-3 bg-red-900/30 rounded-lg border border-red-500/30 text-center">
                    <p className="text-2xl font-bold text-red-400">
                      {importResult.failedCount}
                    </p>
                    <p className="text-xs text-red-300">Failed</p>
                  </div>
                </div>

                {/* Warnings */}
                {importResult.warnings.length > 0 && (
                  <div className="p-3 bg-yellow-900/20 rounded-lg border border-yellow-500/20 max-h-32 overflow-y-auto">
                    <p className="text-sm font-medium text-yellow-400 mb-2">
                      Warnings ({importResult.warnings.length})
                    </p>
                    <ul className="text-xs text-yellow-300 space-y-1">
                      {importResult.warnings.slice(0, 10).map((warning, i) => (
                        <li key={i}>
                          Record #{warning.recordNumber}
                          {warning.callsign && ` (${warning.callsign})`}:{" "}
                          {warning.message}
                        </li>
                      ))}
                      {importResult.warnings.length > 10 && (
                        <li className="text-yellow-500">
                          ...and {importResult.warnings.length - 10} more
                          warnings
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Errors */}
                {importResult.errors.length > 0 && (
                  <div className="p-3 bg-red-900/20 rounded-lg border border-red-500/20 max-h-32 overflow-y-auto">
                    <p className="text-sm font-medium text-red-400 mb-2">
                      Errors ({importResult.errors.length})
                    </p>
                    <ul className="text-xs text-red-300 space-y-1">
                      {importResult.errors.slice(0, 10).map((error, i) => (
                        <li key={i}>
                          Record #{error.recordNumber}
                          {error.callsign && ` (${error.callsign})`}:{" "}
                          {error.message}
                        </li>
                      ))}
                      {importResult.errors.length > 10 && (
                        <li className="text-red-500">
                          ...and {importResult.errors.length - 10} more errors
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* QSO preview table */}
                {importResult.importedQSOs.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-300 mb-2">
                      QSOs to Import (first 10)
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-white/10">
                      <table className="w-full text-xs">
                        <thead className="bg-nebula-blue text-gray-300">
                          <tr>
                            <th className="px-2 py-1.5 text-left">Call</th>
                            <th className="px-2 py-1.5 text-left">Band</th>
                            <th className="px-2 py-1.5 text-left">Mode</th>
                            <th className="px-2 py-1.5 text-left">Date/Time</th>
                            <th className="px-2 py-1.5 text-left">Exchange</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {importResult.importedQSOs.slice(0, 10).map((qso) => (
                            <tr
                              key={qso.id}
                              className="bg-deep-space hover:bg-white/5"
                            >
                              <td className="px-2 py-1.5 font-mono text-white">
                                {qso.callsign}
                              </td>
                              <td className="px-2 py-1.5 text-gray-300">
                                {qso.band}
                              </td>
                              <td className="px-2 py-1.5 text-gray-300">
                                {qso.mode}
                              </td>
                              <td className="px-2 py-1.5 text-gray-400">
                                {qso.timestamp.slice(0, 16).replace("T", " ")}
                              </td>
                              <td className="px-2 py-1.5 text-gray-400">
                                {qso.exchangeReceived || "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importResult.importedQSOs.length > 10 && (
                        <div className="px-2 py-1.5 text-xs text-gray-500 bg-deep-space border-t border-white/5">
                          ...and {importResult.importedQSOs.length - 10} more
                          QSOs
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Import button */}
                {importResult.importedCount > 0 && (
                  <button
                    onClick={handleConfirmImport}
                    disabled={isImporting}
                    className="w-full px-4 py-3 bg-plasma-orange text-deep-space font-bold rounded-lg
                               hover:bg-plasma-orange/90 shadow-[0_0_20px_rgba(255,170,0,0.3)]
                               transition-all duration-200
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting
                      ? "Importing..."
                      : `Import ${importResult.importedCount} QSOs`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="mt-4 text-xs text-gray-500 text-center">
          ADIF 3.1.4 format supported. Contest-specific fields are preserved in
          APP_PROPULSE_* tags.
        </p>
      </Card>
    </div>
  );
}

export default ADIFImportExportModal;

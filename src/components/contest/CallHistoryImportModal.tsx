/**
 * CallHistoryImportModal - Import call history files to boost SCP suggestions
 *
 * Supports importing call history from:
 * - Simple CSV format (CALL, EXCHANGE columns)
 * - N1MM call history format
 *
 * Features:
 * - File upload via drag-and-drop or file picker
 * - Format auto-detection with manual override
 * - Preview of parsed entries
 * - Option to merge or replace existing history
 */

import { useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui";
import {
  parseCallHistory,
  saveCallHistory,
  getCallHistoryStats,
  clearCallHistory,
  detectFormat,
  parseCSVCallHistory,
  parseN1MMCallHistory,
  type ParseResult,
} from "@/lib/contest/callHistory";

export interface CallHistoryImportModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Callback after successful import */
  onImport?: (count: number) => void;
}

type ImportFormat = "auto" | "csv" | "n1mm";
type ImportStep = "upload" | "preview" | "complete";

export function CallHistoryImportModal({
  isOpen,
  onClose,
  onImport,
}: CallHistoryImportModalProps) {
  // Step management
  const [step, setStep] = useState<ImportStep>("upload");

  // File handling state
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);

  // Format selection
  const [selectedFormat, setSelectedFormat] = useState<ImportFormat>("auto");
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);

  // Parse results
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  // Import options
  const [clearExisting, setClearExisting] = useState(false);

  // Existing history stats
  const existingStats = getCallHistoryStats();

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state on close
  const handleClose = useCallback(() => {
    setStep("upload");
    setFileName(null);
    setFileContent(null);
    setParseResult(null);
    setSelectedFormat("auto");
    setDetectedFormat(null);
    setClearExisting(false);
    onClose();
  }, [onClose]);

  // Handle file selection
  const processFile = useCallback(
    (file: File) => {
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setFileContent(content);

        // Detect format
        const format = detectFormat(content);
        setDetectedFormat(format);

        // Parse with selected or auto-detected format
        let result: ParseResult;
        if (selectedFormat === "auto") {
          result = parseCallHistory(content);
        } else if (selectedFormat === "csv") {
          result = parseCSVCallHistory(content);
        } else {
          result = parseN1MMCallHistory(content);
        }

        setParseResult(result);
        setStep("preview");
      };

      reader.onerror = () => {
        setParseResult({
          entries: [],
          errorCount: 1,
          format: "unknown",
          errors: ["Failed to read file"],
        });
      };

      reader.readAsText(file);
    },
    [selectedFormat],
  );

  // Handle file input change
  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile],
  );

  // Handle drag events
  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      const file = event.dataTransfer.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile],
  );

  // Re-parse with new format
  const handleFormatChange = useCallback(
    (newFormat: ImportFormat) => {
      setSelectedFormat(newFormat);

      if (fileContent) {
        let result: ParseResult;
        if (newFormat === "auto") {
          result = parseCallHistory(fileContent);
        } else if (newFormat === "csv") {
          result = parseCSVCallHistory(fileContent);
        } else {
          result = parseN1MMCallHistory(fileContent);
        }
        setParseResult(result);
      }
    },
    [fileContent],
  );

  // Perform import
  const handleImport = useCallback(() => {
    if (!parseResult || parseResult.entries.length === 0) {
      return;
    }

    saveCallHistory(parseResult.entries, clearExisting);
    setStep("complete");

    if (onImport) {
      onImport(parseResult.entries.length);
    }
  }, [parseResult, clearExisting, onImport]);

  // Handle clear history
  const handleClearHistory = useCallback(() => {
    clearCallHistory();
    handleClose();
  }, [handleClose]);

  // Get sample entries for preview
  const sampleEntries = parseResult?.entries.slice(0, 5) || [];

  if (!isOpen) return null;

  const selectClass =
    "px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <Card
        className="relative z-10 w-full max-w-lg p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto"
        animate
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
            Import Call History
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

        {/* Step: Upload */}
        {step === "upload" && (
          <>
            {/* Info text */}
            <p className="text-sm text-gray-400 mb-4">
              Import call history to boost SCP (Super Check Partial) suggestions
              during contests. Supports CSV and N1MM formats.
            </p>

            {/* Current history stats */}
            {existingStats.count > 0 && (
              <div className="mb-4 p-3 bg-nebula-blue rounded-lg border border-white/10">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-sm text-gray-300">
                      Current history:{" "}
                    </span>
                    <span className="text-white font-mono">
                      {existingStats.count.toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-300"> entries</span>
                  </div>
                  <button
                    onClick={handleClearHistory}
                    className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}

            {/* Format selection */}
            <div className="mb-4">
              <label
                htmlFor="format-select"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                File Format
              </label>
              <select
                id="format-select"
                value={selectedFormat}
                onChange={(e) =>
                  setSelectedFormat(e.target.value as ImportFormat)
                }
                className={selectClass}
              >
                <option value="auto">Auto-detect</option>
                <option value="csv">Simple CSV</option>
                <option value="n1mm">N1MM Call History</option>
              </select>
            </div>

            {/* Drop zone */}
            <div
              className={`
                relative p-8 border-2 border-dashed rounded-lg text-center
                transition-colors cursor-pointer
                ${
                  isDragging
                    ? "border-plasma-orange bg-plasma-orange/10"
                    : "border-white/20 hover:border-white/40"
                }
              `}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.ch"
                onChange={handleFileChange}
                className="hidden"
              />

              <svg
                className="w-12 h-12 mx-auto mb-3 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>

              <p className="text-gray-300 mb-1">
                Drop your call history file here
              </p>
              <p className="text-sm text-gray-500">or click to browse</p>
              <p className="text-xs text-gray-600 mt-2">
                Supports .csv, .txt, .ch files
              </p>
            </div>

            {/* Format help */}
            <div className="mt-4 p-3 bg-nebula-blue rounded-lg border border-white/10">
              <h4 className="text-sm font-medium text-gray-300 mb-2">
                Supported Formats
              </h4>
              <div className="space-y-2 text-xs text-gray-400">
                <p>
                  <span className="text-plasma-orange">CSV:</span> Header row
                  with CALL column (EXCHANGE, NAME, SECTION, ZONE optional)
                </p>
                <p>
                  <span className="text-plasma-orange">N1MM:</span> Export from
                  N1MM Logger+ Tools {">"} Generate Call History
                </p>
              </div>
            </div>
          </>
        )}

        {/* Step: Preview */}
        {step === "preview" && parseResult && (
          <>
            {/* File info */}
            <div className="mb-4 p-3 bg-nebula-blue rounded-lg border border-white/10">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm text-gray-300">{fileName}</span>
                <span className="text-xs text-gray-500 ml-auto">
                  Format: {detectedFormat?.toUpperCase() || "Unknown"}
                </span>
              </div>
            </div>

            {/* Parse results */}
            <div className="mb-4">
              <div className="flex items-center gap-4 mb-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-plasma-orange font-mono">
                    {parseResult.entries.length.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400">Entries Parsed</div>
                </div>
                {parseResult.errorCount > 0 && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-400 font-mono">
                      {parseResult.errorCount}
                    </div>
                    <div className="text-xs text-gray-400">Errors</div>
                  </div>
                )}
              </div>

              {/* Error messages */}
              {parseResult.errors.length > 0 && (
                <div className="mb-3 p-2 bg-red-900/20 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-400 mb-1">Parse errors:</p>
                  {parseResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-300 font-mono">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Sample preview */}
            {sampleEntries.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-300 mb-2">
                  Sample Entries
                </h4>
                <div className="bg-deep-space border border-white/10 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">
                          Callsign
                        </th>
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">
                          Exchange
                        </th>
                        <th className="px-3 py-2 text-left text-gray-400 font-medium">
                          Section
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {sampleEntries.map((entry, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-mono text-white">
                            {entry.callsign}
                          </td>
                          <td className="px-3 py-2 font-mono text-gray-400">
                            {entry.exchange || "-"}
                          </td>
                          <td className="px-3 py-2 font-mono text-gray-400">
                            {entry.section || entry.zone || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parseResult.entries.length > 5 && (
                  <p className="text-xs text-gray-500 mt-1 text-center">
                    ... and {(parseResult.entries.length - 5).toLocaleString()}{" "}
                    more entries
                  </p>
                )}
              </div>
            )}

            {/* Format override */}
            <div className="mb-4">
              <label
                htmlFor="format-override"
                className="block text-xs text-gray-400 mb-1"
              >
                Wrong format detected? Override:
              </label>
              <select
                id="format-override"
                value={selectedFormat}
                onChange={(e) =>
                  handleFormatChange(e.target.value as ImportFormat)
                }
                className={`${selectClass} text-sm`}
              >
                <option value="auto">Auto-detect</option>
                <option value="csv">Force CSV</option>
                <option value="n1mm">Force N1MM</option>
              </select>
            </div>

            {/* Import options */}
            {existingStats.count > 0 && (
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clearExisting}
                    onChange={(e) => setClearExisting(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-deep-space text-plasma-orange focus:ring-plasma-orange/30"
                  />
                  <span className="text-sm text-gray-300">
                    Replace existing history (
                    {existingStats.count.toLocaleString()} entries)
                  </span>
                </label>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep("upload")}
                className="flex-1 px-4 py-2 border border-white/20 text-gray-300 rounded-lg hover:bg-white/5 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={parseResult.entries.length === 0}
                className="flex-1 px-4 py-2 bg-plasma-orange text-deep-space font-bold rounded-lg hover:bg-plasma-orange/90 shadow-[0_0_15px_rgba(255,170,0,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Import{" "}
                {parseResult.entries.length > 0 &&
                  `(${parseResult.entries.length.toLocaleString()})`}
              </button>
            </div>
          </>
        )}

        {/* Step: Complete */}
        {step === "complete" && parseResult && (
          <div className="text-center py-6">
            {/* Success icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-400"
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
            </div>

            <h3 className="text-lg font-bold text-white mb-2">
              Import Complete
            </h3>
            <p className="text-gray-400 mb-6">
              Successfully imported{" "}
              <span className="text-plasma-orange font-mono">
                {parseResult.entries.length.toLocaleString()}
              </span>{" "}
              call history entries.
            </p>

            {/* Updated stats */}
            <div className="mb-6 p-4 bg-nebula-blue rounded-lg border border-white/10">
              <div className="text-sm text-gray-400">Total Call History</div>
              <div className="text-3xl font-bold text-white font-mono">
                {getCallHistoryStats().count.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">
                entries available for SCP
              </div>
            </div>

            <button
              onClick={handleClose}
              className="px-6 py-2 bg-plasma-orange text-deep-space font-bold rounded-lg hover:bg-plasma-orange/90 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

export default CallHistoryImportModal;

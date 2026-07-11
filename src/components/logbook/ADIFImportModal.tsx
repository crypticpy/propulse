/**
 * ADIF Import Modal
 * Allows users to import QSO records from .adi/.adif files
 * with file preview, validation, and import options
 */

import { useState, useCallback, useRef } from "react";
import { DetailModal } from "../ui/DetailModal";
import { ProgressBar } from "../ui/ProgressBar";
import {
  parseADIF,
  isValidADIF,
  getADIFStats,
} from "../../lib/utils/adifParser";
import { clearAllLogEntries } from "../../lib/db/logStore";
import type { LogEntry } from "../../lib/db/types";

export interface ADIFImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after successful import with the count of imported records */
  onImportComplete?: (count: number) => void;
  /** Import function from useLogbook hook */
  importADIF: (content: string) => Promise<number>;
}

type ImportState = "initial" | "preview" | "importing" | "success" | "error";

interface FilePreview {
  name: string;
  size: number;
  content: string;
  recordCount: number;
  hasHeader: boolean;
  fields: string[];
  sampleRecords: Omit<LogEntry, "id" | "createdAt" | "updatedAt">[];
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * ADIFImportModal Component
 *
 * Provides a multi-step import flow:
 * 1. File selection (drag-drop or button)
 * 2. Preview with stats and sample records
 * 3. Import with progress indication
 * 4. Success or error state
 */
export function ADIFImportModal({
  isOpen,
  onClose,
  onImportComplete,
  importADIF,
}: ADIFImportModalProps) {
  const [state, setState] = useState<ImportState>("initial");
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importProgress, setImportProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Reset modal state when closing
   */
  const handleClose = useCallback(() => {
    setState("initial");
    setFilePreview(null);
    setImportMode("merge");
    setImportProgress(0);
    setImportedCount(0);
    setErrorMessage("");
    setIsDragging(false);
    onClose();
  }, [onClose]);

  /**
   * Process selected file
   */
  const processFile = useCallback(async (file: File) => {
    // Validate file extension
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "adi" && extension !== "adif") {
      setErrorMessage("Please select a valid ADIF file (.adi or .adif)");
      setState("error");
      return;
    }

    try {
      const content = await file.text();

      // Validate ADIF content
      if (!isValidADIF(content)) {
        setErrorMessage(
          "The file does not appear to be a valid ADIF file. Please check the file format.",
        );
        setState("error");
        return;
      }

      // Get stats
      const stats = getADIFStats(content);

      if (stats.recordCount === 0) {
        setErrorMessage("No QSO records found in the ADIF file.");
        setState("error");
        return;
      }

      // Parse sample records (first 3)
      const allRecords = parseADIF(content);
      const sampleRecords = allRecords.slice(0, 3);

      setFilePreview({
        name: file.name,
        size: file.size,
        content,
        recordCount: stats.recordCount,
        hasHeader: stats.hasHeader,
        fields: stats.fields,
        sampleRecords,
      });
      setState("preview");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to read file",
      );
      setState("error");
    }
  }, []);

  /**
   * Handle file selection from input
   */
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile],
  );

  /**
   * Handle drag events
   */
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);

      const file = event.dataTransfer.files[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile],
  );

  /**
   * Execute the import
   */
  const handleImport = useCallback(async () => {
    if (!filePreview) return;

    setState("importing");
    setImportProgress(10);

    try {
      // If replace mode, clear existing entries first
      if (importMode === "replace") {
        setImportProgress(20);
        await clearAllLogEntries();
      }

      setImportProgress(40);

      // Import the ADIF content
      const count = await importADIF(filePreview.content);

      setImportProgress(100);
      setImportedCount(count);
      setState("success");

      // Notify parent
      onImportComplete?.(count);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to import ADIF file",
      );
      setState("error");
    }
  }, [filePreview, importMode, importADIF, onImportComplete]);

  /**
   * Reset to initial state for new import
   */
  const handleReset = useCallback(() => {
    setState("initial");
    setFilePreview(null);
    setErrorMessage("");
    setImportProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import ADIF"
      subtitle="Import QSO records from an ADIF file"
      size="lg"
    >
      <div className="space-y-6">
        {/* Initial State - File Picker */}
        {state === "initial" && (
          <div
            className={`
              relative border-2 border-dashed rounded-xl p-8
              transition-all duration-200 cursor-pointer
              ${
                isDragging
                  ? "border-plasma-orange bg-plasma-orange/10"
                  : "border-gray-600 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800"
              }
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".adi,.adif"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="text-center">
              {/* Upload Icon */}
              <svg
                className="w-12 h-12 mx-auto mb-4 text-gray-400"
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

              <p className="text-lg font-medium text-gray-200 mb-2">
                {isDragging ? "Drop file here" : "Drop ADIF file here"}
              </p>
              <p className="text-sm text-gray-400 mb-4">or click to browse</p>
              <p className="text-xs text-gray-500">
                Supported formats: .adi, .adif
              </p>
            </div>
          </div>
        )}

        {/* Preview State */}
        {state === "preview" && filePreview && (
          <>
            {/* File Info */}
            <div className="glass-panel p-4 rounded-xl">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-plasma-orange/20 rounded-lg">
                  <svg
                    className="w-6 h-6 text-plasma-orange"
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
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-200 truncate">
                    {filePreview.name}
                  </p>
                  <p className="text-sm text-gray-400">
                    {formatFileSize(filePreview.size)}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  aria-label="Remove file"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-panel p-4 rounded-xl">
                <p className="text-sm text-gray-400 mb-1">Records Found</p>
                <p className="text-2xl font-mono font-bold text-signal-green">
                  {filePreview.recordCount.toLocaleString()}
                </p>
              </div>
              <div className="glass-panel p-4 rounded-xl">
                <p className="text-sm text-gray-400 mb-1">Fields Present</p>
                <p className="text-2xl font-mono font-bold text-cosmic-cyan">
                  {filePreview.fields.length}
                </p>
              </div>
            </div>

            {/* Field Summary */}
            <div className="glass-panel p-4 rounded-xl">
              <p className="text-sm text-gray-400 mb-2">Available Fields</p>
              <div className="flex flex-wrap gap-1.5">
                {filePreview.fields.slice(0, 15).map((field) => (
                  <span
                    key={field}
                    className="px-2 py-0.5 text-xs font-mono bg-white/5 text-gray-300 rounded"
                  >
                    {field}
                  </span>
                ))}
                {filePreview.fields.length > 15 && (
                  <span className="px-2 py-0.5 text-xs text-gray-500">
                    +{filePreview.fields.length - 15} more
                  </span>
                )}
              </div>
            </div>

            {/* Sample Records */}
            {filePreview.sampleRecords.length > 0 && (
              <div className="glass-panel p-4 rounded-xl">
                <p className="text-sm text-gray-400 mb-3">Sample Records</p>
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-2 px-2 text-gray-400 font-medium">
                          Callsign
                        </th>
                        <th className="text-left py-2 px-2 text-gray-400 font-medium">
                          Date
                        </th>
                        <th className="text-left py-2 px-2 text-gray-400 font-medium">
                          Band
                        </th>
                        <th className="text-left py-2 px-2 text-gray-400 font-medium">
                          Mode
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filePreview.sampleRecords.map((record, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-white/5 last:border-0"
                        >
                          <td className="py-2 px-2 font-mono text-plasma-orange">
                            {record.callsign}
                          </td>
                          <td className="py-2 px-2 text-gray-300">
                            {record.date}
                          </td>
                          <td className="py-2 px-2 text-gray-300">
                            {record.band || "-"}
                          </td>
                          <td className="py-2 px-2 text-gray-300">
                            {record.mode || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Import Options */}
            <div className="glass-panel p-4 rounded-xl">
              <p className="text-sm text-gray-400 mb-3">Import Mode</p>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === "merge"}
                    onChange={() => setImportMode("merge")}
                    className="w-4 h-4 text-plasma-orange accent-plasma-orange"
                  />
                  <div>
                    <p className="text-gray-200 font-medium">
                      Add to existing log
                    </p>
                    <p className="text-xs text-gray-400">
                      Imported records will be added to your current logbook
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg bg-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === "replace"}
                    onChange={() => setImportMode("replace")}
                    className="w-4 h-4 text-plasma-orange accent-plasma-orange"
                  />
                  <div>
                    <p className="text-gray-200 font-medium">
                      Replace existing log
                    </p>
                    <p className="text-xs text-gray-400">
                      Your current logbook will be cleared before import
                    </p>
                  </div>
                </label>
              </div>

              {importMode === "replace" && (
                <div className="mt-3 p-3 bg-alert-red/10 border border-alert-red/30 rounded-lg flex gap-2">
                  <svg
                    className="w-5 h-5 text-alert-red flex-shrink-0 mt-0.5"
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
                  <p className="text-sm text-alert-red">
                    Warning: This will permanently delete all existing log
                    entries before importing.
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-plasma-orange hover:bg-plasma-orange/90 text-white font-medium rounded-lg transition-colors"
              >
                Import {filePreview.recordCount.toLocaleString()} Records
              </button>
            </div>
          </>
        )}

        {/* Importing State */}
        {state === "importing" && (
          <div className="py-8 space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="absolute inset-0 border-4 border-gray-700 rounded-full" />
                <div
                  className="absolute inset-0 border-4 border-plasma-orange rounded-full animate-spin"
                  style={{ borderTopColor: "transparent" }}
                />
              </div>
              <p className="text-lg text-gray-200">
                {importMode === "replace"
                  ? "Clearing existing log..."
                  : "Importing records..."}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Please wait, this may take a moment
              </p>
            </div>

            <ProgressBar
              value={importProgress}
              color="green"
              showValue
              label="Progress"
            />
          </div>
        )}

        {/* Success State */}
        {state === "success" && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-signal-green/20 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-signal-green"
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
            <div>
              <p className="text-xl font-medium text-signal-green mb-1">
                Import Complete
              </p>
              <p className="text-gray-400">
                Successfully imported{" "}
                <span className="font-mono text-white">
                  {importedCount.toLocaleString()}
                </span>{" "}
                QSO records
              </p>
            </div>
            <button
              onClick={handleClose}
              className="mt-4 px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Error State */}
        {state === "error" && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-alert-red/20 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-alert-red"
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
            </div>
            <div>
              <p className="text-xl font-medium text-alert-red mb-2">
                Import Failed
              </p>
              <p className="text-gray-400 max-w-md mx-auto">{errorMessage}</p>
            </div>
            <div className="flex gap-3 justify-center mt-4">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-plasma-orange hover:bg-plasma-orange/90 text-white font-medium rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </DetailModal>
  );
}

export default ADIFImportModal;

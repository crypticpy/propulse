/**
 * ADIF Export Modal
 * Allows users to export QSO records to an ADIF file
 * with export statistics and filename customization
 */

import { useState, useMemo, useCallback } from "react";
import { DetailModal } from "../ui/DetailModal";
import { generateADIF } from "../../lib/utils/adifParser";
import type { LogEntry } from "../../lib/db/types";

export interface ADIFExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Log entries to export */
  entries: LogEntry[];
  /** Total entry count for display */
  entryCount: number;
}

/**
 * Generate default filename based on current date
 */
function getDefaultFilename(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `propulse-log-${year}-${month}-${day}.adi`;
}

/**
 * ADIFExportModal Component
 *
 * Displays export statistics and allows filename customization
 * before triggering the ADIF file download.
 */
export function ADIFExportModal({
  isOpen,
  onClose,
  entries,
  entryCount,
}: ADIFExportModalProps) {
  const [filename, setFilename] = useState(getDefaultFilename());
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  /**
   * Calculate export statistics from entries
   */
  const stats = useMemo(() => {
    if (entries.length === 0) {
      return {
        dateRange: null,
        bands: [],
        modes: [],
      };
    }

    // Sort entries by date to find range
    const sortedByDate = [...entries].sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const oldestDate = sortedByDate[0]?.date;
    const newestDate = sortedByDate[sortedByDate.length - 1]?.date;

    // Collect unique bands and modes
    const bandSet = new Set<string>();
    const modeSet = new Set<string>();

    for (const entry of entries) {
      if (entry.band) bandSet.add(entry.band.toUpperCase());
      if (entry.mode) modeSet.add(entry.mode.toUpperCase());
    }

    // Sort bands by frequency (roughly)
    const bandOrder = [
      "160M",
      "80M",
      "60M",
      "40M",
      "30M",
      "20M",
      "17M",
      "15M",
      "12M",
      "10M",
      "6M",
      "2M",
      "70CM",
    ];
    const bands = Array.from(bandSet).sort((a, b) => {
      const aIdx = bandOrder.indexOf(a);
      const bIdx = bandOrder.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return a.localeCompare(b);
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });

    // Sort modes alphabetically
    const modes = Array.from(modeSet).sort();

    return {
      dateRange:
        oldestDate && newestDate
          ? { oldest: oldestDate, newest: newestDate }
          : null,
      bands,
      modes,
    };
  }, [entries]);

  /**
   * Handle the export action
   */
  const handleExport = useCallback(() => {
    if (entries.length === 0) return;

    setIsExporting(true);

    try {
      // Generate ADIF content
      const adifContent = generateADIF(entries);

      // Create blob and trigger download
      const blob = new Blob([adifContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download =
        filename.endsWith(".adi") || filename.endsWith(".adif")
          ? filename
          : `${filename}.adi`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);

      setExportSuccess(true);

      // Auto-close after brief delay
      setTimeout(() => {
        onClose();
        // Reset state for next open
        setExportSuccess(false);
        setFilename(getDefaultFilename());
      }, 1500);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [entries, filename, onClose]);

  /**
   * Reset state when closing
   */
  const handleClose = useCallback(() => {
    setFilename(getDefaultFilename());
    setExportSuccess(false);
    setIsExporting(false);
    onClose();
  }, [onClose]);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Export ADIF"
      subtitle="Download your logbook as an ADIF file"
      size="lg"
    >
      <div className="space-y-6">
        {/* Export Summary */}
        {exportSuccess ? (
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
                Export Complete
              </p>
              <p className="text-gray-400">Your logbook has been downloaded</p>
            </div>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-panel p-4 rounded-xl">
                <p className="text-sm text-gray-400 mb-1">Total QSOs</p>
                <p className="text-2xl font-mono font-bold text-plasma-orange">
                  {entryCount.toLocaleString()}
                </p>
              </div>
              <div className="glass-panel p-4 rounded-xl">
                <p className="text-sm text-gray-400 mb-1">Date Range</p>
                {stats.dateRange ? (
                  <div className="text-sm font-mono text-gray-200">
                    <p>{stats.dateRange.oldest}</p>
                    <p className="text-gray-500">to</p>
                    <p>{stats.dateRange.newest}</p>
                  </div>
                ) : (
                  <p className="text-gray-500">No entries</p>
                )}
              </div>
            </div>

            {/* Bands */}
            {stats.bands.length > 0 && (
              <div className="glass-panel p-4 rounded-xl">
                <p className="text-sm text-gray-400 mb-2">Bands</p>
                <div className="flex flex-wrap gap-2">
                  {stats.bands.map((band) => (
                    <span
                      key={band}
                      className="px-3 py-1 text-sm font-mono bg-cosmic-cyan/20 text-cosmic-cyan rounded-full"
                    >
                      {band}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Modes */}
            {stats.modes.length > 0 && (
              <div className="glass-panel p-4 rounded-xl">
                <p className="text-sm text-gray-400 mb-2">Modes</p>
                <div className="flex flex-wrap gap-2">
                  {stats.modes.map((mode) => (
                    <span
                      key={mode}
                      className="px-3 py-1 text-sm font-mono bg-aurora-purple/20 text-aurora-purple rounded-full"
                    >
                      {mode}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Filename Input */}
            <div className="glass-panel p-4 rounded-xl">
              <label className="block text-sm text-gray-400 mb-2">
                Filename
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="flex-1 px-3 py-2 bg-black/50 border border-white/10 rounded-lg text-gray-200 font-mono text-sm focus:outline-none focus:border-plasma-orange/50 transition-colors"
                  placeholder="filename.adi"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                File will be saved with .adi extension if not specified
              </p>
            </div>

            {/* Empty State Warning */}
            {entryCount === 0 && (
              <div className="p-4 bg-caution-amber/10 border border-caution-amber/30 rounded-xl flex gap-3">
                <svg
                  className="w-5 h-5 text-caution-amber flex-shrink-0 mt-0.5"
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
                  <p className="text-sm text-caution-amber font-medium">
                    No entries to export
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Add some QSO records to your logbook first
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={entryCount === 0 || isExporting}
                className={`
                  px-4 py-2 font-medium rounded-lg transition-colors
                  flex items-center gap-2
                  ${
                    entryCount === 0 || isExporting
                      ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                      : "bg-plasma-orange hover:bg-plasma-orange/90 text-white"
                  }
                `}
              >
                {isExporting ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Exporting...
                  </>
                ) : (
                  <>
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
                    Export ADIF
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </DetailModal>
  );
}

export default ADIFExportModal;

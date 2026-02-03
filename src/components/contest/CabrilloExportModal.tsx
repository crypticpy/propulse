/**
 * CabrilloExportModal - Modal for previewing and exporting Cabrillo log files
 *
 * Provides a preview of the generated Cabrillo content with validation
 * warnings and options to download or copy to clipboard.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Card } from "@/components/ui";
import { useContestStore } from "@/stores/contestStore";
import { useUserStore } from "@/stores/userStore";
import { getContestById } from "@/lib/data/contests";
import {
  generateCabrillo,
  generateCabrilloFilename,
  validateCabrilloHeader,
  type CabrilloValidationWarning,
} from "@/lib/contest/cabrillo";

export interface CabrilloExportModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
}

type FileExtension = "cbr" | "log";

/**
 * WarningBadge - Displays a validation warning with appropriate styling
 */
function WarningBadge({ warning }: { warning: CabrilloValidationWarning }) {
  const isError = warning.severity === "error";
  return (
    <div
      className={`flex items-start gap-2 p-3 rounded-lg border ${
        isError
          ? "bg-red-500/10 border-red-500/30"
          : "bg-yellow-500/10 border-yellow-500/30"
      }`}
    >
      <svg
        className={`w-5 h-5 flex-shrink-0 ${isError ? "text-red-400" : "text-yellow-400"}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        {isError ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        )}
      </svg>
      <div>
        <span
          className={`font-medium ${isError ? "text-red-300" : "text-yellow-300"}`}
        >
          {warning.field}:
        </span>
        <span className="ml-1 text-gray-300">{warning.message}</span>
      </div>
    </div>
  );
}

export function CabrilloExportModal({
  isOpen,
  onClose,
}: CabrilloExportModalProps) {
  // Store state
  const activeSession = useContestStore((state) => state.activeSession);
  const sessionHistory = useContestStore((state) => state.sessionHistory);
  const station = useUserStore((state) => state.station);

  // Local state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [fileExtension, setFileExtension] = useState<FileExtension>("cbr");
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const previewRef = useRef<HTMLPreElement>(null);

  // Determine which session to use
  const session = useMemo(() => {
    if (selectedSessionId) {
      return (
        sessionHistory.find((s) => s.id === selectedSessionId) || activeSession
      );
    }
    return activeSession;
  }, [selectedSessionId, sessionHistory, activeSession]);

  // Get contest definition
  const contest = useMemo(() => {
    if (!session) return null;
    return getContestById(session.contestId);
  }, [session]);

  // Generate Cabrillo content
  const cabrilloResult = useMemo(() => {
    if (!session || !contest) return null;
    return generateCabrillo(session, contest, station);
  }, [session, contest, station]);

  // Validate header for warnings display
  const warnings = useMemo(() => {
    if (!session || !contest) return [];
    return validateCabrilloHeader(session, contest, station);
  }, [session, contest, station]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedSessionId(null);
      setCopySuccess(false);
      setDownloadSuccess(false);
    }
  }, [isOpen]);

  // Reset copy/download success indicators
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  useEffect(() => {
    if (downloadSuccess) {
      const timer = setTimeout(() => setDownloadSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [downloadSuccess]);

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!cabrilloResult) return;

    try {
      await navigator.clipboard.writeText(cabrilloResult.content);
      setCopySuccess(true);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = cabrilloResult.content;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopySuccess(true);
    }
  }, [cabrilloResult]);

  // Handle download
  const handleDownload = useCallback(() => {
    if (!cabrilloResult || !contest || !station?.callsign) return;

    const filename = generateCabrilloFilename(
      station.callsign,
      contest.cabrilloId,
      fileExtension,
    );

    const blob = new Blob([cabrilloResult.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadSuccess(true);
  }, [cabrilloResult, contest, station?.callsign, fileExtension]);

  // Handle close
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  // Check if we have a valid session to export
  const hasSession = session !== null;
  const hasErrors = warnings.some((w) => w.severity === "error");
  const hasWarnings = warnings.length > 0;

  const inputClass =
    "px-3 py-2 bg-deep-space border border-white/10 rounded-lg text-white focus:outline-none focus:border-plasma-orange/50 focus:ring-1 focus:ring-plasma-orange/30";

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
        className="relative z-10 w-full max-w-3xl p-6 max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col"
        animate
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-orbitron text-xl font-bold text-gradient-orange">
            Export Cabrillo Log
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

        {!hasSession ? (
          // No session available
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-12">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="text-gray-400 text-lg">
                No contest session to export
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Start a contest session to generate a Cabrillo log file.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Session selector if we have history */}
            {sessionHistory.length > 0 && (
              <div className="mb-4">
                <label
                  htmlFor="session-select"
                  className="block text-sm text-gray-400 mb-2"
                >
                  Select Session
                </label>
                <select
                  id="session-select"
                  value={selectedSessionId || ""}
                  onChange={(e) => setSelectedSessionId(e.target.value || null)}
                  className={`${selectClass} w-full`}
                >
                  {activeSession && (
                    <option value="">
                      Current Session -{" "}
                      {getContestById(activeSession.contestId)?.name ||
                        activeSession.contestId}
                    </option>
                  )}
                  {sessionHistory.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getContestById(s.contestId)?.name || s.contestId} -{" "}
                      {new Date(s.startTime).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Stats summary */}
            {cabrilloResult && (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-3 bg-nebula-blue rounded-lg border border-white/10 text-center">
                  <div className="text-2xl font-bold text-white font-mono">
                    {cabrilloResult.stats.qsoCount}
                  </div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">
                    QSOs
                  </div>
                </div>
                <div className="p-3 bg-nebula-blue rounded-lg border border-white/10 text-center">
                  <div className="text-2xl font-bold text-white font-mono">
                    {cabrilloResult.stats.dupeCount}
                  </div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">
                    Dupes
                  </div>
                </div>
                <div className="p-3 bg-nebula-blue rounded-lg border border-white/10 text-center">
                  <div className="text-2xl font-bold text-plasma-orange font-mono">
                    {cabrilloResult.stats.claimedScore.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400 uppercase tracking-wide">
                    Score
                  </div>
                </div>
              </div>
            )}

            {/* Validation warnings */}
            {hasWarnings && (
              <div className="mb-4 space-y-2">
                <h3 className="text-sm font-medium text-gray-300">
                  {hasErrors ? "Validation Errors" : "Validation Warnings"}
                </h3>
                {warnings.map((warning, idx) => (
                  <WarningBadge
                    key={`${warning.field}-${idx}`}
                    warning={warning}
                  />
                ))}
              </div>
            )}

            {/* Cabrillo preview */}
            <div className="flex-1 min-h-0 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-300">
                  Cabrillo Preview
                </h3>
                <span className="text-xs text-gray-500">
                  {contest?.cabrilloId || "Unknown Contest"}
                </span>
              </div>
              <div className="h-64 overflow-auto bg-black/30 rounded-lg border border-white/10">
                <pre
                  ref={previewRef}
                  className="p-4 text-xs font-mono text-gray-300 whitespace-pre"
                >
                  {cabrilloResult?.content || "No content generated"}
                </pre>
              </div>
            </div>

            {/* Export options */}
            <div className="flex items-center gap-4 pt-4 border-t border-white/10">
              {/* File extension selector */}
              <div className="flex items-center gap-2">
                <label htmlFor="file-ext" className="text-sm text-gray-400">
                  Format:
                </label>
                <select
                  id="file-ext"
                  value={fileExtension}
                  onChange={(e) =>
                    setFileExtension(e.target.value as FileExtension)
                  }
                  className={`${inputClass} text-sm`}
                >
                  <option value="cbr">.cbr (Cabrillo)</option>
                  <option value="log">.log (Log file)</option>
                </select>
              </div>

              <div className="flex-1" />

              {/* Copy button */}
              <button
                onClick={handleCopy}
                disabled={!cabrilloResult}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2
                  ${
                    copySuccess
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-white"
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {copySuccess ? (
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Copied
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
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                      />
                    </svg>
                    Copy
                  </>
                )}
              </button>

              {/* Download button */}
              <button
                onClick={handleDownload}
                disabled={!cabrilloResult || hasErrors || !station?.callsign}
                className={`px-4 py-2 rounded-lg font-bold transition-all duration-200 flex items-center gap-2
                  ${
                    downloadSuccess
                      ? "bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]"
                      : "bg-plasma-orange text-deep-space hover:bg-plasma-orange/90 shadow-[0_0_15px_rgba(255,170,0,0.3)]"
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
              >
                {downloadSuccess ? (
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Downloaded
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
                    Download
                  </>
                )}
              </button>
            </div>

            {/* Footer note */}
            {hasErrors && (
              <p className="mt-4 text-xs text-red-400 text-center">
                Please resolve the errors above before downloading.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default CabrilloExportModal;

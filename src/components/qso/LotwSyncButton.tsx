/**
 * LotwSyncButton — Upload/Download button with progress indicator
 *
 * Placed in the logbook toolbar. Provides:
 *   - Upload: Generates ADIF from selected (or all) QSOs for TQSL signing
 *   - Download: Fetches LoTW confirmations and matches to local log
 *   - Status indicator showing last sync time and confirmation counts
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useQSOStore } from "@/stores/qsoStore";
import { useLotwSync } from "@/hooks/useLotwSync";
import { isUnlocked } from "@/lib/db/credentialStore";

// ── Main Component ──────────────────────────────────────────────────────────

export function LotwSyncButton() {
  const entries = useQSOStore((s) => s.entries);
  const selectedIds = useQSOStore((s) => s.selectedIds);
  const loadEntries = useQSOStore((s) => s.loadEntries);

  const {
    upload,
    download,
    uploading,
    downloading,
    lastSync,
    error,
    lastDownloadResult,
  } = useLotwSync();

  const [menuOpen, setMenuOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  // Clear status message after 5 seconds
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const handleUpload = useCallback(() => {
    const selectedEntries =
      selectedIds.size > 0
        ? entries.filter((e) => selectedIds.has(e.id))
        : entries;

    if (selectedEntries.length === 0) {
      setStatusMessage("No QSOs to export");
      setMenuOpen(false);
      return;
    }

    const result = upload(selectedEntries);
    setStatusMessage(result.message);
    setMenuOpen(false);
  }, [entries, selectedIds, upload]);

  const handleDownload = useCallback(async () => {
    if (!isUnlocked()) {
      setStatusMessage(
        "Credential store is locked. Unlock it in Settings first.",
      );
      setMenuOpen(false);
      return;
    }

    setMenuOpen(false);

    // Use last sync date as `since` to avoid re-downloading everything
    const since = lastSync ? lastSync.slice(0, 10) : undefined;
    const result = await download(since);

    setStatusMessage(result.message);

    // Refresh log entries if any were updated
    if (result.matchedCount > 0) {
      await loadEntries();
    }
  }, [lastSync, download, loadEntries]);

  const isProcessing = uploading || downloading;

  // Format last sync time
  const lastSyncLabel = lastSync
    ? formatRelativeTime(lastSync)
    : "Never synced";

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        disabled={isProcessing}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors border ${
          isProcessing
            ? "bg-plasma-orange/10 text-plasma-orange border-plasma-orange/30 animate-pulse"
            : "bg-white/5 hover:bg-white/10 text-gray-300 border-white/10"
        }`}
        aria-label="LoTW sync options"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        {/* LoTW icon (shield with checkmark) */}
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
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          />
        </svg>
        <span className="hidden sm:inline">LoTW</span>
        {downloading && (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
      </button>

      {/* Dropdown Menu */}
      {menuOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-72 bg-deep-space/95 backdrop-blur-md border border-white/15 rounded-xl shadow-2xl z-[500] overflow-hidden"
          role="menu"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">
                LoTW Sync
              </span>
              <span className="text-[10px] text-gray-500 font-mono">
                {lastSyncLabel}
              </span>
            </div>
            {lastDownloadResult && lastDownloadResult.matchedCount > 0 && (
              <p className="text-[11px] text-signal-green mt-1">
                Last sync: {lastDownloadResult.matchedCount} QSO
                {lastDownloadResult.matchedCount !== 1 ? "s" : ""} confirmed
              </p>
            )}
          </div>

          {/* Upload Action */}
          <button
            type="button"
            role="menuitem"
            onClick={handleUpload}
            disabled={isProcessing || entries.length === 0}
            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg
              className="w-5 h-5 mt-0.5 text-plasma-orange shrink-0"
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
            <div>
              <p className="text-sm text-white font-medium">Export for TQSL</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {selectedIds.size > 0
                  ? `Generate ADIF for ${selectedIds.size} selected QSO${selectedIds.size !== 1 ? "s" : ""}`
                  : `Generate ADIF for all ${entries.length} QSO${entries.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </button>

          {/* Download Action */}
          <button
            type="button"
            role="menuitem"
            onClick={handleDownload}
            disabled={isProcessing}
            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors border-t border-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg
              className="w-5 h-5 mt-0.5 text-signal-green shrink-0"
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
            <div>
              <p className="text-sm text-white font-medium">
                Download Confirmations
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Fetch QSL confirmations and update local log
              </p>
            </div>
          </button>

          {/* Status / Error */}
          {(statusMessage || error) && (
            <div
              className={`px-4 py-2.5 border-t text-[11px] ${
                error
                  ? "border-alert-red/20 text-alert-red bg-alert-red/5"
                  : "border-white/10 text-gray-400"
              }`}
            >
              {error || statusMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffMs = now - then;

  if (isNaN(then)) return "Unknown";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  // Fall back to date string
  return new Date(isoStr).toLocaleDateString();
}

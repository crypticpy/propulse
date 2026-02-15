/**
 * QSOSyncStatusIndicator — Compact sync status pill for the Logbook toolbar.
 *
 * Shows in the Logbook page toolbar (NOT in Header).
 * States:
 * - Syncing: spinner + "Syncing..."
 * - Pending: orange pill with count badge
 * - Error: red pill with retry button
 * - Offline: gray pill with "Offline" text and queued count
 * - Idle: green dot with last sync time
 *
 * Click expands an inline details popover (NOT a flyout panel).
 */

import { useState, useRef, useEffect } from "react";
import { useSyncEngine } from "@/hooks/useSyncEngine";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function QSOSyncStatusIndicator(): JSX.Element {
  const {
    syncing,
    pendingCount,
    lastSyncAt,
    error,
    deviceId,
    online,
    syncNow,
  } = useSyncEngine();
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [retrying, setRetrying] = useState(false);

  // Close on outside click
  useEffect(() => {
    if (!expanded) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        triggerRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setExpanded(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expanded]);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [expanded]);

  // Determine visual state
  const isOffline = !online;
  const hasError = !!error;
  const hasPending = pendingCount > 0;

  // Pill styling
  let pillColor: string;
  let dotColor: string;
  let statusText: string;

  if (syncing) {
    pillColor = "bg-nebula-blue/20 text-nebula-blue border-nebula-blue/30";
    dotColor = "bg-nebula-blue";
    statusText = "Syncing";
  } else if (hasError) {
    pillColor = "bg-alert-red/20 text-alert-red border-alert-red/30";
    dotColor = "bg-alert-red";
    statusText = "Error";
  } else if (isOffline) {
    pillColor = "bg-gray-500/20 text-gray-400 border-gray-500/30";
    dotColor = "bg-gray-500";
    statusText = hasPending ? `Offline (${pendingCount})` : "Offline";
  } else if (hasPending) {
    pillColor =
      "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30";
    dotColor = "bg-plasma-orange";
    statusText = `${pendingCount} pending`;
  } else {
    pillColor = "bg-signal-green/20 text-signal-green border-signal-green/30";
    dotColor = "bg-signal-green";
    statusText = lastSyncAt ? formatTimeAgo(lastSyncAt) : "Synced";
  }

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await syncNow();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="relative inline-flex">
      {/* Trigger pill */}
      <button
        ref={triggerRef}
        onClick={() => setExpanded((prev) => !prev)}
        className={`
          inline-flex items-center gap-1.5 px-2 py-1 rounded-full border
          text-xs font-medium transition-colors cursor-pointer
          hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-white/20
          ${pillColor}
        `}
        aria-label={`QSO sync status: ${statusText}`}
        aria-expanded={expanded}
        type="button"
      >
        {/* Status dot / spinner */}
        {syncing ? (
          <svg
            className="w-3 h-3 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${hasError ? "animate-pulse" : ""}`}
            aria-hidden="true"
          />
        )}
        <span>{statusText}</span>
      </button>

      {/* Expanded details popover */}
      {expanded && (
        <div
          ref={panelRef}
          className="absolute top-full right-0 mt-1 z-50 w-[260px]
                     bg-void-black/95 backdrop-blur-md
                     border border-white/10 rounded-xl shadow-2xl"
          role="dialog"
          aria-label="QSO sync details"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-white/10">
            <span className="text-xs font-semibold text-gray-200">
              QSO Sync
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="p-0.5 rounded hover:bg-white/10 transition-colors text-gray-500 hover:text-gray-300"
              aria-label="Close sync details"
              type="button"
            >
              <svg
                className="w-3.5 h-3.5"
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

          {/* Details body */}
          <div className="px-3 py-2 space-y-2">
            {/* Status row */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                Status
              </span>
              <span className="text-xs text-gray-300">
                {syncing
                  ? "Syncing..."
                  : hasError
                    ? "Error"
                    : isOffline
                      ? "Offline"
                      : "Connected"}
              </span>
            </div>

            {/* Pending row */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                Pending
              </span>
              <span className="text-xs text-gray-300">
                {pendingCount} {pendingCount === 1 ? "entry" : "entries"}
              </span>
            </div>

            {/* Last sync row */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                Last Sync
              </span>
              <span className="text-xs text-gray-300">
                {lastSyncAt ? formatTimeAgo(lastSyncAt) : "Never"}
              </span>
            </div>

            {/* Device ID row */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                Device
              </span>
              <span
                className="text-xs text-gray-400 font-mono truncate max-w-[120px]"
                title={deviceId}
              >
                {deviceId.slice(0, 8)}
              </span>
            </div>

            {/* Error message */}
            {hasError && (
              <div className="mt-1 p-2 rounded bg-alert-red/10 border border-alert-red/20">
                <p className="text-[10px] text-alert-red/90 break-words">
                  {error}
                </p>
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="px-3 py-2 border-t border-white/10 flex items-center justify-between">
            <span className="text-[10px] text-gray-600">
              {isOffline ? "Will sync when online" : "Auto-syncs every 30s"}
            </span>
            {(hasError || hasPending) && online && (
              <button
                onClick={() => void handleRetry()}
                disabled={retrying || syncing}
                className="text-[10px] px-2 py-0.5 rounded font-medium transition-colors
                           bg-plasma-orange/20 text-plasma-orange hover:bg-plasma-orange/30
                           disabled:opacity-50 disabled:cursor-not-allowed"
                type="button"
              >
                {retrying ? "Syncing..." : "Sync Now"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default QSOSyncStatusIndicator;

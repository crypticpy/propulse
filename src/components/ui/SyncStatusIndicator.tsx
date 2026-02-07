/**
 * SyncStatusIndicator - Compact sync queue status indicator
 *
 * Shows a small pill/badge reflecting the sync queue state with an expandable
 * dropdown panel listing individual queue items with retry/dismiss actions.
 *
 * Hidden when queue is empty.
 * Orange when items are pending, red when items have failed.
 *
 * Pattern mirrors HealthStatusIndicator.tsx.
 */

import { useState, useRef, useEffect } from "react";
import { useSyncQueueStore } from "@/stores/syncQueueStore";
import type { QueueItem } from "@/stores/syncQueueStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusDotClass(status: QueueItem["status"]): string {
  switch (status) {
    case "pending":
      return "bg-plasma-orange";
    case "retrying":
      return "bg-plasma-orange animate-pulse";
    case "failed":
      return "bg-alert-red";
  }
}

function statusLabel(status: QueueItem["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "retrying":
      return "Retrying...";
    case "failed":
      return "Failed";
  }
}

function serviceLabel(service: QueueItem["service"]): string {
  switch (service) {
    case "eqsl":
      return "eQSL";
    case "clublog":
      return "Club Log";
  }
}

function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SyncStatusIndicator(): JSX.Element | null {
  const items = useSyncQueueStore((s) => s.items);
  const removeItem = useSyncQueueStore((s) => s.removeItem);
  const retryAll = useSyncQueueStore((s) => s.retryAll);

  const pendingCount = items.filter(
    (i) => i.status === "pending" || i.status === "retrying",
  ).length;
  const failedCount = items.filter((i) => i.status === "failed").length;
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  // Hide when queue is empty
  const totalCount = pendingCount + failedCount;
  if (totalCount === 0) return null;

  const hasFailed = failedCount > 0;
  const pillColor = hasFailed
    ? "bg-alert-red/20 text-alert-red border-alert-red/30"
    : "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/30";
  const pillDotColor = hasFailed ? "bg-alert-red" : "bg-plasma-orange";

  return (
    <div className="relative inline-flex">
      {/* Collapsed trigger pill */}
      <button
        ref={triggerRef}
        onClick={() => setExpanded((prev) => !prev)}
        className={`
          inline-flex items-center gap-1.5 px-2 py-1 rounded-full border
          text-xs font-medium transition-colors cursor-pointer
          hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-white/20
          ${pillColor}
        `}
        aria-label={`Sync queue: ${totalCount} item${totalCount !== 1 ? "s" : ""}`}
        aria-expanded={expanded}
        type="button"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${pillDotColor} ${hasFailed ? "animate-pulse" : ""}`}
          aria-hidden="true"
        />
        <span>{totalCount}</span>
        {/* Sync icon */}
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>

      {/* Expanded dropdown */}
      {expanded && (
        <div
          ref={panelRef}
          className="absolute top-full right-0 mt-1 z-50 w-[300px]
                     bg-void-black/95 backdrop-blur-md
                     border border-white/10 rounded-xl shadow-2xl
                     animate-in fade-in slide-in-from-top-1"
          role="dialog"
          aria-label="Sync queue details"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-white/10">
            <span className="text-xs font-semibold text-gray-200">
              Sync Queue
            </span>
            <div className="flex items-center gap-2">
              {hasFailed && (
                <button
                  onClick={() => {
                    retryAll();
                  }}
                  className="text-[10px] px-2 py-0.5 rounded bg-plasma-orange/20 text-plasma-orange
                             hover:bg-plasma-orange/30 transition-colors font-medium"
                  type="button"
                >
                  Retry All
                </button>
              )}
              <button
                onClick={() => setExpanded(false)}
                className="p-0.5 rounded hover:bg-white/10 transition-colors text-gray-500 hover:text-gray-300"
                aria-label="Close sync panel"
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
          </div>

          {/* Queue items list */}
          <div className="px-3 py-2 space-y-2 max-h-[240px] overflow-y-auto scrollbar-thin">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-b-0"
              >
                {/* Status dot */}
                <span
                  className={`w-2 h-2 rounded-full shrink-0 mt-1 ${statusDotClass(item.status)}`}
                  aria-hidden="true"
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-gray-200">
                      {serviceLabel(item.service)}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {item.entryIds.length} QSO
                      {item.entryIds.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-gray-500">
                      {statusLabel(item.status)}
                    </span>
                    {item.retryCount > 0 && (
                      <span className="text-[10px] text-gray-600">
                        ({item.retryCount}/{item.maxRetries})
                      </span>
                    )}
                    <span className="text-[10px] text-gray-600">
                      {formatTimeAgo(item.createdAt)}
                    </span>
                  </div>
                  {item.lastError && (
                    <p className="text-[10px] text-alert-red/80 mt-0.5 truncate">
                      {item.lastError}
                    </p>
                  )}
                </div>

                {/* Dismiss button */}
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-0.5 rounded hover:bg-white/10 transition-colors text-gray-600 hover:text-gray-400 shrink-0"
                  aria-label={`Dismiss ${serviceLabel(item.service)} upload`}
                  title="Dismiss"
                  type="button"
                >
                  <svg
                    className="w-3 h-3"
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
            ))}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-white/10 flex items-center justify-between">
            <span className="text-[10px] text-gray-600">
              Auto-retries every 10s
            </span>
            {items.length > 0 && (
              <button
                onClick={() => {
                  const store = useSyncQueueStore.getState();
                  store.clearFailed();
                }}
                className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                type="button"
              >
                Clear failed
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SyncStatusIndicator;

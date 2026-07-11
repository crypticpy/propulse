/**
 * OfflineIndicator Component
 * Displays a small indicator when the app is offline
 * Shows tooltip with last sync time on hover
 */

import { useState } from "react";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";

interface OfflineIndicatorProps {
  /** Optional: Last sync/update time to display in tooltip */
  lastSyncTime?: Date | null;
  /** Optional: Show even when online (for debugging) */
  forceShow?: boolean;
}

/**
 * Format a date for display in tooltip
 */
function formatLastSync(date: Date | null): string {
  if (!date) return "Never";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OfflineIndicator({
  lastSyncTime,
  forceShow = false,
}: OfflineIndicatorProps) {
  const { isOffline, lastOnline, connectionType, effectiveType } =
    useOfflineStatus();
  const [showTooltip, setShowTooltip] = useState(false);

  // Don't render if online (unless forceShow is true)
  if (!isOffline && !forceShow) {
    return null;
  }

  // Determine connection quality text
  const getConnectionQuality = (): string => {
    if (effectiveType === "4g") return "Good";
    if (effectiveType === "3g") return "Moderate";
    if (effectiveType === "2g" || effectiveType === "slow-2g") return "Poor";
    return connectionType || "Unknown";
  };

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Offline Badge */}
      <div
        className="
          flex items-center gap-1.5 px-2 py-1 rounded-md
          bg-amber-500/20 border border-amber-500/30
          text-amber-400 text-xs font-medium
          transition-opacity duration-200
        "
        role="status"
        aria-live="polite"
      >
        {/* Offline icon */}
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
          />
        </svg>
        <span>Offline</span>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="
            absolute top-full right-0 mt-2 z-50
            w-56 p-3 rounded-lg
            bg-gray-900 border border-gray-700
            shadow-lg shadow-black/50
            text-sm
          "
        >
          {/* Arrow */}
          <div
            className="
              absolute -top-1 right-4
              w-2 h-2 rotate-45
              bg-gray-900 border-l border-t border-gray-700
            "
          />

          {/* Content */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-medium">
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
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>Using cached data</span>
            </div>

            <div className="text-gray-400 text-xs space-y-1">
              <div className="flex justify-between">
                <span>Last sync:</span>
                <span className="text-gray-300">
                  {formatLastSync(lastSyncTime || lastOnline)}
                </span>
              </div>

              {connectionType && (
                <div className="flex justify-between">
                  <span>Connection:</span>
                  <span className="text-gray-300">
                    {getConnectionQuality()}
                  </span>
                </div>
              )}
            </div>

            <p className="text-gray-500 text-xs pt-1 border-t border-gray-700">
              Data will refresh automatically when connection is restored.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Stale Data Indicator
 * Shows when data is being displayed from cache and may be outdated
 */
interface StaleIndicatorProps {
  /** Whether the data is stale */
  isStale: boolean;
  /** Last update time */
  lastUpdated?: Date | null;
}

export function StaleIndicator({ isStale, lastUpdated }: StaleIndicatorProps) {
  if (!isStale) return null;

  return (
    <span
      className="text-gray-500 text-xs ml-2"
      title={lastUpdated ? `Last updated: ${lastUpdated.toLocaleString()}` : ""}
    >
      (cached)
    </span>
  );
}

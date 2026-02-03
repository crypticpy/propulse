/**
 * WatchIndicator Component
 *
 * A small badge/pill that shows the count of active watches with new activity.
 * Features a pulsing animation when new activity is detected.
 * Click to open the WatchListPanel.
 */

import { useMemo } from "react";
import { useWatchStore, selectActiveWatchCount } from "@/stores/watchStore";

export interface WatchIndicatorProps {
  /** Callback when the indicator is clicked */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * WatchIndicator Component
 *
 * Displays a badge showing the count of watches with active matches.
 * Pulses when there is activity to draw attention.
 *
 * @example
 * ```tsx
 * <WatchIndicator onClick={() => setShowWatchList(true)} />
 * ```
 */
export function WatchIndicator({
  onClick,
  className = "",
}: WatchIndicatorProps) {
  const activeCount = useWatchStore(selectActiveWatchCount);
  const watches = useWatchStore((state) => state.watches);
  const totalWatches = watches.length;

  // Determine if we should show the indicator
  const shouldShow = totalWatches > 0;

  // Memoize whether there's activity for animation
  const hasActivity = useMemo(() => activeCount > 0, [activeCount]);

  if (!shouldShow) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5
        px-2.5 py-1.5
        text-xs font-medium
        rounded-full
        transition-all duration-200
        ${
          hasActivity
            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
            : "bg-gray-700/50 text-gray-300 border border-gray-600/50 hover:bg-gray-700/70"
        }
        ${hasActivity ? "animate-pulse-subtle" : ""}
        ${className}
      `}
      title={
        hasActivity
          ? `${activeCount} watch${activeCount !== 1 ? "es" : ""} with activity`
          : `${totalWatches} watch${totalWatches !== 1 ? "es" : ""} active`
      }
      aria-label={
        hasActivity
          ? `${activeCount} watches with activity. Click to view watch list.`
          : `${totalWatches} watches. Click to view watch list.`
      }
    >
      {/* Bell icon */}
      <span
        className={`
          text-sm
          ${hasActivity ? "animate-ring" : ""}
        `}
        aria-hidden="true"
      >
        {hasActivity ? "\uD83D\uDD14" : "\uD83D\uDD15"}
      </span>

      {/* Count badge */}
      <span className="tabular-nums">
        {hasActivity ? activeCount : totalWatches}
      </span>

      {/* Activity dot indicator */}
      {hasActivity && (
        <span
          className="
            w-1.5 h-1.5
            rounded-full
            bg-amber-400
            animate-ping-slow
          "
          aria-hidden="true"
        />
      )}

      {/* Inline styles for custom animations */}
      <style>{`
        @keyframes pulse-subtle {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.85;
          }
        }

        @keyframes ring {
          0%, 100% {
            transform: rotate(0deg);
          }
          10%, 30% {
            transform: rotate(10deg);
          }
          20%, 40% {
            transform: rotate(-10deg);
          }
          50% {
            transform: rotate(0deg);
          }
        }

        @keyframes ping-slow {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        .animate-pulse-subtle {
          animation: pulse-subtle 2s ease-in-out infinite;
        }

        .animate-ring {
          animation: ring 1s ease-in-out;
          animation-iteration-count: 3;
        }

        .animate-ping-slow {
          animation: ping-slow 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
    </button>
  );
}

WatchIndicator.displayName = "WatchIndicator";

export default WatchIndicator;

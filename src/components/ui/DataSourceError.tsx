/**
 * DataSourceError & StaleDataBanner Components
 *
 * Reusable panel-level error and stale-data indicators for the dashboard.
 * Renders severity-aware containers with inline SVG icons, auto-retry
 * countdowns, and staleness warnings. Matches the dark glassmorphism
 * aesthetic used throughout Propulse.
 */

import { useState, useEffect } from "react";
import type {
  ClassifiedError,
  StalenessLevel,
} from "@/lib/errors/classifyError";

// ---------------------------------------------------------------------------
// StaleDataBanner
// ---------------------------------------------------------------------------

export interface StaleDataBannerProps {
  message: string;
  level: StalenessLevel;
}

export function StaleDataBanner({ message, level }: StaleDataBannerProps) {
  if (level === "fresh") return null;

  const containerClass =
    level === "very-stale"
      ? "bg-caution-amber/10 border border-caution-amber/20"
      : "bg-caution-amber/5 border border-caution-amber/10";

  return (
    <div className={`rounded-lg px-3 py-2 mt-2 ${containerClass}`}>
      <div className="flex items-center gap-2">
        {/* Clock icon */}
        <svg
          className="w-4 h-4 text-caution-amber flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-xs text-caution-amber">{message}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataSourceError
// ---------------------------------------------------------------------------

export interface DataSourceErrorProps {
  error: ClassifiedError | null;
  staleness?: StalenessLevel;
  stalenessMessage?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  compact?: boolean;
}

export function DataSourceError({
  error,
  staleness,
  stalenessMessage,
  onRetry,
  isRetrying = false,
  compact = false,
}: DataSourceErrorProps) {
  // Auto-retry countdown state
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!error?.suggestedRetryMs) {
      setCountdown(null);
      return;
    }
    setCountdown(Math.ceil(error.suggestedRetryMs / 1000));

    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(id);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [error?.suggestedRetryMs, error?.timestamp]);

  // Nothing to show
  if (!error && (!staleness || staleness === "fresh")) return null;

  // No hard error but data is stale — delegate to StaleDataBanner
  if (!error && staleness && staleness !== "fresh" && stalenessMessage) {
    return <StaleDataBanner message={stalenessMessage} level={staleness} />;
  }

  if (!error) return null;

  // Severity-based styling
  const isWarning =
    error.category === "data-gap" || error.category === "timeout";
  const containerClass = isWarning
    ? "bg-caution-amber/5 border border-caution-amber/20"
    : "bg-alert-red/5 border border-alert-red/20";
  const iconColor = isWarning ? "text-caution-amber" : "text-alert-red";

  return (
    <div role="alert" className={`rounded-xl p-3 ${containerClass}`}>
      {/* Top row: icon + shortMessage + retry button */}
      <div className="flex items-center gap-2">
        {/* Warning triangle icon */}
        <svg
          className={`w-4 h-4 ${iconColor} flex-shrink-0`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <span className="text-sm font-bold text-gray-200 flex-1">
          {error.shortMessage}
        </span>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="px-2 py-1 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-colors disabled:opacity-50 flex items-center gap-1"
            aria-label="Retry"
          >
            {isRetrying ? (
              <svg
                className="w-3 h-3 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            )}
            <span>Retry</span>
          </button>
        )}
      </div>

      {/* Body: userMessage (hidden in compact mode) */}
      {!compact && (
        <p className="text-xs text-gray-400 leading-relaxed mt-1.5 ml-6">
          {error.userMessage}
        </p>
      )}

      {/* Bottom row: upstream badge + auto-retry countdown */}
      {!compact && (error.isUpstream || countdown !== null) && (
        <div className="flex items-center justify-between mt-2 ml-6">
          {error.isUpstream ? (
            <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
              upstream issue
            </span>
          ) : (
            <span />
          )}
          {countdown !== null && (
            <span className="text-[10px] text-gray-500">
              Auto-retry in {countdown}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}

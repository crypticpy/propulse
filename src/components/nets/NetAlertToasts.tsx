/**
 * NetAlertToasts -- Renders pending net session alerts as small toast cards.
 *
 * Fixed-position bottom-right stack. Shows up to 3 alerts at a time.
 * Each toast displays the net name, "Starting in X minutes", and a dismiss button.
 * Auto-dismisses after 15 seconds.
 */

import { useEffect, useRef, useCallback } from "react";
import { useNetAlerts } from "@/hooks/useNetAlerts";
import type { NetAlert } from "@/hooks/useNetAlerts";

/** Maximum number of toasts visible at once */
const MAX_VISIBLE = 3;

/** Auto-dismiss delay in milliseconds */
const AUTO_DISMISS_MS = 15_000;

function AlertToast({
  alert,
  onDismiss,
}: {
  alert: NetAlert;
  onDismiss: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-void-black/95 backdrop-blur-md border border-plasma-orange/30 rounded-xl shadow-lg max-w-xs animate-fade-in">
      {/* Radio icon */}
      <div className="shrink-0 mt-0.5">
        <svg
          className="w-4 h-4 text-plasma-orange"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 12h.01"
          />
        </svg>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">
          {alert.netName}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Starting in {alert.minutesBefore} min on{" "}
          <span className="font-mono text-gray-300">{alert.frequency}</span>
        </p>
      </div>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="shrink-0 p-1 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label={`Dismiss alert for ${alert.netName}`}
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
  );
}

export function NetAlertToasts() {
  const { pendingAlerts, dismissAlert } = useNetAlerts();

  const handleDismiss = useCallback(
    (netId: string, minutesBefore: number) => {
      dismissAlert(netId, minutesBefore);
    },
    [dismissAlert],
  );

  // Only render the most recent MAX_VISIBLE alerts
  const visible = pendingAlerts.slice(-MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[500] flex flex-col gap-2">
      {visible.map((alert) => (
        <AlertToast
          key={`${alert.netId}-${alert.minutesBefore}`}
          alert={alert}
          onDismiss={() => handleDismiss(alert.netId, alert.minutesBefore)}
        />
      ))}
    </div>
  );
}

/**
 * AlertsSummary Component
 *
 * A compact horizontal alerts strip showing active solar alert counts.
 * Uses store selectors directly for lightweight rendering.
 */

import { Link } from "react-router-dom";
import {
  useAlertsStore,
  selectActiveAlertCount,
  selectCriticalAlertCount,
  selectHasActiveAlerts,
} from "@/stores/alertsStore";

export interface AlertsSummaryProps {
  className?: string;
}

export function AlertsSummary({ className = "" }: AlertsSummaryProps) {
  const hasAlerts = useAlertsStore(selectHasActiveAlerts);
  const activeCount = useAlertsStore(selectActiveAlertCount);
  const criticalCount = useAlertsStore(selectCriticalAlertCount);
  const warningCount = Math.max(0, activeCount - criticalCount);

  if (!hasAlerts) {
    return (
      <div
        role="status"
        aria-label="Solar alert status: all quiet"
        className={`animate-card-entrance flex items-center gap-3 px-4 py-3 rounded-2xl bg-signal-green/10 border border-signal-green/30 ${className}`}
      >
        <span className="w-2 h-2 rounded-full bg-signal-green" />
        <span className="text-sm text-signal-green">
          All Quiet &mdash; No active solar alerts
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={`${activeCount} active solar alert${activeCount !== 1 ? "s" : ""}`}
      className={`animate-card-entrance flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-caution-amber/10 border border-caution-amber/30 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-caution-amber animate-pulse" />
        <div className="flex items-center gap-2 text-sm">
          {criticalCount > 0 && (
            <span className="font-mono font-medium text-alert-red">
              {criticalCount} Critical
            </span>
          )}
          {criticalCount > 0 && warningCount > 0 && (
            <span className="text-gray-500">/</span>
          )}
          {warningCount > 0 && (
            <span className="font-mono font-medium text-caution-amber">
              {warningCount} Warning
            </span>
          )}
        </div>
      </div>

      <Link
        to="/solar"
        aria-label="View solar alert details"
        className="text-xs text-caution-amber hover:text-white transition-colors whitespace-nowrap"
      >
        View Details &rarr;
      </Link>
    </div>
  );
}

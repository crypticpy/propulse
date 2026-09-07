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
        className={`animate-card-entrance flex items-center gap-3 px-4 py-3 rounded-2xl bg-su-success/10 border border-su-success/30 ${className}`}
      >
        <span className="w-2 h-2 rounded-full bg-su-success" />
        <span className="text-sm text-su-success">
          All Quiet &mdash; No active solar alerts
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={`${activeCount} active solar alert${activeCount !== 1 ? "s" : ""}`}
      className={`animate-card-entrance flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-su-warning/10 border border-su-warning/30 ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-su-warning animate-pulse" />
        <div className="flex items-center gap-2 text-sm">
          {criticalCount > 0 && (
            <span className="font-mono font-medium text-su-danger">
              {criticalCount} Critical
            </span>
          )}
          {criticalCount > 0 && warningCount > 0 && (
            <span className="text-su-muted/80">/</span>
          )}
          {warningCount > 0 && (
            <span className="font-mono font-medium text-su-warning">
              {warningCount} Warning
            </span>
          )}
        </div>
      </div>

      <Link
        to="/solar"
        aria-label="View solar alert details"
        className="text-sm text-su-warning hover:text-su-text transition-colors whitespace-nowrap"
      >
        View Details &rarr;
      </Link>
    </div>
  );
}

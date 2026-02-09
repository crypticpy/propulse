/**
 * AlertStrip Component (QoL5)
 *
 * Compact, dismissible banner that displays active solar weather alerts.
 * Reads from alertsStore and supports quiet hours suppression.
 */

import { useMemo } from "react";
import { useAlertsStore, selectActiveAlertCount } from "@/stores/alertsStore";
import type { SolarAlert, AlertPriority } from "@/types/alerts";
import { useUserStore } from "@/stores/userStore";
import { isQuietHours } from "@/lib/utils/time";

// ---------------------------------------------------------------------------
// Priority config
// ---------------------------------------------------------------------------

const PRIORITY_STYLES: Record<
  AlertPriority,
  { bg: string; border: string; text: string; icon: string }
> = {
  CRITICAL: {
    bg: "bg-alert-red/15",
    border: "border-alert-red/40",
    text: "text-alert-red",
    icon: "M12 9v2m0 4h.01",
  },
  WARNING: {
    bg: "bg-caution-amber/15",
    border: "border-caution-amber/40",
    text: "text-caution-amber",
    icon: "M12 9v2m0 4h.01",
  },
  INFO: {
    bg: "bg-cosmic-cyan/15",
    border: "border-cosmic-cyan/40",
    text: "text-cosmic-cyan",
    icon: "M13 16h-1v-4h-1m1-4h.01",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AlertItem({
  alert,
  onDismiss,
}: {
  alert: SolarAlert;
  onDismiss: (id: string) => void;
}) {
  const style = PRIORITY_STYLES[alert.priority];

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${style.bg} ${style.border}`}
    >
      <svg
        className={`w-4 h-4 flex-shrink-0 ${style.text}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={style.icon}
        />
      </svg>
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-bold ${style.text}`}>{alert.title}</span>
        {alert.affectedBands.length > 0 && (
          <span className="ml-2 text-[10px] text-gray-400">
            Bands: {alert.affectedBands.join(", ")}
          </span>
        )}
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        className="p-0.5 text-gray-500 hover:text-white transition-colors flex-shrink-0"
        title="Dismiss alert"
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
  );
}

export function AlertStrip() {
  const alerts = useAlertsStore((s) => s.alerts);
  const activeCount = useAlertsStore(selectActiveAlertCount);
  const dismissAlert = useAlertsStore((s) => s.dismissAlert);
  const quietStart = useUserStore(
    (s) => s.preferences?.notifications?.quietHoursStart,
  );
  const quietEnd = useUserStore(
    (s) => s.preferences?.notifications?.quietHoursEnd,
  );

  const quiet = isQuietHours(quietStart, quietEnd);

  const visibleAlerts = useMemo(
    () =>
      alerts
        .filter((a) => a.status === "ACTIVE")
        .sort((a, b) => {
          const order: AlertPriority[] = ["CRITICAL", "WARNING", "INFO"];
          return order.indexOf(a.priority) - order.indexOf(b.priority);
        }),
    [alerts],
  );

  if (activeCount === 0 || quiet) return null;

  return (
    <div className="space-y-1">
      {visibleAlerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} onDismiss={dismissAlert} />
      ))}
    </div>
  );
}

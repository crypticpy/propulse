/**
 * SkywarnBadge -- Shows SKYWARN spotter activation status
 */

import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import {
  deriveSkywarnStatus,
  type SkywarnStatus,
} from "@/lib/atmos/skywarnStatus";

function statusConfig(status: SkywarnStatus) {
  switch (status) {
    case "activated":
      return {
        label: "SKYWARN ACTIVE",
        color: "bg-alert-red text-white",
        pulse: true,
      };
    case "possible":
      return {
        label: "SKYWARN Possible",
        color: "bg-caution-amber/20 text-caution-amber",
        pulse: false,
      };
    case "inactive":
      return {
        label: "SKYWARN Inactive",
        color: "bg-white/5 text-gray-600",
        pulse: false,
      };
  }
}

export function SkywarnBadge() {
  const { alerts } = useWeatherAlerts(true);
  const { status, activatingAlerts } = deriveSkywarnStatus(alerts);

  if (status === "inactive") return null; // Only show when relevant

  const config = statusConfig(status);

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-mono ${config.color}`}
    >
      {config.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-alert-red opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-alert-red" />
        </span>
      )}
      <span>{config.label}</span>
      {activatingAlerts.length > 0 && (
        <span className="text-[9px] opacity-70 truncate max-w-[120px]">
          ({activatingAlerts[0]})
        </span>
      )}
    </div>
  );
}

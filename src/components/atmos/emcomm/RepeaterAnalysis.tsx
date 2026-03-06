/**
 * RepeaterAnalysis — Sidebar card showing repeaters located inside
 * active weather alert polygons.
 *
 * Uses ray-casting point-in-polygon analysis to identify repeaters
 * that fall within Extreme/Severe alert zones (or pinned alerts).
 */

import { useMemo, useState } from "react";
import { useRepeaters } from "@/hooks/useRepeaters";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import { useEmcommStore } from "@/stores/emcommStore";
import {
  getRepeatersInsideAlerts,
  type RepeaterAlertMatch,
} from "@/lib/atmos/polygonAnalysis";

const SEVERITY_COLORS: Record<string, string> = {
  Extreme: "bg-alert-red text-white",
  Severe: "bg-caution-amber text-void-black",
  Moderate: "bg-yellow-600 text-void-black",
  Minor: "bg-nebula-blue text-white",
  Unknown: "bg-gray-600 text-white",
};

function SeverityBadge({ severity }: { severity: string }) {
  const cls = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.Unknown;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${cls}`}
    >
      {severity}
    </span>
  );
}

function AlertMatchSection({ match }: { match: RepeaterAlertMatch }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-700/50 rounded p-2 space-y-1.5">
      {/* Alert header */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <SeverityBadge severity={match.alertSeverity} />
        <span className="text-[10px] text-gray-300 truncate flex-1">
          {match.alertEvent}
        </span>
      </div>

      {/* Repeater count */}
      <div className="text-[10px] text-gray-400">
        {match.repeaters.length === 0 ? (
          <span className="text-gray-600">No repeaters in zone</span>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 hover:text-gray-200 transition-colors"
          >
            <span
              className="inline-block transition-transform duration-150"
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              &#9656;
            </span>
            <span className="font-mono text-plasma-orange">
              {match.repeaters.length}
            </span>{" "}
            repeater{match.repeaters.length !== 1 ? "s" : ""} in zone
          </button>
        )}
      </div>

      {/* Expanded repeater list */}
      {expanded && match.repeaters.length > 0 && (
        <div className="space-y-1 pl-2 border-l border-gray-700/50">
          {match.repeaters.map((r) => (
            <div
              key={`${r.callsign}-${r.frequency}`}
              className="flex items-baseline gap-2 text-[10px]"
            >
              <span className="font-mono font-bold text-gray-200 shrink-0">
                {r.callsign}
              </span>
              <span className="font-mono text-plasma-orange shrink-0">
                {r.frequency.toFixed(4)}
              </span>
              <span className="text-gray-500 shrink-0">{r.mode}</span>
              {r.tone && (
                <span className="text-gray-600 shrink-0">{r.tone} Hz</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RepeaterAnalysis() {
  const { repeaters } = useRepeaters();
  const { alerts } = useWeatherAlerts();
  const pinnedAlertIds = useEmcommStore(
    (s) => s.activeIncident?.pinnedAlertIds,
  );

  const matches = useMemo<RepeaterAlertMatch[]>(() => {
    if (repeaters.length === 0 || alerts.length === 0) return [];
    return getRepeatersInsideAlerts(repeaters, alerts, pinnedAlertIds);
  }, [repeaters, alerts, pinnedAlertIds]);

  if (matches.length === 0) {
    return (
      <div className="text-center py-2">
        <p className="text-[10px] text-gray-600">
          No repeaters in active alert zones
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {matches.map((match) => (
        <AlertMatchSection key={match.alertId} match={match} />
      ))}
    </div>
  );
}

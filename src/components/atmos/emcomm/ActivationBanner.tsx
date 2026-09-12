/**
 * ActivationBanner -- Slim horizontal banner displayed between the AtmosHeader
 * and the sidebar/map row when an EmComm activation is in progress.
 *
 * Shows activation level, incident name, and live elapsed time.
 */

import { useEmcommStore } from "@/stores/emcommStore";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import type { ActivationLevel } from "@/types/emcomm";

// ── Level-specific banner theming ──────────────────────────────────────────
const BANNER_STYLES: Record<ActivationLevel, { banner: string; pill: string }> =
  {
    monitoring: {
      banner: "bg-blue-500/20 border-b border-blue-500/30",
      pill: "bg-blue-500/30 text-blue-300",
    },
    standby: {
      banner: "bg-caution-amber/20 border-b border-caution-amber/30",
      pill: "text-su-text",
    },
    partial: {
      banner: "bg-plasma-orange/20 border-b border-plasma-orange/30",
      pill: "text-su-text",
    },
    full: {
      banner: "bg-alert-red/20 border-b border-alert-red/30",
      pill: "text-su-text",
    },
  };

export function ActivationBanner() {
  const activeIncident = useEmcommStore((s) => s.activeIncident);
  const elapsed = useElapsedTime(activeIncident?.startedAt);

  if (!activeIncident) return null;

  const style = BANNER_STYLES[activeIncident.level];

  return (
    <div className={`flex items-center h-8 px-3 shrink-0 ${style.banner}`}>
      {/* Left: level pill */}
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${style.pill}`}
      >
        {activeIncident.level}
      </span>

      {/* Center: incident name */}
      <span className="flex-1 text-center text-xs text-su-text/80 font-medium truncate mx-3">
        {activeIncident.name}
      </span>

      {/* Right: elapsed time */}
      <span className="text-[10px] font-mono text-su-muted tabular-nums shrink-0">
        {elapsed}
      </span>
    </div>
  );
}

import { useMemo } from "react";
import {
  formatDateRange,
  useDxpeditions,
  type DxpeditionEntry,
} from "@/hooks/useDxpeditions";
import { useUTCClock } from "@/hooks/useUTCClock";
import {
  dxpeditionWindow,
  getSchedulePhase,
  scheduleCountdown,
  type ScheduleWindow,
} from "@/lib/hamclock/schedule";

const NG3K_ADXO_URL = "https://ng3k.com/Misc/adxo.html";
const MAX_ROWS = 6;

interface ScheduledDxpedition {
  entry: DxpeditionEntry;
  window: ScheduleWindow;
}

/** Active and upcoming NG3K operations with wall-readable status/countdowns. */
export function HamClockDxpeditionsPanel() {
  const { entries, status, isLoading, error } = useDxpeditions();
  const now = useUTCClock();
  const scheduled = useMemo(
    () =>
      entries
        .map((entry): ScheduledDxpedition | null => {
          const window = dxpeditionWindow(entry);
          return window ? { entry, window } : null;
        })
        .filter((row): row is ScheduledDxpedition => row !== null),
    [entries],
  );
  const rows = useMemo(
    () =>
      scheduled
        .filter((row) => getSchedulePhase(row.window, now) !== "ended")
        .sort((a, b) => {
          const aActive = getSchedulePhase(a.window, now) === "active";
          const bActive = getSchedulePhase(b.window, now) === "active";
          if (aActive !== bActive) return aActive ? -1 : 1;
          return new Date(a.window.startUtc).getTime() - new Date(b.window.startUtc).getTime();
        })
        .slice(0, MAX_ROWS),
    [scheduled, now],
  );

  if (isLoading) {
    return <p className="font-mono text-[10px] text-white/35">Loading operations…</p>;
  }
  if (error != null || status !== "ok") {
    return <p className="font-mono text-[10px] text-white/35">DXpedition schedule unavailable</p>;
  }
  if (rows.length === 0) {
    return <p className="font-mono text-[10px] text-white/35">No announced operations</p>;
  }

  return (
    <div className="space-y-1.5">
      {rows.map(({ entry, window }) => {
        const active = getSchedulePhase(window, now) === "active";
        return (
          <div
            key={`${entry.callsign}:${entry.startDate}`}
            className="rounded border border-white/[0.07] bg-white/[0.025] px-2 py-1.5"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {active && (
                <span className="rounded border border-signal-green/35 bg-signal-green/10 px-1 font-mono text-[8px] font-bold text-signal-green">
                  NOW
                </span>
              )}
              <span className="shrink-0 font-mono text-[11px] font-bold text-nebula-blue">
                {entry.callsign}
              </span>
              <span className="truncate text-[10px] text-white/45">{entry.entity}</span>
            </span>
            <span className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[9px]">
              <span className={active ? "text-signal-green" : "text-plasma-orange"}>
                {scheduleCountdown(window, now)}
              </span>
              <span className="text-white/30">
                {formatDateRange(entry.startDate, entry.endDate)}
              </span>
            </span>
          </div>
        );
      })}
      <a
        href={NG3K_ADXO_URL}
        target="_blank"
        rel="noreferrer"
        className="block text-right font-mono text-[8px] uppercase tracking-wider text-white/25 hover:text-plasma-orange"
      >
        NG3K ADXO ↗
      </a>
    </div>
  );
}

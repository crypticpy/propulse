import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { useActiveLocation } from "@/hooks/useActiveLocation";
import { useUTCClock } from "@/hooks/useUTCClock";
import { readHamClockContacts } from "@/lib/hamclock/recentContacts";
import { getBandColor } from "@/lib/utils/spotColors";
import { useContestStore } from "@/stores/contestStore";
import { useWidgetConfig } from "@/stores/hamclockWidgetConfigStore";
import { HamClockTile } from "../HamClockTile";
import { recentContactsConfig } from "../config/recentContactsConfig";

const RecentContactsReport = lazy(() =>
  import("../reports/RecentContactsReport").then((module) => ({
    default: module.RecentContactsReport,
  })),
);

/** Log entries carry a UTC date and HH:MM, never a full timestamp. */
function loggedAt(date: string, timeOn: string): number {
  return Date.parse(`${date}T${timeOn.slice(0, 5)}:00Z`);
}

function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** The operator's own most recent QSOs — the contest session when one is
 * running, otherwise today's log. */
export function RecentContactsTile() {
  const [open, setOpen] = useState(false);
  const location = useActiveLocation();
  const contestId = useContestStore((s) => s.activeSession?.id ?? null);
  const now = useUTCClock(30_000);
  const today = now.toISOString().slice(0, 10);
  const { data, isPending, error } = useQuery({
    queryKey: ["hamclock-recent-contacts", contestId, today],
    queryFn: () => readHamClockContacts(contestId, today),
    refetchInterval: 15_000,
    staleTime: 10_000,
    // No station/home set (wall spec §7, HW-53): don't read the logbook at
    // all rather than showing an empty "no contacts" state that implies a
    // station is configured.
    enabled: Boolean(location),
  });
  const [{ rowCount }] = useWidgetConfig(
    "recentContacts",
    recentContactsConfig,
  );

  if (!location) {
    return (
      <HamClockTile title="Recent contacts">
        <p className="hc-placeholder">SET HOME IN SETTINGS</p>
      </HamClockTile>
    );
  }

  const entries = (data ?? []).slice(0, rowCount);
  const scope = contestId ? "SESSION" : "TODAY";

  return (
    <>
      <HamClockTile
        title="Recent contacts"
        source={`${data?.length ?? 0} · ${scope}`}
        onOpen={() => setOpen(true)}
        openLabel="Open recent contacts report"
      >
        {entries.length > 0 ? (
          <div className="hc-rows">
            {entries.map((entry) => {
              const at = loggedAt(entry.date, entry.timeOn);
              return (
                <div className="hc-row" key={entry.id}>
                  <span
                    className="hc-chip"
                    style={{ background: getBandColor(entry.band) }}
                  >
                    {entry.band || "—"}
                  </span>
                  <span className="hc-row-call">
                    {entry.callsign}
                    <small>
                      {entry.mode}
                      {entry.grid ? ` · ${entry.grid.toUpperCase()}` : ""}
                    </small>
                  </span>
                  <span className="hc-row-age">
                    {Number.isFinite(at)
                      ? formatAge(now.getTime() - at)
                      : entry.timeOn}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="hc-placeholder">
            {error
              ? "Could not read the logbook"
              : isPending
                ? "Reading the logbook…"
                : `No contacts logged ${contestId ? "this session" : "today"}`}
          </p>
        )}
      </HamClockTile>
      {open && (
        <Suspense fallback={null}>
          <RecentContactsReport open onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}

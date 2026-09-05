import { useQuery } from "@tanstack/react-query";
import { useUTCClock } from "@/hooks/useUTCClock";
import { readHamClockContacts } from "@/lib/hamclock/recentContacts";
import { getBandColor } from "@/lib/utils/spotColors";
import { useContestStore } from "@/stores/contestStore";
import { HamClockTile } from "../HamClockTile";

/** Four rows is what the tile can show without shrinking the callsign type. */
const MAX_ROWS = 4;

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
  const contestId = useContestStore((s) => s.activeSession?.id ?? null);
  const now = useUTCClock(30_000);
  const { data, isPending, error } = useQuery({
    queryKey: ["hamclock-recent-contacts", contestId],
    queryFn: () => readHamClockContacts(contestId),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const entries = (data ?? []).slice(0, MAX_ROWS);
  const scope = contestId ? "SESSION" : "TODAY";

  return (
    <HamClockTile
      title="Recent contacts"
      source={`${data?.length ?? 0} · ${scope}`}
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
  );
}

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { readHamClockContacts } from "@/lib/hamclock/recentContacts";
import { useContestStore } from "@/stores/contestStore";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { isValidGrid } from "@/lib/utils/grid";

export function HamClockRecentContacts() {
  const contestId = useContestStore((s) => s.activeSession?.id ?? null);
  const hidden = useHamClockDisplayStore((s) =>
    s.hiddenPanels.includes("contacts"),
  );
  const [expanded, setExpanded] = useState(true);
  const {
    data = [],
    isPending,
    error,
  } = useQuery({
    queryKey: ["hamclock-recent-contacts", contestId],
    queryFn: () => readHamClockContacts(contestId),
    enabled: !hidden,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });
  if (hidden) return null;
  const entries = data;
  return (
    <section
      aria-label="Recent Contacts"
      className="flex min-h-0 flex-col border-t border-white/15"
      style={{ flex: expanded ? "1 1 40%" : "0 0 auto" }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex shrink-0 items-center justify-between px-3 py-2 text-xs uppercase text-gray-200"
      >
        <span>Recent Contacts</span>
        <span className="text-gray-400">
          {contestId ? "Session" : "Today"} · UTC {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-2">
          {isPending ? (
            <p className="text-xs text-gray-400">Loading contacts…</p>
          ) : error ? (
            <p className="text-xs text-red-300">Could not read the logbook.</p>
          ) : !entries.length ? (
            <p className="py-3 text-xs text-gray-400">
              No contacts logged in this scope.
            </p>
          ) : (
            <ol className="divide-y divide-white/10">
              {entries.map((e) => (
                <li key={e.id} className="py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-cosmic-cyan">
                      ✓ {e.callsign}
                    </span>
                    <time className="font-mono text-gray-400">{e.timeOn}</time>
                  </div>
                  <div className="flex gap-2 text-gray-300">
                    <span>{e.band}</span>
                    <span>{e.mode}</span>
                    <span className="ml-auto text-gray-500">
                      {e.grid && isValidGrid(e.grid)
                        ? e.grid
                        : "Location unavailable"}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <Link
            to="/log"
            className="mt-2 inline-block text-xs text-cosmic-cyan underline"
          >
            Open logbook
          </Link>
        </div>
      )}
    </section>
  );
}

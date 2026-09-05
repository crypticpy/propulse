import { lazy, Suspense, useState, useMemo } from "react";
import { useBandActivity } from "@/hooks/useBandActivity";
import { continentForLatLon, CONTINENT_LABEL } from "@/lib/utils/continent";
import type { BandActivityScope } from "@/hooks/useBandActivity";
import { Link } from "react-router-dom";
import { useStationCastContext } from "@/hooks/useStationCastContext";
import { useActivityExplorerStore } from "@/stores/activityExplorerStore";
import { useDXCluster } from "@/hooks/useDXCluster";
import { activityIsCurrent, activityRows } from "@/lib/home/presentation";
import { HomeStatus } from "./HomeStatus";
const Nearby = lazy(() => import("@/components/activity/NearbyActivityExplorer").then(m => ({ default: m.NearbyActivityExplorer })));


function NearbyReports({ location }: { location: ReturnType<typeof useStationCastContext>["location"] }) {
  useDXCluster();
  return <Nearby locationOverride={location} />;
}

export function HomeActivity({ now, isMobile }: { now: number; isMobile: boolean }) {
  const station = useStationCastContext();
  const continent = station.location ? continentForLatLon(station.location.lat, station.location.lon) : null;
  const activityScope = useMemo<BandActivityScope>(() => continent ? { type: "regional", continent } : { type: "global" }, [continent]);
  const scopeLabel = continent ? `Regional · ${CONTINENT_LABEL[continent]}` : "Global";
  const query = useBandActivity(activityScope);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const current = activityIsCurrent(query.data?.fetchedAt ?? 0, query.isError, Math.max(now, Date.now()));
  const rows = current ? activityRows(query.data) : [];
  const shown = isMobile && !expanded ? rows.slice(0, 3) : rows;
  const maximum = Math.max(1, ...rows.map(row => row.obs20m));
  const openBand = (band: string) => {
    const filters = useActivityExplorerStore.getState();
    filters.setMode("band");
    filters.setBand(band);
    setSelected(band);
  };
  return <section aria-label="Band activity" className="min-w-0 rounded-2xl border border-white/10 bg-panel p-4 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-orbitron text-sm text-white sm:text-base">On the bands now</h2><HomeStatus state={query.isPending ? "loading" : query.isError ? "error" : current ? "fresh" : query.data?.fetchedAt ? "stale" : "unavailable"} /></div>
    <p className="mt-2 text-sm text-slate-300">{scopeLabel} · all modes · last 20 minutes</p>
    <p className="mt-1 text-xs leading-5 text-slate-400">Recent reception and cluster reports, grouped by band. Reported activity is not a guarantee of a contact from your station.</p>
    {query.isPending ? <p className="mt-5 text-sm text-slate-400">Checking reception reports…</p> : !current ? <p className="mt-5 text-sm leading-6 text-amber-200">Activity updates are unavailable. We check again automatically; this does not mean the bands are closed.</p> : rows.length === 0 ? <p className="mt-5 text-sm text-slate-300">No band coverage was returned. Open the map or check a path while reports update.</p> : <div className="mt-4 space-y-1">{shown.map(row => {
      return <div key={row.band} className="rounded-lg border border-white/[0.06] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3"><button type="button" onClick={() => openBand(row.band)} className="min-h-11 font-mono text-base text-cyan-200 hover:underline">{row.band} <span aria-hidden="true" className="text-xs">↗</span><span className="sr-only"> nearby reports</span></button><span className="text-xs text-slate-300"><strong className="font-mono text-sm text-white">{row.obs20m.toLocaleString()}</strong> observations · {row.reporters20m.toLocaleString()} reporters</span></div>
        {(!isMobile || expanded) && <div aria-hidden="true" className="my-1.5 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-cyan-300/70" style={{ width: `${row.obs20m / maximum * 100}%` }} /></div>}
        <p className="mt-1 text-xs text-slate-400">{row.obs20m === 0 ? "No recent reports · conditions unknown" : "Activity reported"}{row.obs20m > 0 && <> · {Object.entries(row.modeObs20m).filter(([, count]) => count > 0).map(([mode, count]) => `${({ cw: "CW", digital: "Digital", phone: "Phone", unknown: "Other" } as Record<string, string>)[mode] ?? mode} ${count}`).join(" · ")}</>}</p>
      </div>;
    })}</div>}
    {isMobile && rows.length > 3 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="mt-2 min-h-11 text-sm text-cyan-200">{expanded ? "Show fewer bands" : `All ${rows.length} bands & activity bars`}</button>}
    {current && <p className="mt-3 text-xs text-slate-500">Snapshot {new Date(query.data?.fetchedAt ?? query.dataUpdatedAt).toLocaleTimeString(undefined, { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false })} UTC · Counts are deduplicated within the reporting window. Source coverage varies; zero reports does not mean a closed band.</p>}
    <div className="mt-2 flex flex-wrap items-center gap-3"><Link to="/map" className="inline-flex min-h-11 items-center rounded-lg bg-cyan-300 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-200">Open PropSphere ↗</Link><button type="button" aria-expanded={selected !== null} aria-controls="home-nearby-reports" onClick={() => setSelected(selected ? null : "all")} className="mt-3 min-h-11 rounded-lg border border-white/10 px-3 text-sm text-cyan-200 hover:bg-white/5">{selected ? "Close nearby reports" : "Explore nearby reports"}</button></div>
    {selected && <div id="home-nearby-reports" className="mt-4"><p className="mb-3 text-xs leading-5 text-slate-400">Nearby reports use {station.location?.grid ?? "your operating location"} and your saved range and time filters. This is a different population from the regional counts above.</p><Suspense fallback={<p className="text-sm text-slate-400">Opening reports…</p>}><NearbyReports location={station.location} /></Suspense></div>}
  </section>;
}

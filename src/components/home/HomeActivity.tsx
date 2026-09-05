import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { createGuestActivityExplorerStore, useActivityExplorerStore } from "@/stores/activityExplorerStore";
import { useDXCluster } from "@/hooks/useDXCluster";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import { useHomeBandActivity } from "@/hooks/useHomeBandActivity";
import { HomeStatus } from "./HomeStatus";
const Nearby = lazy(() => import("@/components/activity/NearbyActivityExplorer").then(m => ({ default: m.NearbyActivityExplorer })));
function ClusterReportsHost() { useDXCluster(); return null; }
function NearbyReports({ filterStore }: { filterStore: ReturnType<typeof createGuestActivityExplorerStore> }) {
  const { location, guest } = useHomeLocation();
  return <>{!guest && <ClusterReportsHost />}<Nearby locationOverride={location} publicOnly={guest} filterStore={filterStore} /></>;
}
export function HomeActivity({ now, isMobile }: { now: number; isMobile: boolean }) {
  const { query, rows, current, scopeLabel } = useHomeBandActivity(now);
  const { location, guest } = useHomeLocation();
  const [guestFilters] = useState(createGuestActivityExplorerStore);
  const filters = guest ? guestFilters : useActivityExplorerStore;
  const [expanded, setExpanded] = useState(false);
  const [about, setAbout] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const shown = isMobile && !expanded ? rows.filter(row => ["80m", "40m", "30m", "20m", "15m", "10m"].includes(row.band)) : rows;
  const maximum = Math.max(1, ...rows.map(row => row.obs20m));
  return <section aria-label="Band activity" className="home-panel home-activity"><div className="home-panel-heading"><h2>On the bands now</h2><HomeStatus state={query.isPending ? "loading" : query.isError ? "error" : current ? "fresh" : query.data?.fetchedAt ? "stale" : "unavailable"} /></div>
    <p className="home-note">{scopeLabel} · last 20 minutes · all modes</p>
    {query.isPending ? <p>Checking reception reports…</p> : !current ? <p>Activity updates are unavailable. We check again automatically; this does not mean the bands are closed.</p> : rows.length === 0 ? <p>No band coverage was returned. Conditions remain unknown.</p> : <div className="home-band-grid">{shown.map(row => {
      const modes = Object.entries(row.modeObs20m).filter(([, count]) => count > 0).sort((a,b) => b[1]-a[1]);
      const dominant = modes[0];
      return <div key={row.band} className="home-band"><button type="button" aria-controls="home-nearby-reports" aria-expanded={selected === row.band} onClick={() => { filters.getState().setMode("band"); filters.getState().setBand(row.band); setSelected(row.band); }}><span>{row.band}</span><span className="sr-only"> nearby reports</span></button><strong>{row.obs20m.toLocaleString()}</strong><span>reports</span><div aria-hidden="true" className="home-meter"><i style={{ width: `${row.obs20m/maximum*100}%` }} /></div><span>{row.reporters20m.toLocaleString()} reporters</span><span>{row.obs20m === 0 ? "No recent reports · conditions unknown" : dominant ? `${({ phone: "Phone", digital: "Digital", cw: "CW", unknown: "Other" } as Record<string,string>)[dominant[0]] ?? dominant[0]} ${dominant[1].toLocaleString()}` : "Mode unknown"}</span></div>;
    })}</div>}
    {isMobile && shown.length < rows.length && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(true)}>Show all {rows.length} bands</button>}
    {isMobile && expanded && <button type="button" aria-expanded onClick={() => setExpanded(false)}>Show fewer bands</button>}
    <div className="home-activity-footer"><p className="home-note">Regional reports; reception at your station may differ.{current && <> Snapshot {new Date(query.data!.fetchedAt!).toLocaleTimeString(undefined, { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false })} UTC.</>}</p><button type="button" aria-expanded={about} aria-controls="home-report-about" onClick={() => setAbout(!about)}>About these reports {about ? "−" : "+"}</button></div>
    {about && <p id="home-report-about">Reception and cluster reports are deduplicated within the reporting window. Bar length compares report counts, not band quality. Source coverage varies; zero reports does not mean a closed band. Select a band to open nearby reports; Advanced dashboard shows all mode counts.</p>}
    <div className="home-actions"><Link to="/map">Open PropSphere ↗</Link><button type="button" aria-expanded={selected !== null} aria-controls="home-nearby-reports" onClick={() => setSelected(selected ? null : "all")}>{selected ? "Close nearby reports" : "Explore nearby reports"}</button></div>
    {selected && <div id="home-nearby-reports" className="home-detail"><p>Nearby reports use {location?.grid ?? "a location you choose"} and {guest ? "this visit’s" : "your saved"} range and time filters. This is a different population from the regional counts above.</p>{location ? <Suspense fallback={<p>Opening reports…</p>}><NearbyReports filterStore={filters} /></Suspense> : <p>Set your Home location to explore nearby reports.</p>}</div>}
  </section>;
}

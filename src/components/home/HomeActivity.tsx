import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { createGuestActivityExplorerStore, useActivityExplorerStore } from "@/stores/activityExplorerStore";
import { useDXCluster } from "@/hooks/useDXCluster";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import { useHomeBandActivity } from "@/hooks/useHomeBandActivity";
import { formatSnapshotAge } from "@/lib/home/presentation";
import { buildBandsLadder } from "@/lib/home/bandsLadder";
import { HomeStatus } from "./HomeStatus";
import { HomeBandsLadder } from "./HomeBandsLadder";
import { accentForHomeItem } from "@/lib/themes/sectionAccent";
import { homeItemSummary } from "@/lib/home/layout";
import { SectionHeader } from "@/components/ui/SectionHeader";
/** Mobile shows the six bands most operators start on; the rest expand. */
const MOBILE_BANDS = ["80m", "40m", "30m", "20m", "15m", "10m"];
const Nearby = lazy(() => import("@/components/activity/NearbyActivityExplorer").then(m => ({ default: m.NearbyActivityExplorer })));
function ClusterReportsHost() { useDXCluster(); return null; }
function NearbyReports({ filterStore }: { filterStore: ReturnType<typeof createGuestActivityExplorerStore> }) {
  const { location, guest } = useHomeLocation();
  return <>{!guest && <ClusterReportsHost />}<Nearby locationOverride={location} publicOnly={guest} filterStore={filterStore} /></>;
}
export function HomeActivity({ now, isMobile }: { now: number; isMobile: boolean }) {
  const { query, rows, current, hasData, fetchedAt, scopeLabel, verdictByBand } = useHomeBandActivity(now);
  const { location, guest } = useHomeLocation();
  const [guestFilters] = useState(createGuestActivityExplorerStore);
  const filters = guest ? guestFilters : useActivityExplorerStore;
  const [expanded, setExpanded] = useState(false);
  const [about, setAbout] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const ladder = buildBandsLadder(rows, verdictByBand);
  const shown = isMobile && !expanded ? ladder.filter(row => MOBILE_BANDS.includes(row.band)) : ladder;
  const status = query.isPending ? "loading" : query.isError ? "error" : current ? "fresh" : hasData ? "stale" : "unavailable";
  const staleDetail = hasData && !current && fetchedAt ? formatSnapshotAge(fetchedAt, now) : undefined;
  return <section aria-label="Band activity" className="home-panel home-activity su-section-panel" data-accent={accentForHomeItem("activity")}>
    <div aria-hidden="true" className="su-section-rule" />
    <SectionHeader className="su-widget-header" title="On the bands now" summary={homeItemSummary("activity")} action={<HomeStatus state={status} detail={staleDetail} />} />
    <div className="home-panel-body">
    <p className="home-note">{scopeLabel} · last 20 minutes · all modes</p>
    {query.isPending ? <p>Checking reception reports…</p> : !hasData ? <p>Activity updates are unavailable. We check again automatically; this does not mean the bands are closed.</p> : rows.length === 0 ? <p>No band coverage was returned. Conditions remain unknown.</p> : <HomeBandsLadder rows={shown} stale={!current} selectedBand={selected} onSelectBand={band => { filters.getState().setMode("band"); filters.getState().setBand(band); setSelected(band); }} />}
    {hasData && !current && <p className="home-note">Showing the last snapshot; updates retry automatically.</p>}
    {isMobile && shown.length < ladder.length && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(true)}>Show all {ladder.length} bands</button>}
    {isMobile && expanded && <button type="button" aria-expanded onClick={() => setExpanded(false)}>Show fewer bands</button>}
    <div className="home-activity-footer"><p className="home-note">Regional reports; reception at your station may differ.{current && <> Snapshot {new Date(query.data!.fetchedAt!).toLocaleTimeString(undefined, { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false })} UTC.</>}</p><button type="button" aria-expanded={about} aria-controls="home-report-about" onClick={() => setAbout(!about)}>About these reports {about ? "−" : "+"}</button></div>
    {about && <p id="home-report-about">Reception and cluster reports are deduplicated within the reporting window. Bar length compares report counts, not band quality. Source coverage varies; zero reports does not mean a closed band. Select a band to open nearby reports; Advanced dashboard shows all mode counts.</p>}
    <div className="home-actions"><Link to="/map">Open PropSphere ↗</Link><button type="button" aria-expanded={selected !== null} aria-controls="home-nearby-reports" onClick={() => setSelected(selected ? null : "all")}>{selected ? "Close nearby reports" : "Explore nearby reports"}</button></div>
    {selected && <div id="home-nearby-reports" className="home-detail"><p>Nearby reports use {location?.grid ?? "a location you choose"} and {guest ? "this visit’s" : "your saved"} range and time filters. This is a different population from the regional counts above.</p>{location ? <Suspense fallback={<p>Opening reports…</p>}><NearbyReports filterStore={filters} /></Suspense> : <p>Set your Home location to explore nearby reports.</p>}</div>}
    </div>
  </section>;
}

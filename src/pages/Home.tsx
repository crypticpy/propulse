import { Fragment, lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSolarModel } from "@/hooks/useSolarModel";
import type { SolarSourceGroup } from "@/lib/solar/sourcePolicies";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUserStore } from "@/stores/userStore";
import { useMapOperationalContext } from "@/hooks/useMapOperationalContext";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import { useHomeLayout } from "@/hooks/useHomeLayout";
import { groupHomeLayout, homeItemSummary, homeItemTitle, isHomeItemAvailable } from "@/lib/home/layout";
import { accentForHomeItem } from "@/lib/themes/sectionAccent";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { HomeLocationProvider } from "@/components/home/HomeLocationProvider";
import { HomeLocationPicker } from "@/components/home/HomeLocationPicker";
import { HomeSolar } from "@/components/home/HomeSolar";
import { HomeForecastStrip } from "@/components/home/HomeForecastStrip";
import { HomeWeather } from "@/components/home/HomeWeather";
import { HomeDaylight } from "@/components/home/HomeDaylight";
import { HomePanelLibrary } from "@/components/home/HomePanelLibrary";
import { HomeCustomizeDialog } from "@/components/home/HomeCustomizeDialog";
import { HomeStation } from "@/components/home/HomeStation";
import { HomeSession } from "@/components/home/HomeSession";
import "@/styles/home.css";
const Activity = lazy(() => import("@/components/home/HomeActivity").then(m => ({ default: m.HomeActivity })));
const Advanced = lazy(() => import("@/components/home/HomeAdvanced").then(m => ({ default: m.HomeAdvanced })));
const Widget = lazy(() => import("@/components/home/HomeWidgets").then(m => ({ default: m.HomeWidget })));
const GROUPS: ReadonlySet<SolarSourceGroup> = new Set(["now", "forecast"]);
export function Home() { return <HomeLocationProvider><HomeDashboard /></HomeLocationProvider>; }
function HomeDashboard() {
  const isMobile = useIsMobile();
  const model = useSolarModel({ enabledGroups: GROUPS });
  const callsign = useUserStore(s => s.station?.callsign);
  const { location, guest } = useHomeLocation();
  const { policy } = useMapOperationalContext();
  const publicActivity = guest || policy.surfaces.liveSpots.includes("public");
  const [now, setNow] = useState(Date.now);
  const [advanced, setAdvanced] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const layout = useHomeLayout(isMobile, guest);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  // Panels the operator ordered, minus anything their session cannot render.
  const groups = groupHomeLayout(layout.items.filter(id => isHomeItemAvailable(id, guest)));
  // The Advanced report belongs with the band story it expands on.
  const anchor = groups.reduce((last, group, index) => group.kind === "wide" && (group.id === "activity" || group.id === "forecast") ? index : last, groups.length - 1);
  const tile = (id: string) => {
    if (id === "solar") return <HomeSolar key={id} model={model} now={now} />;
    if (id === "weather") return <HomeWeather key={id} now={now} />;
    if (id === "daylight") return <HomeDaylight key={id} now={now} />;
    return <article className="home-panel su-section-panel" data-accent={accentForHomeItem(id)} key={id}>
      <div aria-hidden="true" className="su-section-rule" />
      <SectionHeader as="h3" className="su-widget-header" title={homeItemTitle(id)} summary={homeItemSummary(id)} />
      <div className="home-panel-body"><Suspense fallback={<p>Opening {homeItemTitle(id)}…</p>}><Widget id={id} /></Suspense></div>
    </article>;
  };
  const advancedReport = advanced && <div id="home-advanced-report"><Suspense fallback={<p>Opening Advanced dashboard…</p>}><Advanced model={model} now={now} publicActivity={publicActivity} /></Suspense><button type="button" onClick={()=>setAdvanced(false)}>Back to quick look</button></div>;
  const wide = (id: string) => {
    if (id === "activity") return publicActivity ? <Suspense fallback={<p>Opening band activity…</p>}><Activity now={now} isMobile={isMobile} /></Suspense> : <section className="home-panel su-section-panel" data-accent={accentForHomeItem("activity")} aria-label="Focused operating">
      <div aria-hidden="true" className="su-section-rule" />
      <SectionHeader className="su-widget-header" title="Focused operating" summary="Public reports stay off this dashboard while the policy is set to log only." />
      <div className="home-panel-body"><p>Public spotting is hidden by your current operating policy. Your solar briefing and log remain available.</p></div>
    </section>;
    if (id === "forecast") return <HomeForecastStrip model={model} now={now} />;
    return <details className="home-panel home-personal su-section-panel su-section-ruled" data-accent={accentForHomeItem("station")}>
      <SectionHeader
        element="summary"
        as={null}
        className="su-widget-header"
        title={homeItemTitle("station")}
        summary={homeItemSummary("station")}
        action={<span className="su-section-glyph flex h-10 w-10 items-center justify-center rounded-xl border bg-su-input" aria-hidden="true" />}
      />
      <div className="home-panel-body"><div className="home-personal-grid"><HomeStation /><HomeSession now={now} isMobile={isMobile} /></div></div>
    </details>;
  };
  return <main className="home-dashboard su-page-glow" data-home-elevation data-home-dashboard>
    <div aria-hidden="true" className="su-page-glow-layer" />
    <div className="su-page-glow-content">
    <header className="home-title"><div><h1>Your radio dashboard</h1><p>{guest ? "Guest" : callsign ?? "Home"} · {location?.grid ?? "Global view"}{guest && " · no sign-in needed"}</p></div><div className="home-refresh"><button type="button" aria-label="Refresh Home solar briefing" aria-describedby="home-refresh-help" disabled={model.refreshResult.running} onClick={() => void model.refreshVisible()}><span aria-hidden="true">↻</span><span className="sr-only">Refresh</span></button><p id="home-refresh-help" role="tooltip">Refreshes the solar readings and official forecasts. Activity updates every minute. Weather and log have separate refresh controls.</p></div></header>
    <div className="home-dashboard-controls"><HomeLocationPicker /><div className="home-view-switch" role="group" aria-label="Dashboard detail"><button type="button" aria-pressed={!advanced} onClick={()=>setAdvanced(false)}>Quick look</button><button type="button" aria-pressed={advanced} aria-expanded={advanced} aria-controls="home-advanced-report" onClick={()=>setAdvanced(true)}>Advanced dashboard</button></div><button type="button" onClick={()=>setCustomizing(true)}>Customize dashboard</button>{guest && <Link to="/profile">Sign in</Link>}</div>
    <p className="home-note">{location ? `Weather and daylight use ${location.grid}. Band reports cover the wider region.` : "Set a grid square for local weather, daylight, and a path forecast."}</p>
    {model.briefing.tone === "impact" && <section className="home-panel home-impact su-section-panel" data-accent="danger" aria-label="Operating briefing">
      <div aria-hidden="true" className="su-section-rule" />
      <SectionHeader className="su-widget-header" title={model.briefing.title} summary="Current impacts from the solar briefing." />
      <div className="home-panel-body">{model.briefing.statements.filter(s=>s.kind === "impact").map(s=><p key={s.id}>{s.text}</p>)}<Link to="/solar">Read the Solar Pulse briefing ↗</Link></div>
    </section>}
    {model.refreshResult.failed.length > 0 && <p role="status">Some solar updates could not refresh. Available readings retain their source age; updates retry automatically.</p>}
    {groups.map((group, index) => <Fragment key={group.kind === "wide" ? group.id : group.ids.join("-")}>
      {group.kind === "wide" ? wide(group.id) : <div className="home-context-grid">{group.ids.map(tile)}</div>}
      {index === anchor && advancedReport}
    </Fragment>)}
    {groups.length === 0 && advancedReport}
    <HomePanelLibrary layout={layout} guest={guest} onCustomize={()=>setCustomizing(true)} />
    <HomeCustomizeDialog open={customizing} onClose={()=>setCustomizing(false)} layout={layout} guest={guest} isMobile={isMobile} />
    </div>
  </main>;
}

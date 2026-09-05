import { lazy, Suspense, useEffect, useState } from "react";
import { useSolarModel } from "@/hooks/useSolarModel";
import type { SolarSourceGroup } from "@/lib/solar/sourcePolicies";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUserStore } from "@/stores/userStore";
import { useMapOperationalContext } from "@/hooks/useMapOperationalContext";
import { useHomePreferences, HOME_WIDGETS } from "@/hooks/useHomePreferences";
import { HomeBriefing } from "@/components/home/HomeBriefing";
import { HomeStation } from "@/components/home/HomeStation";
import { HomeSession } from "@/components/home/HomeSession";
import { SolarDisclosure } from "@/components/solar/SolarDisclosure";
const Activity = lazy(() => import("@/components/home/HomeActivity").then(m => ({ default: m.HomeActivity })));
const Widgets = lazy(() => import("@/components/home/HomeWidgets").then(m => ({ default: m.HomeWidgets })));
const GROUPS: ReadonlySet<SolarSourceGroup> = new Set(["now"]);

export function Home() {
  const isMobile = useIsMobile();
  const model = useSolarModel({ enabledGroups: GROUPS });
  const callsign = useUserStore(s => s.station?.callsign);
  const { policy } = useMapOperationalContext();
  const publicActivity = policy.surfaces.liveSpots.includes("public");
  const [now, setNow] = useState(Date.now);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [phonePinsOpen, setPhonePinsOpen] = useState(false);
  const { pinned, toggle } = useHomePreferences(isMobile);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const status = model.briefing.state === "loading" ? "Checking solar sources" : model.briefing.missing.length || model.briefing.delayed.length ? "Some solar updates are pending" : "Solar sources up to date";
  const activityPanel = publicActivity ? <Suspense key="activity" fallback={<p className="p-4 text-sm text-slate-400">Opening band activity…</p>}><Activity now={now} isMobile={isMobile} /></Suspense> : <section key="activity" className="rounded-2xl border border-white/10 bg-panel p-5"><h2 className="font-orbitron text-sm text-white">Focused operating</h2><p className="mt-3 text-sm leading-6 text-slate-300">Public spotting is hidden by your current operating policy. Your solar briefing and log remain available.</p></section>;
  const briefingPanel = <HomeBriefing key="briefing" model={model} />;
  return <main className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:px-6 sm:py-6" data-home-elevation>
    <header className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr_auto]">
      <div><h1 className="font-orbitron text-xl text-white sm:text-2xl">Station briefing</h1><p className="mt-1 text-xs text-slate-400">{callsign ? `${callsign} · ` : "Welcome to ProPulse · "}Your next session starts here</p></div>
      <p className="col-start-1 row-start-2 text-xs text-slate-400 sm:col-start-2 sm:row-start-1 sm:text-center">{status}</p>
      <div className="group relative col-start-2 row-span-2 row-start-1 justify-self-end sm:col-start-3"><button type="button" aria-label="Refresh Home solar briefing" aria-describedby="home-refresh-help" disabled={model.refreshResult.running} onClick={() => void model.refreshVisible()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-slate-200 hover:bg-white/10 disabled:opacity-50"><span aria-hidden="true" className={model.refreshResult.running ? "motion-safe:animate-spin" : ""}>↻</span><span className="ml-2 hidden text-xs sm:inline">Refresh</span></button><p id="home-refresh-help" role="tooltip" className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-64 rounded-lg border border-white/10 bg-void-black p-3 text-xs leading-5 text-slate-300 shadow-xl group-hover:block group-focus-within:block">Refreshes the six solar sources behind this briefing. Activity updates automatically every minute; log and optional widgets use their own update controls.</p></div>
    </header>
    {model.refreshResult.failed.length > 0 && <p role="status" className="text-xs text-amber-200">Some solar sources could not refresh. Available readings remain within their source limits; updates retry automatically.</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      {isMobile && model.briefing.tone === "impact" ? [briefingPanel, activityPanel] : [activityPanel, briefingPanel]}
    </div>
    <div className="grid items-start gap-5 lg:grid-cols-2"><HomeStation now={now} /><HomeSession now={now} isMobile={isMobile} /></div>
    {pinned.length > 0 && <section aria-label="Pinned widgets" className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-orbitron text-sm text-white">Your favorites</h2>{isMobile && <button type="button" aria-expanded={phonePinsOpen} onClick={() => setPhonePinsOpen(!phonePinsOpen)} className="min-h-11 text-sm text-cyan-200">{phonePinsOpen ? "Hide" : `Show ${pinned.length} favorites`}</button>}</div>{(!isMobile || phonePinsOpen) && <Suspense fallback={<p className="text-sm text-slate-400">Opening favorites…</p>}><Widgets ids={pinned} /></Suspense>}</section>}
    <SolarDisclosure id="home-widget-library" title="Make room for what you follow" summary="Pin sky, local conditions, clocks, DXpeditions, and radio news to your Home." open={libraryOpen} onToggle={() => setLibraryOpen(!libraryOpen)}>
      <p className="mb-3 text-sm text-slate-300">Choose favorites for this {isMobile ? "phone layout" : "desktop/tablet layout"}. Optional feeds load when their cards open.</p>
      <div className="mb-5 flex flex-wrap gap-2">{HOME_WIDGETS.map(([id, title]) => <button key={id} type="button" aria-pressed={pinned.includes(id)} onClick={() => toggle(id)} className={`min-h-11 rounded-lg border px-3 text-xs ${pinned.includes(id) ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-200" : "border-white/10 text-slate-300 hover:bg-white/5"}`}>{pinned.includes(id) ? "✓ " : "+ "}{title}</button>)}</div>
      <Suspense fallback={<p className="text-sm text-slate-400">Opening widget library…</p>}><Widgets ids={HOME_WIDGETS.map(([id]) => id).filter(id => !pinned.includes(id) || (isMobile && !phonePinsOpen))} /></Suspense>
    </SolarDisclosure>
  </main>;
}

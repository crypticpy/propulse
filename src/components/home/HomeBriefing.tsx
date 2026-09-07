import { useState } from "react";
import { Link } from "react-router-dom";
import type { useSolarModel } from "@/hooks/useSolarModel";
import { useActiveMode } from "@/hooks/useActiveBandMode";
import { useMapStore } from "@/stores/mapStore";
import { parseSolarHandoff } from "@/lib/solar/handoff";
import { HomeStatus } from "./HomeStatus";

export function HomeBriefing({ model }: { model: ReturnType<typeof useSolarModel> }) {
  const { briefing, current, resources } = model;
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const mode = useActiveMode();
  const target = useMapStore(s => s.target);
  const state = { solarHandoff: parseSolarHandoff({ version: 1, origin: "home", mode, target: target ?? undefined }) };
  const impacts = briefing.statements.filter(s => s.kind === "impact");
  const shown = impacts.length ? impacts : briefing.statements.filter(s => s.kind === "background").slice(0, 1);
  return <section aria-label="Operating briefing" className={`min-w-0 rounded-2xl border bg-su-panel p-4 sm:p-6 ${briefing.tone === "impact" ? "border-su-danger/40" : "border-su-warning/25"}`}>
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-widest text-su-warning">Before you get on the air</p><HomeStatus state={briefing.state} /></div>
    <h2 className="mt-4 text-2xl font-semibold leading-tight text-su-text sm:text-3xl">{briefing.title}</h2>
    <div className="mt-3 space-y-2 text-sm leading-relaxed text-su-muted">{shown.map(s => <p key={s.id}>{s.text}</p>)}{!shown.length && <p>Current measurements are on their way. You can still open the map or plan a session.</p>}</div>
    {briefing.state !== "loading" && (briefing.missing.length > 0 || briefing.delayed.length > 0) && <p className="mt-3 text-xs leading-5 text-su-warning">{briefing.missing.length > 0 && `Awaiting ${briefing.missing.join(", ")}. `}{briefing.delayed.length > 0 && `Delayed: ${briefing.delayed.join(", ")}. `}Updates retry automatically; no station setting needs changing. Unreported conditions remain uncertain.</p>}
    <nav aria-label="Home operating actions" className="mt-5 flex flex-wrap gap-2">
      <Link to="/map" className="inline-flex min-h-11 items-center rounded-lg bg-su-accent px-4 text-sm font-semibold text-su-on-accent hover:bg-su-accent/90">Open PropSphere <span className="ml-3" aria-hidden="true">↗</span></Link>
      <Link to="/dx" state={state} className="inline-flex min-h-11 items-center rounded-lg border border-su-line/40 px-4 text-sm text-su-muted hover:bg-su-input">Check a path</Link>
      <Link to="/planner" state={state} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-su-info hover:bg-su-input">Plan a session</Link>
    </nav>
    <div className="mt-5 grid grid-cols-3 gap-3 border-t border-su-line/40 pt-4">
      {[
        { label: `Kp · ${current.kp?.kind ?? "3-hour"}`, value: current.kp?.kp.toFixed(1), state: resources.kp.state },
        { label: "Solar flux · sfu", value: current.flux?.flux.toFixed(0), state: resources.flux.state },
        { label: "X-ray class", value: current.xray ? current.xrayClass : undefined, state: resources.xray.state },
      ].map(reading => <div key={reading.label}><p className="text-xs text-su-muted">{reading.label}</p><p className="mt-1 font-mono text-xl text-su-text">{reading.value ?? "—"}</p><HomeStatus state={reading.state} /></div>)}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs"><button type="button" aria-expanded={sourcesOpen} aria-controls="home-briefing-sources" onClick={() => setSourcesOpen(!sourcesOpen)} className="min-h-11 rounded-lg px-2 text-su-muted hover:bg-su-input">Sources & times {sourcesOpen ? "−" : "+"}</button><Link to="/solar" className="inline-flex min-h-11 items-center text-su-info">Full Solar Pulse briefing →</Link></div>
    {sourcesOpen && <div id="home-briefing-sources" className="space-y-3 border-t border-su-line/40 pt-3 text-xs leading-5 text-su-muted"><p>Global space weather is context. A contact depends on both stations, the path, and time.</p>{briefing.evidence.map(e => <div key={e.sourceId}><a href={e.sourceUrl} target="_blank" rel="noreferrer" className="text-su-info underline">{e.label}</a> · {e.state}{e.observedAt && <p>{e.sourceId === "swpc-alerts" ? "Latest issue / empty response" : "As of"} <time dateTime={e.observedAt}>{new Date(e.observedAt).toUTCString()}</time></p>}</div>)}</div>}
  </section>;
}

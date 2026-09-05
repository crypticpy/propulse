import { upcomingKp } from "@/lib/home/forecast";
import { useActiveMode } from "@/hooks/useActiveBandMode";
import { useMapStore } from "@/stores/mapStore";
import { parseSolarHandoff } from "@/lib/solar/handoff";
import { Link } from "react-router-dom";
import type { useSolarModel } from "@/hooks/useSolarModel";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import { HomeStatus } from "./HomeStatus";
export function HomeSolar({ model, now }: { model: ReturnType<typeof useSolarModel>; now: number }) {
  const { location } = useHomeLocation();
  const mode = useActiveMode();
  const target = useMapStore(s => s.target);
  const state = { solarHandoff: parseSolarHandoff({ version: 1, origin: "home", mode, target: target ?? undefined }) };
  const { current, resources, briefing } = model;
  const predictions = upcomingKp(current.predictedKp, now);
  const today = new Date(now).toISOString().slice(0,10);
  const forecast = resources.forecast.data;
  const days = forecast?.forecast.filter(day => day.date >= today).slice(0,3) ?? [];
  return <section className="home-panel home-solar" aria-label="Solar outlook"><div className="home-panel-heading"><h2>Solar outlook</h2><HomeStatus state={briefing.state} /></div><h3>{briefing.title}</h3>
    <div className="home-solar-instruments"><div className="home-reading"><span>Kp · {current.kp?.kind ?? "3-hour"}</span><strong>{current.kp?.kp.toFixed(1) ?? "—"}</strong><HomeStatus state={resources.kp.state} /></div><div className="home-reading"><span>Solar flux · sfu</span><strong>{current.flux?.flux.toFixed(0) ?? "—"}</strong><HomeStatus state={resources.flux.state} /></div><div className="home-reading"><span>X-ray class</span><strong>{current.xray ? current.xrayClass : "—"}</strong><HomeStatus state={resources.xray.state} /></div></div>
    <div className="home-solar-forecast"><div><span>Next 24h · predicted Kp</span><strong>{predictions.length ? `${Math.min(...predictions.map(p=>p.kp)).toFixed(1)}–${Math.max(...predictions.map(p=>p.kp)).toFixed(1)}` : "Unavailable"}</strong><HomeStatus state={resources.kp.state} /></div><div><span>Official solar flux forecast</span>{days.length ? <strong>{days[0].predicted_flux} sfu · {days[0].date.slice(5)}</strong> : <p>Updates pending</p>}<HomeStatus state={resources.forecast.state} /></div></div>
    <p className="home-note">Global conditions{location ? ` · viewed from ${location.grid}` : ""}. Interpret with your daylight and path.</p>
    {(briefing.missing.length > 0 || briefing.delayed.length > 0) && <p className="home-note">{briefing.missing.length > 0 && `Awaiting ${briefing.missing.join(", ")}. `}{briefing.delayed.length > 0 && `Delayed: ${briefing.delayed.join(", ")}. `}Updates retry automatically; no station setting needs changing.</p>}
    <details className="home-source-details"><summary>Forecast detail, sources & times</summary>{days.map(day => <p key={day.date}>{day.date} · predicted solar flux {day.predicted_flux} sfu</p>)}{briefing.evidence.map(e => <p key={e.sourceId}><a href={e.sourceUrl} target="_blank" rel="noreferrer">{e.label}</a> · {e.state}{e.observedAt && ` · ${new Date(e.observedAt).toUTCString()}`}</p>)}{forecast && <p>NOAA flux forecast issued {new Date(forecast.issued_at).toUTCString()}</p>}</details><nav aria-label="Home operating actions" className="home-actions"><Link to="/solar">Full Solar Pulse briefing ↗</Link><Link to="/dx" state={state}>Check a path</Link><Link to="/planner" state={state}>Plan a session</Link></nav>
  </section>;
}

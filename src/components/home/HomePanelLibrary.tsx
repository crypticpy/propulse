import { lazy, Suspense, useState } from "react";
import { useHomeLocation } from "@/hooks/useHomeLocation";
import SunCalc from "suncalc";
import { HOME_WIDGETS, useHomePreferences } from "@/hooks/useHomePreferences";
const Widget = lazy(() => import("./HomeWidgets").then(m => ({ default: m.HomeWidget })));
const previews = ["moon", "dxpeditions", "clocks"];
export function HomePanelLibrary({ isMobile, now }: { isMobile: boolean; now: number }) {
  const { guest } = useHomeLocation();
  const { pinned, toggle } = useHomePreferences(isMobile, guest);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const title = (id: string) => HOME_WIDGETS.find(([key]) => key === id)?.[1] ?? id;
  const add = (id: string) => { setMessage(`${title(id)} ${pinned.includes(id) ? "removed from" : "added to"} Home.`); toggle(id); };
  return <section className="home-library" aria-label="More information panels"><div className="home-panel-heading"><div><h2>More information panels</h2><p>Sky, DXpeditions, clocks, local conditions, and radio news.</p></div></div>
    <div className="home-preview-grid">{previews.map(id => <article className="home-panel home-preview" key={id}><span className="home-preview-icon" aria-hidden="true">{id === "moon" ? (SunCalc.getMoonIllumination(new Date(now)).phase < 0.5 ? "◐" : "◑") : id === "clocks" ? "◷" : "◎"}</span><div><h3>{title(id)}</h3><p>{id === "moon" ? "Phase, rise and set times" : id === "clocks" ? "Time zones at a glance" : "Planned activations"}</p></div><button type="button" onClick={() => { setOpen(true); setViewing(id); }}>View {title(id)}</button></article>)}</div>
    <button type="button" className="home-library-toggle" aria-expanded={open} aria-controls="home-panel-catalog" onClick={() => setOpen(!open)}>{open ? "Hide additional panels" : "Show more information panels"} {open ? "−" : "+"}</button>
    {open && <div id="home-panel-catalog" className="home-panel"><p>Choose <strong>Add to Home</strong> on a panel to keep it visible in your {isMobile ? "phone" : "desktop/tablet"} layout. {guest ? "Guest choices last for this visit." : "Your choices are saved in this browser."}</p><div className="home-catalog-grid">{HOME_WIDGETS.map(([id,name])=><article key={id}><h3>{name}</h3><div className="home-actions"><button type="button" aria-label={`${pinned.includes(id) ? "Remove" : "Add"} ${name} ${pinned.includes(id) ? "from" : "to"} Home`} aria-pressed={pinned.includes(id)} onClick={()=>add(id)}>{pinned.includes(id) ? "Remove from Home" : "+ Add to Home"}</button><button type="button" aria-expanded={viewing===id} onClick={()=>setViewing(viewing===id?null:id)}>{viewing===id?"Close":"View"} {name}</button></div></article>)}</div>{viewing && !pinned.includes(viewing) && <div className="home-viewed-panel"><Suspense fallback={<p>Opening {title(viewing)}…</p>}><Widget id={viewing} /></Suspense></div>}{viewing && pinned.includes(viewing) && <p>{title(viewing)} is visible in Your information panels below.</p>}</div>}
    <p role="status" className="home-note">{message}</p>
    {pinned.length>0 && <section aria-label="Your information panels"><h2>Your information panels</h2><div className="home-pinned-grid">{pinned.map(id=><article className="home-panel" key={id}><div className="home-panel-heading"><h3>{title(id)}</h3><button type="button" aria-label={`Remove ${title(id)} from Home`} onClick={()=>add(id)}>Remove</button></div><Suspense fallback={<p>Opening {title(id)}…</p>}><Widget id={id} /></Suspense></article>)}</div></section>}
  </section>;
}

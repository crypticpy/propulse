import { useState } from "react";
import type { HomeLayoutController } from "@/hooks/useHomeLayout";
import { HOME_LAYOUT_ITEMS, isHomeItemAvailable } from "@/lib/home/layout";

/**
 * Bottom-of-dashboard discovery. Panels render in place on the dashboard now,
 * so this section only offers what is missing: one large + toggle that expands
 * the catalogue inline, and the door to Customize dashboard for ordering.
 */
export function HomePanelLibrary({
  layout,
  guest,
  onCustomize,
}: {
  layout: HomeLayoutController;
  guest: boolean;
  onCustomize: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const available = HOME_LAYOUT_ITEMS.filter(
    (item) => !layout.items.includes(item.id) && isHomeItemAvailable(item.id, guest),
  );
  const add = (id: string, title: string) => {
    layout.add(id);
    setMessage(`${title} added to your dashboard.`);
  };
  return <section className="home-library" aria-label="Add more panels">
    <div className="home-panel-heading"><div><h2>Add more panels</h2><p>Sky, DXpeditions, clocks, local conditions, and radio news.</p></div><button type="button" onClick={onCustomize}>Customize dashboard</button></div>
    <button type="button" className="home-library-toggle" aria-expanded={open} aria-controls="home-panel-catalog" onClick={() => setOpen(!open)}>{open ? "Hide the panel catalogue −" : "Add more panels +"}</button>
    {open && <div id="home-panel-catalog" className="home-panel"><div className="home-panel-body">
      {available.length === 0
        ? <p>Every available panel is already on your dashboard. Use <strong>Customize dashboard</strong> to reorder or hide panels.</p>
        : <><p>Choose <strong>+ Add</strong> to place a panel on your dashboard. {guest ? "Guest choices last for this visit." : "Your choices are saved in this browser."}</p><div className="home-catalog-grid">{available.map(item => <article key={item.id}><h3>{item.title}</h3><div className="home-actions"><button type="button" aria-label={`Add ${item.title} to your dashboard`} onClick={() => add(item.id, item.title)}>+ Add</button></div></article>)}</div></>}
    </div></div>}
    <p role="status" className="home-note">{message}</p>
  </section>;
}

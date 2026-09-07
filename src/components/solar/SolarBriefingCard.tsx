import { useState, type ReactNode } from "react";
import type { SolarBriefing } from "@/lib/solar/briefing";
import type { NoaaScalesProduct } from "@/lib/solar/dataTypes";

export function SolarBriefingCard({ briefing, scales, children }: { briefing: SolarBriefing; scales?: NoaaScalesProduct; children: ReactNode }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Keep every simultaneous impact prominent; other evidence is available on demand.
  const primary = briefing.statements.filter((statement) => statement.kind === "impact");
  const shown = primary.length ? primary : briefing.statements.filter((statement) => statement.kind === "background").slice(0, 2);
  const remaining = briefing.statements.filter((statement) => !shown.includes(statement));
  const incomplete = briefing.missing.length > 0 || briefing.delayed.length > 0;
  return (
    <section aria-label="HF briefing" className={`rounded-2xl border bg-su-panel p-4 sm:p-6 ${briefing.tone === "impact" ? "border-su-danger/40" : "border-su-warning/25"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-su-muted">
        <p className="font-semibold uppercase tracking-widest text-su-warning">Your HF briefing · global context</p>
        <span role="status">{briefing.state === "loading" ? "Checking updates" : incomplete ? "Updates pending" : "Sources current"}</span>
      </div>
      <h2 className="mt-4 max-w-4xl text-2xl font-semibold leading-tight text-su-text sm:text-3xl">{briefing.title}</h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-su-text">
        {shown.map((statement) => <p key={statement.id}>{statement.text}</p>)}
        {!shown.length && <p>Propulse is checking for current measurements. Your station settings are unaffected.</p>}
        {moreOpen && remaining.map((statement) => <p key={statement.id}>{statement.text}</p>)}
      </div>
      {remaining.length > 0 && <button type="button" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} className="mt-2 min-h-11 rounded-lg px-3 text-sm text-su-info hover:bg-su-line/10">{moreOpen ? "Less context" : "Why this briefing?"}</button>}
      {incomplete && <p className="mt-3 text-xs leading-6 text-su-warning">{briefing.missing.length > 0 && `Fresh readings aren’t available yet for ${briefing.missing.join(", ")}. `}{briefing.delayed.length > 0 && `Updates are delayed for ${briefing.delayed.join(", ")}. `}Propulse checks again automatically; no setting needs changing. Unreported conditions remain uncertain.</p>}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-su-line/40 pt-4 text-xs text-su-muted" aria-label="Official NOAA scales">
        {[["R", "Radio blackout", scales?.radio_blackout?.scale], ["S", "Radiation storm", scales?.solar_radiation?.scale], ["G", "Geomagnetic", scales?.geomagnetic_storm?.scale]].map(([code, label, value]) => <p key={String(code)}><strong className={`mr-2 font-mono text-base ${typeof value === "number" && value > 0 ? "text-su-danger" : "text-su-text"}`}>{value == null ? `${code} —` : `${code}${value}`}</strong>{label}</p>)}
      </div>
      {children}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-su-muted">
        <p>Global conditions describe the backdrop. A contact depends on both stations and the path.</p>
        <button type="button" onClick={() => setEvidenceOpen(!evidenceOpen)} aria-expanded={evidenceOpen} aria-controls="solar-briefing-evidence" className="min-h-11 rounded-lg px-3 text-su-info hover:bg-su-line/10">{evidenceOpen ? "Hide sources" : "Sources & times"}</button>
      </div>
      {evidenceOpen && <div id="solar-briefing-evidence" className="mt-3 border-t border-su-line/40 pt-3 text-xs text-su-muted">
        <p className="mb-3">Each statement uses the products below. Delayed readings remain visible only within their product's usability window.</p>
        <ul className="space-y-3">{briefing.evidence.map((evidence) => <li key={evidence.sourceId}><a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="text-su-info underline">{evidence.label}</a> · {evidence.state}{evidence.observedAt && <> · {evidence.sourceId === "swpc-alerts" ? "Latest issue / empty response" : "Observation"} <time dateTime={evidence.observedAt}>{new Date(evidence.observedAt).toUTCString()}</time></>}<p className="mt-1 text-su-muted">{briefing.statements.filter((statement) => statement.sources.includes(evidence.sourceId)).map((statement) => statement.kind).filter((kind, i, all) => all.indexOf(kind) === i).join(" · ") || "Evidence coverage"}</p></li>)}</ul>
      </div>}
    </section>
  );
}

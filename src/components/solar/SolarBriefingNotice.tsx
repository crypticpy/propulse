import { useState, type ReactNode } from "react";
import type { SolarBriefing } from "@/lib/solar/briefing";
import type { NoaaScalesProduct } from "@/lib/solar/dataTypes";

/**
 * DS-05: the briefing is a one-row notice so the readings a ham actually wants
 * sit above the fold. Everything the old card said is still here, one click
 * away, in an inline expansion rather than a modal or a flyout.
 */
const TONES = {
  impact: { edge: "border-su-danger/50", mark: "text-su-danger", glyph: "▲" },
  watch: { edge: "border-su-warning/40", mark: "text-su-warning", glyph: "◆" },
  supportive: { edge: "border-su-line/40", mark: "text-su-success", glyph: "●" },
  unknown: { edge: "border-su-line/40", mark: "text-su-muted", glyph: "◇" },
} as const;

const CHIP = "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1";

export function SolarBriefingNotice({
  briefing,
  scales,
  kp,
  children,
}: {
  briefing: SolarBriefing;
  scales?: NoaaScalesProduct;
  kp?: number | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Keep every simultaneous impact prominent; other evidence follows it.
  const primary = briefing.statements.filter((statement) => statement.kind === "impact");
  const shown = primary.length ? primary : briefing.statements.filter((statement) => statement.kind === "background").slice(0, 2);
  const remaining = briefing.statements.filter((statement) => !shown.includes(statement));
  const incomplete = briefing.missing.length > 0 || briefing.delayed.length > 0;
  const delayedLine = [...briefing.delayed.map((label) => `${label} delayed`), ...briefing.missing.map((label) => `${label} unavailable`)].join(" · ");
  const tone = TONES[briefing.tone];
  const scaleChips = [
    ["R", "Radio blackout", scales?.radio_blackout?.scale],
    ["S", "Radiation storm", scales?.solar_radiation?.scale],
    ["G", "Geomagnetic", scales?.geomagnetic_storm?.scale],
  ] as const;
  return (
    <section aria-label="HF briefing" className={`rounded-2xl border bg-su-panel ${tone.edge}`}>
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:p-4 xl:flex-nowrap">
        <h2 className="flex min-w-0 items-start gap-2.5 text-sm font-semibold leading-snug text-su-text sm:basis-full sm:items-center sm:text-base xl:basis-auto xl:flex-1">
          <span aria-hidden="true" className={`shrink-0 text-base leading-none ${tone.mark}`}>{tone.glyph}</span>
          <span className="min-w-0">
            {briefing.title}
            {kp !== null && kp !== undefined && <span className="font-mono font-normal text-su-muted"> · Kp {kp.toFixed(1)}</span>}
          </span>
        </h2>
        <div role="group" aria-label="Official NOAA scales" className="flex flex-wrap items-center gap-2 text-xs text-su-muted">
          {scaleChips.map(([code, label, value]) => (
            <span key={code} className={`${CHIP} border-su-line/40 bg-su-input`}>
              <strong className={`font-mono text-sm ${typeof value === "number" && value > 0 ? "text-su-danger" : "text-su-text"}`}>{value == null ? `${code} —` : `${code}${value}`}</strong>
              {label}
            </span>
          ))}
          {briefing.state === "loading" ? (
            <span role="status" className={`${CHIP} border-su-line/40 bg-su-input`}>
              <span aria-hidden="true">↻</span>Checking updates
            </span>
          ) : incomplete ? (
            <span role="status" className={`${CHIP} border-su-warning/40 bg-su-input text-su-warning`}>
              <span aria-hidden="true">◇</span>Updates pending · {delayedLine}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="solar-briefing-detail"
          className="min-h-11 shrink-0 rounded-lg border border-su-line/40 px-4 text-sm font-semibold text-su-info hover:bg-su-line/10 sm:ml-auto xl:ml-0"
        >
          {open ? "Hide the briefing" : "Read the briefing"}
        </button>
      </div>
      {open && (
        <div id="solar-briefing-detail" className="border-t border-su-line/40 px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-su-text">
            {shown.map((statement) => <p key={statement.id}>{statement.text}</p>)}
            {!shown.length && <p>Propulse is checking for current measurements. Your station settings are unaffected.</p>}
            {remaining.map((statement) => <p key={statement.id}>{statement.text}</p>)}
          </div>
          {incomplete && <p className="mt-3 text-xs leading-6 text-su-warning">{briefing.missing.length > 0 && `Fresh readings aren’t available yet for ${briefing.missing.join(", ")}. `}{briefing.delayed.length > 0 && `Updates are delayed for ${briefing.delayed.join(", ")}. `}Propulse checks again automatically; no setting needs changing. Unreported conditions remain uncertain.</p>}
          <div className="mt-4 border-t border-su-line/40 pt-3 text-xs text-su-muted">
            <h3 className="text-xs font-semibold text-su-text">Sources &amp; times</h3>
            <p className="mb-3 mt-1">Each statement uses the products below. Delayed readings remain visible only within their product's usability window.</p>
            <ul className="space-y-3">{briefing.evidence.map((evidence) => <li key={evidence.sourceId}><a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="text-su-info underline">{evidence.label}</a> · {evidence.state}{evidence.observedAt && <> · {evidence.sourceId === "swpc-alerts" ? "Latest issue / empty response" : "Observation"} <time dateTime={evidence.observedAt}>{new Date(evidence.observedAt).toUTCString()}</time></>}<p className="mt-1 text-su-muted">{briefing.statements.filter((statement) => statement.sources.includes(evidence.sourceId)).map((statement) => statement.kind).filter((kind, i, all) => all.indexOf(kind) === i).join(" · ") || "Evidence coverage"}</p></li>)}</ul>
          </div>
          <p className="mt-4 text-xs text-su-muted">Global conditions describe the backdrop. A contact depends on both stations and the path.</p>
          {children}
        </div>
      )}
    </section>
  );
}

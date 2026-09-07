import type { ReactNode } from "react";
import type { SectionAccent } from "@/lib/themes/sectionAccent";

/**
 * DS-14: the tone is declared once with `data-accent` on the section and
 * painted by the shared `su-section-*` primitive in globals.css, so a
 * disclosure, a Home panel and every widget header inside them stay on one
 * hue. `danger` is reserved for alert states, so it is not offered here.
 */
export type SolarDisclosureAccent = Exclude<SectionAccent, "danger">;

export function SolarDisclosure({
  id,
  title,
  summary,
  open,
  onToggle,
  accent,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  accent: SolarDisclosureAccent;
  children: ReactNode;
}) {
  return (
    <section
      data-accent={accent}
      className="min-w-0 overflow-hidden rounded-2xl border border-su-line/40 bg-su-panel/70"
    >
      <div aria-hidden="true" className="su-section-rule" />
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-content`}
        onClick={onToggle}
        className="su-section-header flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left sm:px-5"
      >
        <span>
          <span className="block font-orbitron text-sm font-bold text-su-text sm:text-base">{title}</span>
          <span className="mt-0.5 block text-xs leading-5 text-su-muted/80 sm:text-sm">{summary}</span>
        </span>
        <span className="su-section-glyph flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-su-input" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div id={`${id}-content`} className="border-t border-su-line/20 p-3 sm:p-5">
          {children}
        </div>
      )}
    </section>
  );
}

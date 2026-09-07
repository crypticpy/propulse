import type { ReactNode } from "react";
import type { SectionAccent } from "@/lib/themes/sectionAccent";
import { SectionHeader } from "@/components/ui/SectionHeader";

/**
 * DS-14: the tone is declared once with `data-accent` on the section and
 * painted by the shared `su-section-*` primitive in globals.css, so a
 * disclosure, a Home panel and every widget header inside them stay on one
 * hue. `danger` is reserved for alert states, so it is not offered here.
 */
export type SolarDisclosureAccent = Exclude<SectionAccent, "danger">;

/**
 * DS-15: the band itself is `SectionHeader`, shared with Home, so the two
 * pages cannot drift. Everything else here is the disclosure behaviour.
 */
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
      <SectionHeader
        title={title}
        summary={summary}
        toggle={{ open, onToggle, controls: `${id}-content` }}
      />
      {open && (
        <div id={`${id}-content`} className="border-t border-su-line/20 p-3 sm:p-5">
          {children}
        </div>
      )}
    </section>
  );
}

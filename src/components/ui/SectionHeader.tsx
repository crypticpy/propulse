import type { ReactNode } from "react";

/**
 * DS-15: the one header band every section wears.
 *
 * The anatomy is rule → band → content (see docs/designs/design-system/README.md
 * § Section accents): the container declares its tone with `data-accent`, paints
 * the 3 px rule with `su-section-rule`, then this component paints the band —
 * an Orbitron title, a one-line summary, and a right-hand slot. Solar Pulse's
 * disclosures and Home's panels both render it, so the two pages cannot drift.
 *
 * Three shapes, one markup:
 * - `toggle` — the whole band is a `<button aria-expanded>` with the +/− glyph
 *   (Solar Pulse's `SolarDisclosure`).
 * - `element="summary"` — the band is the `<summary>` of a `<details>`.
 * - default — a plain band with a heading, for a panel that never collapses.
 */

/** The band's own element. `toggle` overrides this with a `<button>`. */
export type SectionHeaderElement = "div" | "summary";

export interface SectionHeaderProps {
  title: ReactNode;
  /** One line under the title. Omitted on a band that has nothing to add. */
  summary?: ReactNode;
  /**
   * Heading level for the title. `null` renders a `<span>`, which is what the
   * interactive band wants — its accessible name is the button's own.
   */
  as?: "h2" | "h3" | null;
  /** Right-hand slot: a status chip, a refresh control, a link, a glyph. */
  action?: ReactNode;
  element?: SectionHeaderElement;
  /** Present only on a disclosure band: makes the whole band the toggle. */
  toggle?: { open: boolean; onToggle: () => void; controls: string };
  className?: string;
}

const BAND =
  "su-section-header flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left sm:px-5";
const TITLE = "block font-orbitron text-sm font-bold text-su-text sm:text-base";
const SUMMARY = "mt-0.5 block text-xs leading-5 text-su-muted/80 sm:text-sm";

export function SectionHeader({
  title,
  summary,
  as,
  action,
  element = "div",
  toggle,
  className,
}: SectionHeaderProps) {
  // The interactive band keeps a flat span/span/span title block: its
  // accessible name comes from the button, so a heading there would announce
  // twice (and the DS-03 structure snapshot pins that markup).
  const Wrapper = toggle ? "span" : "div";
  const Title = toggle ? "span" : (as ?? "h2");
  const Summary = toggle ? "span" : "p";
  const band = className ? `${BAND} ${className}` : BAND;

  const block = (
    <Wrapper className="min-w-0">
      <Title className={TITLE}>{title}</Title>
      {summary !== undefined && <Summary className={SUMMARY}>{summary}</Summary>}
    </Wrapper>
  );

  if (toggle) {
    return (
      <button
        type="button"
        aria-expanded={toggle.open}
        aria-controls={toggle.controls}
        onClick={toggle.onToggle}
        className={band}
      >
        {block}
        <span
          className="su-section-glyph flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-su-input"
          aria-hidden="true"
        >
          {toggle.open ? "−" : "+"}
        </span>
      </button>
    );
  }

  const Band = element;
  return (
    <Band className={band}>
      {block}
      {action !== undefined && <div className="shrink-0">{action}</div>}
    </Band>
  );
}

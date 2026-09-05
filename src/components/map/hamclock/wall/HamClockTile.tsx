import type { CSSProperties, ReactNode } from "react";

/**
 * Props every registered wall tile accepts. Only the placeholder reads
 * `title`; live tiles source their own headline and ignore it.
 */
export interface WallTileProps {
  title?: string;
}

export interface HamClockTileProps {
  /** Tiny all-caps label in the title row. */
  title: string;
  /** Right-hand provenance note in the title row (count, feed, scope). */
  source?: string;
  /** CSS colour for the 2px state bar across the top of the tile. */
  state?: string;
  /** Let the tile absorb the rail's leftover height (cluster list). */
  grow?: boolean;
  /** Opening a report turns the whole tile into a dialog trigger. */
  onOpen?: () => void;
  /** Spoken label for the report trigger; defaults to the tile title. */
  openLabel?: string;
  children?: ReactNode;
}

/**
 * The wall tile: one tiny title, one hero value, one context line. Type and
 * colour come from the `--hc-*` theme tokens only — no Tailwind sizes here,
 * because the wall scales with viewport height rather than the text-scale
 * setting.
 *
 * When `onOpen` is set the tile carries a transparent full-bleed button rather
 * than nesting its heading inside a `<button>`, so the tile stays valid HTML
 * and screen readers still get the tile's own content plus one clear trigger.
 */
export function HamClockTile({
  title,
  source,
  state,
  grow,
  onOpen,
  openLabel,
  children,
}: HamClockTileProps) {
  return (
    <section
      className={`hc-tile${grow ? " hc-tile--grow" : ""}`}
      style={state ? ({ "--hc-state": state } as CSSProperties) : undefined}
    >
      {onOpen && (
        <button
          type="button"
          className="hc-tile-open"
          aria-haspopup="dialog"
          aria-label={openLabel ?? `${title} — open report`}
          onClick={onOpen}
        />
      )}
      <h3 className="hc-tile-title">
        <span>{title}</span>
        {source && <em>{source}</em>}
      </h3>
      {children}
    </section>
  );
}

export interface TileHeroProps {
  /** Theme colour class: `hc-good`, `hc-warn`, `hc-accent-text`, … */
  tone?: string;
  large?: boolean;
  /** Drop the top margin when the hero sits inside a hero row. */
  flush?: boolean;
  children: ReactNode;
}

export function TileHero({ tone, large, flush, children }: TileHeroProps) {
  return (
    <div
      className={`hc-hero hc-glow${large ? " hc-hero--lg" : ""}${
        flush ? " hc-hero--flush" : ""
      }${tone ? ` ${tone}` : ""}`}
    >
      {children}
    </div>
  );
}

export interface TileSubProps {
  children: ReactNode;
}

/** One context line under the hero: left fact, optional right fact. */
export function TileSub({ children }: TileSubProps) {
  return <div className="hc-sub">{children}</div>;
}

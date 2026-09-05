import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { heroSizeClass } from "./tokens";

/** Floor for the measure-and-shrink step: past this the hero would be
 * unreadable, so a value this long needs the report, not a smaller tile. */
const MIN_HERO_FIT = 0.6;
const HERO_FIT_STEP = 0.1;

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
  /** Force the biggest size regardless of string length (one-word verdicts). */
  large?: boolean;
  /** Drop the top margin when the hero sits inside a hero row. */
  flush?: boolean;
  children: ReactNode;
}

/**
 * The tile's one hero value. When `children` is a plain string the size
 * class is picked automatically from its length (`heroSizeClass`) so a value
 * such as "NO MAPPED ALERTS" never needs a caller to think about type scale.
 * `large` still wins when a tile deliberately wants the biggest word (a
 * one-word verdict) regardless of length.
 *
 * The `clamp()` tokens and the tile's `container-type: inline-size` (see
 * `hamclock-wall.css`) handle the common case. For the rare value that still
 * overflows after layout — a long callsign, an unusually wide font — a
 * `ResizeObserver` measures `scrollWidth` against `clientWidth` and steps an
 * inline `--hc-hero-fit` multiplier down until it fits or hits the floor.
 * `overflow: hidden` is never the fix for that overflow: shrinking is.
 */
export function TileHero({ tone, large, flush, children }: TileHeroProps) {
  const ref = useRef<HTMLDivElement>(null);
  const autoClass =
    !large && typeof children === "string" ? heroSizeClass(children) : null;

  // jsdom has no ResizeObserver; the class-based sizing above still applies,
  // this step only refines it for a real, laid-out browser.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      el.style.removeProperty("--hc-hero-fit");
      let step = 1;
      while (el.scrollWidth > el.clientWidth && step > MIN_HERO_FIT) {
        step = Math.max(MIN_HERO_FIT, step - HERO_FIT_STEP);
        el.style.setProperty("--hc-hero-fit", step.toFixed(2));
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div
      ref={ref}
      className={`hc-hero hc-glow${large ? " hc-hero--lg" : autoClass ? ` ${autoClass}` : ""}${
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

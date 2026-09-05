/**
 * On-demand web fonts for the non-default HamClock themes.
 *
 * `pulse` uses the three faces index.html already loads, so the default wall
 * pays nothing for the serif themes. Selecting `classic` or `brass` injects a
 * single stylesheet link for that theme's faces; the link is never removed,
 * because a theme the operator has tried once is a theme they can flip back
 * to instantly. Both themes declare a full fallback stack in
 * hamclock-themes.css, so the wall is readable before the face arrives.
 */

import type { HamClockTheme } from "@/stores/hamclockDisplayStore";

/** Weights match the `--hc-display-weight` and the mono weights the wall
 * stylesheet asks for (400 body, 600 emphasis, 700 headings/rows). */
export const HAMCLOCK_THEME_FONT_HREF: Readonly<
  Partial<Record<HamClockTheme, string>>
> = Object.freeze({
  classic:
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=IBM+Plex+Mono:wght@400;600;700&display=swap",
  brass:
    "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&family=IBM+Plex+Mono:wght@400;600;700&display=swap",
});

/**
 * Idempotently attach the web fonts a theme needs. Safe to call on every
 * render pass and from more than one component: the `data-hamclock-font`
 * marker makes the second call a no-op.
 */
export function ensureHamClockThemeFont(
  theme: HamClockTheme,
): HTMLLinkElement | null {
  const href = HAMCLOCK_THEME_FONT_HREF[theme];
  if (!href || typeof document === "undefined") return null;

  const selector = `link[data-hamclock-font="${theme}"]`;
  const existing = document.head.querySelector<HTMLLinkElement>(selector);
  if (existing) return existing;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.hamclockFont = theme;
  document.head.appendChild(link);
  return link;
}

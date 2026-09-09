/**
 * HamClock header hover chrome: base and hover ink (#783)
 *
 * `HamClockLayerChips.tsx`, `HamClockModeSwitch.tsx` and
 * `HamClockProjectionSwitch.tsx` shipped `text-gray-500` as the inactive-state
 * base and `hover:text-white` as the hover state. Both fail the legibility
 * floor and `hover:text-white` is a pure-white utility the legibility
 * standard forbids (`docs/designs/design-system/README.md` rule 7).
 *
 * This directory is deliberately standalone wall art with its own
 * Pulse/Classic/Brass themes and is carved out of the `--su-*` migration
 * (`docs/designs/design-system/README.md:193`, `scripts/check-design-tokens.mjs`'s
 * `EXCLUDE` list). Routing these three controls' ink through `--su-*` station
 * tokens would be exactly the migration that carve-out forbids, and for a
 * concrete reason: these controls hard-code dark chrome (`bg-black/40`,
 * `bg-white/5`, `bg-white/10`) that never lightens for the station "light"
 * theme, so a station ink calibrated for a light surface would permanently
 * fail against it. The fix instead routes rest ink through `--hc-dim` and
 * hover ink through `--hc-fg` -- the HamClock theme's own tokens, which vary
 * with Pulse/Classic/Brass, not with the station theme. Because of that,
 * there is no separate "--hc-bg under the light station theme" failure mode
 * to track here: `--hc-*` ink and `--hc-*` backdrop always come from the same
 * HamClock theme by construction.
 *
 * Measurement methodology (not a table of expected colours -- everything
 * below is derived from the component source and `hamclock-themes.css` at
 * test time, so a revert of either changes what gets measured):
 *
 * 1. Extract the inactive-state class string from each component via the
 *    `hover:text-[var(--hc-*)]` arbitrary-value form these three files use
 *    (the form this directory already had two examples of in prose,
 *    `var(--hc-dim)` / `var(--hc-fg)` in `wall/reports/BandHistoryChart.tsx`
 *    and the `hc-dim-text` utility in `wall/reports/BestBandReport.tsx` --
 *    the CSS-class form for rest ink, the arbitrary-value form for hover ink
 *    since no `hc-fg-text` hover utility exists).
 * 2. Pull the rest-ink variable out of the `hc-<name>-text` class and the
 *    hover-ink variable out of `hover:text-[var(--hc-<name>)]`.
 * 3. Composite the component's own fills into the backdrop before measuring:
 *    the mode/projection switch buttons sit inside a `bg-black/40` container
 *    over `--hc-bg`; the layer chip has no such container and paints
 *    `bg-white/5` (rest) / `bg-white/10` (hover) straight over `--hc-bg`. All
 *    three get `bg-white/10` on hover, replacing (not stacking on) whatever
 *    rest fill they had, matching how `background-color` actually cascades.
 * 4. Alpha-composite the ink itself when the HamClock theme's value is an
 *    `rgba()` (Pulse's `--hc-dim` is `rgba(255,255,255,0.46)`; Classic/Brass
 *    are opaque hex).
 * 5. Measure with production `stationContrast` from `stationTokens.ts`.
 *
 * Pulse's rest state is the tight case (composited ink ~`#797a7e` on a
 * ~`#060810` backdrop, ~4.67:1) -- see the PR body for the full per-theme
 * table this file's assertions reproduce.
 */

import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stationContrast } from "@/lib/themes/stationTokens";

/** The design system's floor for status/label text (`docs/designs/design-system`). */
const AA = 4.5;

// Anchor on this file's own location, not process.cwd() -- see
// auroraPurpleTintContrast.test.ts and repo memory no-test-job-in-ci: a
// subdir vitest invocation inherits the parent config and shifts cwd, which
// would make every readFileSync below throw. This file lives at
// src/components/map/hamclock/, four levels under the repo root.
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../../..");

const THEMES = ["pulse", "classic", "brass"] as const;
type HcTheme = (typeof THEMES)[number];

const THEMES_CSS_PATH = resolve(
  REPO_ROOT,
  "src/styles/hamclock-themes.css",
);

interface Site {
  file: string;
  what: string;
}

const SITES: Site[] = [
  {
    file: "src/components/map/hamclock/HamClockLayerChips.tsx",
    what: "a quick-layer chip (MUF/Aurora/DRAP/Wx)",
  },
  {
    file: "src/components/map/hamclock/HamClockModeSwitch.tsx",
    what: "a product-mode button (Activity/Sats/Wx)",
  },
  {
    file: "src/components/map/hamclock/HamClockProjectionSwitch.tsx",
    what: "a projection button (Flat/AZ/3D)",
  },
];

interface Fill {
  color: "white" | "black";
  alphaPct: number;
}

interface ParsedSite {
  inactiveClassString: string;
  /** e.g. "--hc-dim", read out of the source, not assumed. */
  restVar: string;
  /** e.g. "--hc-fg", read out of the source, not assumed. */
  hoverVar: string;
  containerFill: Fill | null;
  restFill: Fill | null;
  hoverFill: Fill;
}

/** Parses a `bg-(white|black)/NN` Tailwind fill out of a class string.
 * `hoverPrefixed` selects the `hover:bg-...` form vs. the bare rest-state
 * form (excluded via a negative lookbehind so `hover:bg-white/10` doesn't
 * also match the bare pattern). */
function parseFill(classString: string, hoverPrefixed: boolean): Fill | null {
  const re = hoverPrefixed
    ? /hover:bg-(white|black)\/(\d+)/
    : /(?<!hover:)\bbg-(white|black)\/(\d+)\b/;
  const m = classString.match(re);
  return m ? { color: m[1] as "white" | "black", alphaPct: Number(m[2]) } : null;
}

/** Reads the component source and extracts everything the contrast
 * assertions need, structurally -- no hardcoded ink names or colours. */
function parseSite(file: string): ParsedSite {
  const source = readFileSync(resolve(REPO_ROOT, file), "utf8");

  const containerMatch = source.match(/<div\s+className="([^"]*)"/);
  expect(
    containerMatch,
    `${file}: no outer <div className="..."> container found`,
  ).not.toBeNull();
  const containerClassName = containerMatch![1];

  // Anchor on the hover:text-[var(--hc-*)] form itself (rather than a
  // specific rest-ink class name) so this doesn't presuppose which --hc-*
  // variable the rest ink routes through.
  const inactiveMatch = source.match(
    /"([^"]*hover:text-\[var\(--hc-[a-z0-9]+\)\][^"]*)"/,
  );
  expect(
    inactiveMatch,
    `${file}: no inactive-state class string using the hover:text-[var(--hc-*)] form was found -- did the hover ink revert away from --hc-*?`,
  ).not.toBeNull();
  const inactiveClassString = inactiveMatch![1];

  const hoverVarMatch = inactiveClassString.match(
    /hover:text-\[var\(--hc-([a-z0-9]+)\)\]/,
  );
  expect(
    hoverVarMatch,
    `${file}: could not extract the hover-ink --hc-* variable from:\n${inactiveClassString}`,
  ).not.toBeNull();

  const restVarMatch = inactiveClassString.match(/\bhc-([a-z0-9]+)-text\b/);
  expect(
    restVarMatch,
    `${file}: could not find a hc-<name>-text rest-ink class in the inactive-state string:\n${inactiveClassString}`,
  ).not.toBeNull();

  const hoverFill = parseFill(inactiveClassString, true);
  expect(
    hoverFill,
    `${file}: no hover:bg-white|black/NN fill class found on the inactive-state string:\n${inactiveClassString}`,
  ).not.toBeNull();

  return {
    inactiveClassString,
    restVar: `--hc-${restVarMatch![1]}`,
    hoverVar: `--hc-${hoverVarMatch![1]}`,
    containerFill: parseFill(containerClassName, false),
    restFill: parseFill(inactiveClassString, false),
    hoverFill: hoverFill!,
  };
}

/** All `--hc-*` custom properties declared in one `[data-hamclock-theme="X"]`
 * block of `hamclock-themes.css`, read fresh every call -- values are never
 * copied into this file. */
function readThemeVars(theme: HcTheme): Record<string, string> {
  const css = readFileSync(THEMES_CSS_PATH, "utf8");
  const blockMatch = css.match(
    new RegExp(`\\[data-hamclock-theme="${theme}"\\]\\s*\\{([^}]*)\\}`),
  );
  expect(
    blockMatch,
    `No [data-hamclock-theme="${theme}"] block found in hamclock-themes.css`,
  ).not.toBeNull();
  const block = blockMatch![1];
  const vars: Record<string, string> = {};
  for (const m of block.matchAll(/(--hc-[a-z0-9]+):\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses either `#rrggbb` or `rgb[a](r, g, b[, a])` -- the two forms
 * `hamclock-themes.css` uses for `--hc-dim`/`--hc-fg`/`--hc-bg`. */
function parseCssColor(raw: string): Rgba {
  const hexMatch = raw.match(/^#([0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgbaMatch = raw.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (rgbaMatch) {
    return {
      r: Number(rgbaMatch[1]),
      g: Number(rgbaMatch[2]),
      b: Number(rgbaMatch[3]),
      a: rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1,
    };
  }
  throw new Error(`Unparseable CSS colour: "${raw}"`);
}

function colorRgb(name: "white" | "black"): [number, number, number] {
  return name === "white" ? [255, 255, 255] : [0, 0, 0];
}

/** Alpha-composites `overlay` (at `alpha`, 0-1) over the opaque `base`. */
function compositeOver(
  overlay: [number, number, number],
  alpha: number,
  base: [number, number, number],
): [number, number, number] {
  return [0, 1, 2].map(
    (i) => alpha * overlay[i] + (1 - alpha) * base[i],
  ) as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]): string {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Composites a (possibly translucent) ink value onto its backdrop and
 * returns an opaque hex ready for `stationContrast`. */
function compositeInk(
  raw: string,
  backdropRgb: [number, number, number],
): [number, number, number] {
  const c = parseCssColor(raw);
  if (c.a >= 1) return [c.r, c.g, c.b];
  return compositeOver([c.r, c.g, c.b], c.a, backdropRgb);
}

describe("HamClock header hover chrome routes through --hc-*, not --su-* (#783 / B3)", () => {
  it.each(SITES.map((site) => [site.what, site.file] as const))(
    "%s no longer ships the pre-fix or wrong-token-family utilities",
    (_what, file) => {
      const source = readFileSync(resolve(REPO_ROOT, file), "utf8");
      expect(
        source.includes("text-gray-500"),
        `${file} still ships text-gray-500 -- the unmeasured, floor-failing base this table replaced`,
      ).toBe(false);
      expect(
        source.includes("hover:text-white"),
        `${file} still ships hover:text-white -- a pure-white utility the legibility standard forbids`,
      ).toBe(false);
      expect(
        source.includes("text-su-muted"),
        `${file} ships text-su-muted -- this directory keeps --hc-* ink (README:193), not --su-* station tokens`,
      ).toBe(false);
      expect(
        source.includes("hover:text-su-text"),
        `${file} ships hover:text-su-text -- this directory keeps --hc-* ink (README:193), not --su-* station tokens`,
      ).toBe(false);
    },
  );
});

describe("HamClock header hover chrome clears the label floor on the real composite, per HamClock theme (#783 / B1+B2)", () => {
  const cases = SITES.flatMap((site) =>
    THEMES.map((theme) => [site.what, theme, site] as const),
  );

  it.each(cases)(
    "%s clears 4.5:1 at rest and on hover in the %s HamClock theme",
    (what, theme, site) => {
      const parsed = parseSite(site.file);
      const vars = readThemeVars(theme);

      expect(
        vars["--hc-bg"],
        `${theme} theme does not declare --hc-bg`,
      ).toBeDefined();
      expect(
        vars[parsed.restVar],
        `${theme} theme does not declare ${parsed.restVar} (read from ${site.file})`,
      ).toBeDefined();
      expect(
        vars[parsed.hoverVar],
        `${theme} theme does not declare ${parsed.hoverVar} (read from ${site.file})`,
      ).toBeDefined();

      const host = parseCssColor(vars["--hc-bg"]);
      expect(
        host.a,
        `${theme} theme's --hc-bg is not opaque -- compositing assumes an opaque host`,
      ).toBe(1);
      const hostRgb: [number, number, number] = [host.r, host.g, host.b];

      // The component's own container fill (bg-black/40 for the switches,
      // none for the layer chip), composited over the HamClock theme's --hc-bg.
      const containerBackdropRgb = parsed.containerFill
        ? compositeOver(
            colorRgb(parsed.containerFill.color),
            parsed.containerFill.alphaPct / 100,
            hostRgb,
          )
        : hostRgb;

      // Rest state: the chip's own bg-white/5 over the container backdrop;
      // the switches have no rest-state fill, so the container backdrop
      // itself is what the rest ink sits on.
      const restBackdropRgb = parsed.restFill
        ? compositeOver(
            colorRgb(parsed.restFill.color),
            parsed.restFill.alphaPct / 100,
            containerBackdropRgb,
          )
        : containerBackdropRgb;

      // Hover state: hover:bg-white/10 replaces the rest-state background
      // (same CSS property, higher-specificity pseudo-class selector), so it
      // composites directly over the container backdrop, not over restBackdropRgb.
      const hoverBackdropRgb = compositeOver(
        colorRgb(parsed.hoverFill.color),
        parsed.hoverFill.alphaPct / 100,
        containerBackdropRgb,
      );

      const restInkRgb = compositeInk(vars[parsed.restVar], restBackdropRgb);
      const hoverInkRgb = compositeInk(vars[parsed.hoverVar], hoverBackdropRgb);

      const restBackdropHex = toHex(restBackdropRgb);
      const hoverBackdropHex = toHex(hoverBackdropRgb);
      const restInkHex = toHex(restInkRgb);
      const hoverInkHex = toHex(hoverInkRgb);

      const restContrast = stationContrast(restInkHex, restBackdropHex);
      const hoverContrast = stationContrast(hoverInkHex, hoverBackdropHex);

      expect(
        restContrast,
        `${what} / ${theme}: rest ink ${restInkHex} (${parsed.restVar}) on composited backdrop ${restBackdropHex} measures ${restContrast.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
      expect(
        hoverContrast,
        `${what} / ${theme}: hover ink ${hoverInkHex} (${parsed.hoverVar}) on composited backdrop ${hoverBackdropHex} measures ${hoverContrast.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );
});

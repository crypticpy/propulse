/**
 * BridgeInfoPage's FeatureCard accents (#799)
 *
 * `FeatureCard` used to take a raw hex `accentColor` prop and build every
 * derived colour (`${accentColor}15`, `${accentColor}08`, plain
 * `accentColor` as `color:`) by string concatenation: `#ff6b35` (CAT
 * Control), `#00ff88` (DX Cluster Relay), `#44ddff` (WSJT-X Integration),
 * `#aa44ff` (Multi-Operator Sync, the pre-#787 aurora-purple literal). This
 * is the page-level fix #789 did for SystemHealthPage's `ACCENT_TOKEN_COLORS`
 * map, applied here: `FeatureCard` now takes an `accent` key into
 * `FEATURE_ACCENTS`, and every derived colour is a `rgb(var(--su-*-rgb))`
 * token (plain for the rule/icon, `rgb(var(...) / N)` for the tints).
 *
 * The `orange` card is the one case that can't be measured statically the
 * same way: `--su-accent` is the operator's own customisable brand colour
 * (`src/lib/themes/stationTokens.ts`), so its callout text resolves through
 * `--su-accent-text` (accent if it clears 4.5:1 against `panel`, else
 * `info`) rather than the raw accent -- see the doc comment on
 * `FEATURE_ACCENTS` in BridgeInfoPage.tsx. This file spot-checks the
 * *default* `#ff6b35` accent (the app's shipped default) against the real
 * surface in all four themes; a future custom accent is only guaranteed
 * safe against `panel`, per `stationTokens()`'s own derivation, not `canvas`.
 *
 * Note on jsdom: assigning `rgb(var(--x-rgb))` (no fallback needed, unlike
 * a hex literal jsdom's CSSOM would normalise) to `style.background` /
 * `style.color` is stored verbatim -- there is nothing to normalise since
 * jsdom can't resolve `var()`. That is what makes the positive
 * `STATION_TOKEN_COLOR` match below a real guard: a regression to a hex
 * literal would still read back the same *shape* of string via
 * `style.color`/`style.background` (jsdom won't invent an error), so the
 * assertion is `toMatch(STATION_TOKEN_COLOR)` (positive) and
 * `not.toMatch(HEX_COLOR)` (negative), and the SVG `stroke` attribute is
 * read with `getAttribute` (never CSSOM-touched at all) for the same
 * reason `SystemHealthPage.accent.test.tsx` does.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BridgeInfoPage } from "@/pages/BridgeInfoPage";
import {
  stationContrast,
  stationPalettes,
  stationTokens,
} from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";
import type { ColorBlindMode } from "@/lib/themes/colorblind";

// This file lives at src/pages/, two levels under the repo root -- see the
// identical anchoring comment in auroraPurpleTintContrast.test.ts.
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const AA = 4.5;
const THEMES = Object.keys(stationPalettes) as ThemeId[];

const HEX_COLOR = /#[0-9a-fA-F]{3,8}/;
const STATION_TOKEN_COLOR = /^rgb\(var\(--su-[a-z-]+-rgb\)(?: \/ [\d.]+)?\)$/;

const EXPECTED: Record<
  string,
  { edgeVar: string; baseVar: string; textVar: string }
> = {
  "CAT Control": {
    edgeVar: "--su-accent-edge-rgb",
    baseVar: "--su-accent-rgb",
    textVar: "--su-accent-text-rgb",
  },
  "DX Cluster Relay": {
    edgeVar: "--su-success-rgb",
    baseVar: "--su-success-rgb",
    textVar: "--su-success-rgb",
  },
  "WSJT-X Integration": {
    edgeVar: "--su-info-rgb",
    baseVar: "--su-info-rgb",
    textVar: "--su-info-rgb",
  },
  "Multi-Operator Sync": {
    edgeVar: "--su-purple-rgb",
    baseVar: "--su-purple-rgb",
    textVar: "--su-purple-rgb",
  },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <BridgeInfoPage />
    </MemoryRouter>,
  );
}

function compositeOnSurface(hex: string, alpha: number, surface: string) {
  const channels = (value: string) =>
    [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16));
  const front = channels(hex);
  const back = channels(surface);
  return `#${front
    .map((channel, index) =>
      Math.round(channel * alpha + back[index] * (1 - alpha))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

describe("BridgeInfoPage source still ships FEATURE_ACCENTS (#799)", () => {
  it("has no hex accentColor literal left on the capability cards", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/pages/BridgeInfoPage.tsx"),
      "utf8",
    );
    // The four literals #799 removed from the FeatureCard call sites.
    // (#00ff88 also appears elsewhere in this file as the unrelated
    // connection-status dot -- out of scope, see the PR -- so this checks
    // the FeatureCard prop specifically, not a file-wide hex ban.)
    expect(source).not.toContain('accentColor="#ff6b35"');
    expect(source).not.toContain('accentColor="#00ff88"');
    expect(source).not.toContain('accentColor="#44ddff"');
    expect(source).not.toContain('accentColor="#aa44ff"');
    expect(source).toContain('accent="orange"');
    expect(source).toContain('accent="green"');
    expect(source).toContain('accent="cyan"');
    expect(source).toContain('accent="purple"');
  });
});

describe("FeatureCard accent tokens render as station tokens, never hex (#799)", () => {
  it("maps every capability card's rule, icon, and callout to its exact --su-*-rgb token", () => {
    const { container } = renderPage();
    const cards = container.querySelectorAll(".overflow-hidden");
    expect(cards.length).toBeGreaterThanOrEqual(4);

    const seenTitles = new Set<string>();
    for (const card of Array.from(cards)) {
      const heading = within(card as HTMLElement).queryByRole("heading", {
        level: 3,
      });
      const title = heading?.textContent ?? "";
      const expected = EXPECTED[title];
      if (!expected) continue;
      seenTitles.add(title);

      const el = card as HTMLElement;

      // Top rule -- a graphical object, held to the 3:1 floor, so it reads
      // the edge-adjusted token (--su-accent-edge for orange, #799 B1).
      const rule = el.querySelector(".h-1") as HTMLElement | null;
      expect(rule, `rule not found for "${title}"`).not.toBeNull();
      expect(rule!.style.background).not.toMatch(HEX_COLOR);
      expect(rule!.style.background).toBe(`rgb(var(${expected.edgeVar}))`);

      // Icon: SVG stroke attribute (never CSSOM-normalised). Same edge token
      // as the rule -- also a graphical object.
      const svg = el.querySelector("svg[width='20']");
      expect(svg, `icon svg not found for "${title}"`).not.toBeNull();
      const stroke = svg!.getAttribute("stroke") ?? "";
      expect(stroke).not.toMatch(HEX_COLOR);
      expect(stroke).toBe(`rgb(var(${expected.edgeVar}))`);

      // Callout text + tint.
      const callout = el.querySelector(".rounded-lg.p-3") as HTMLElement | null;
      expect(callout, `callout not found for "${title}"`).not.toBeNull();
      expect(callout!.style.color).not.toMatch(HEX_COLOR);
      expect(callout!.style.color).toMatch(STATION_TOKEN_COLOR);
      expect(callout!.style.color).toBe(`rgb(var(${expected.textVar}))`);
      expect(callout!.style.background).not.toMatch(HEX_COLOR);
      expect(callout!.style.background).toBe(
        `rgb(var(${expected.baseVar}) / 0.03)`,
      );
    }

    expect(seenTitles).toEqual(new Set(Object.keys(EXPECTED)));
  });
});

describe("FeatureCard callout contrast on the real composite surface (#799)", () => {
  // Callout text sits on its own low-alpha tint (`rgb(var(--su-x-rgb) /
  // 0.03)`), which itself paints over Card's default glass
  // (`bg-su-line/10`), which paints over the page's `bg-cosmic-gradient`
  // (canvas <-> panel). This measures the real triple composite with
  // production `stationContrast`/`stationPalettes` -- not a fixture.
  const DEFAULT_ACCENT_HEX = "#ff6b35"; // stationTokens.ts's DEFAULT_ACCENT_HEX

  it.each(THEMES)(
    "orange (default accent, via --su-accent-text) clears 4.5:1 on panel/canvas on %s",
    (theme) => {
      const palette = stationPalettes[theme];
      const accentOkOnPanel = stationContrast(DEFAULT_ACCENT_HEX, palette.panel) >= AA;
      const accentText = accentOkOnPanel ? DEFAULT_ACCENT_HEX : palette.info;
      for (const pageBg of [palette.panel, palette.canvas]) {
        const glass = compositeOnSurface(palette.line, 0.1, pageBg);
        const calloutBg = compositeOnSurface(DEFAULT_ACCENT_HEX, 0.03, glass);
        expect(stationContrast(accentText, calloutBg)).toBeGreaterThanOrEqual(AA);
      }
    },
  );

  it.each(THEMES)(
    "green/cyan/purple (station palette tones, colour-blind mode: none) clear 4.5:1 on panel/canvas on %s",
    (theme) => {
      const palette = stationPalettes[theme];
      for (const hex of [palette.success, palette.info, palette.purple]) {
        for (const pageBg of [palette.panel, palette.canvas]) {
          const glass = compositeOnSurface(palette.line, 0.1, pageBg);
          const calloutBg = compositeOnSurface(hex, 0.03, glass);
          expect(stationContrast(hex, calloutBg)).toBeGreaterThanOrEqual(AA);
        }
      }
    },
  );

  it("the old #aa44ff literal actually failed this floor (documents the bug this test guards)", () => {
    const palette = stationPalettes.dark;
    const glass = compositeOnSurface(palette.line, 0.1, palette.panel);
    const calloutBg = compositeOnSurface("#aa44ff", 0.03, glass);
    expect(stationContrast("#aa44ff", calloutBg)).toBeLessThan(AA);
  });
});

describe("FeatureCard callout contrast: success role across colour-blind modes (#799, #811)", () => {
  const MODES: ColorBlindMode[] = [
    "none",
    "deuteranopia",
    "protanopia",
    "tritanopia",
  ];
  const DEFAULT_ACCENT_HEX = "#ff6b35";

  for (const theme of THEMES) {
    for (const mode of MODES) {
      it(`${theme}/${mode} success callout clears 4.5:1 on panel/canvas`, () => {
        const palette = stationPalettes[theme];
        const tokens = stationTokens(theme, DEFAULT_ACCENT_HEX, mode);
        const success = tokens["--su-success"] as string;
        for (const pageBg of [palette.panel, palette.canvas]) {
          const glass = compositeOnSurface(palette.line, 0.1, pageBg);
          const calloutBg = compositeOnSurface(success, 0.03, glass);
          expect(stationContrast(success, calloutBg)).toBeGreaterThanOrEqual(
            AA,
          );
        }
      });
    }
  }
});

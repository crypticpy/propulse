/**
 * `getConditionColor` (#799, #810)
 *
 * #787 gave `aurora-purple` a per-theme `--su-purple` token; #799 moved
 * `getConditionColor("Aurora")` off the pre-#787 literal `#aa44ff` (which
 * measured 3.93/3.81/4.30 as bare text on `panel` across themes) onto that
 * token. #810 finishes the function: `Excellent`/`Good`/`Fair`/`Poor`/the
 * default branch move off their own non-adaptive literals
 * (`#00ff88`/`#44dd66`/`#ffaa00`/`#ff4455`/`#666666`) onto
 * `--su-success-rgb`/`--su-warning-rgb`/`--su-danger-rgb`/`--su-muted-rgb`
 * -- see `bands.ts`'s doc comment on `getConditionColor` for why each role
 * was picked. Both consumers (`InsightsBar.tsx`, `PredictionsCard.tsx`)
 * apply the return value as a CSS `color`/`backgroundColor`, never a
 * canvas/SVG attribute needing a real hex, so a token string is a valid
 * return for every branch.
 *
 * This measures every branch's resolved token against the production
 * `stationPalettes` roles -- not a fixture -- via the real `stationContrast`
 * formula, on every surface the two consumers actually render on:
 *  - bare `panel`/`canvas` (never used bare by either consumer today, but a
 *    future plain-text consumer would land here)
 *  - `PredictionsCard`'s real surface: the `Card` component's default glass
 *    (`bg-su-line/10`) over the page background, composited the same way
 *    `auroraPurpleTintContrast.test.ts` does for other `aurora-purple` sites.
 *    `PredictionsCard` no longer fills its badges (#810 -- a `rgb(var(...) /
 *    alpha)` tint was measured and the light theme's `warning` role failed
 *    4.5:1 on the canvas composite at 4.40:1), so this is bare text on the
 *    glass, matching what ships.
 *  - colour-blind modes for `success`/`warning`/`danger` (the three roles
 *    `stationTokens()` rewrites under a colour-blind mode): recorded via
 *    `it.todo` with the measured ratio, not asserted -- this is the
 *    systemic `toneOnPanel` gap tracked by #811 (its guarantee is against
 *    bare `panel` only, not this glass composite), not something #810
 *    introduces.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getConditionColor } from "@/lib/utils/bands";
import {
  stationContrast,
  stationPalettes,
  stationTokens,
} from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";
import type { ColorBlindMode } from "@/lib/themes/colorblind";
import type { VHFCondition } from "@/types/solar";

const AA = 4.5;
const THEMES = Object.keys(stationPalettes) as ThemeId[];
const COLOR_BLIND_MODES: ColorBlindMode[] = [
  "protanopia",
  "deuteranopia",
  "tritanopia",
];
const HEX_COLOR = /#[0-9a-fA-F]{3,8}/;

// Anchor on this file's own location -- see the identical comment in
// auroraPurpleTintContrast.test.ts for why (a subdir vitest run would shift
// cwd and break a process.cwd()-relative read).
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

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

describe("getConditionColor(\"Aurora\") (#799)", () => {
  it("returns the --su-purple-rgb token, not a hex literal", () => {
    const color = getConditionColor("Aurora");
    expect(color).toBe("rgb(var(--su-purple-rgb))");
    expect(color).not.toMatch(HEX_COLOR);
  });

  it("leaves the other conditions on their own tokens (#810 finishes the function)", () => {
    expect(getConditionColor("Excellent")).toBe("rgb(var(--su-success-rgb))");
    expect(getConditionColor("Good")).toBe("rgb(var(--su-success-rgb))");
    expect(getConditionColor("Fair")).toBe("rgb(var(--su-warning-rgb))");
    expect(getConditionColor("Poor")).toBe("rgb(var(--su-danger-rgb))");
  });

  it.each(THEMES)(
    "the resolved purple token clears the status-text floor as bare text on %s panel/canvas",
    (theme) => {
      const palette = stationPalettes[theme];
      expect(stationContrast(palette.purple, palette.panel)).toBeGreaterThanOrEqual(AA);
      expect(stationContrast(palette.purple, palette.canvas)).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(THEMES)(
    "clears the floor on PredictionsCard's real surface (Card's bg-su-line/10 glass) over panel/canvas on %s",
    (theme) => {
      const palette = stationPalettes[theme];
      const glassOnPanel = compositeOnSurface(palette.line, 0.1, palette.panel);
      const glassOnCanvas = compositeOnSurface(palette.line, 0.1, palette.canvas);
      expect(stationContrast(palette.purple, glassOnPanel)).toBeGreaterThanOrEqual(AA);
      expect(stationContrast(palette.purple, glassOnCanvas)).toBeGreaterThanOrEqual(AA);
    },
  );

  it("the old #aa44ff literal actually failed this floor (documents the bug this test guards)", () => {
    // Reproduces #787's cited numbers for the record; not a guard on its own.
    expect(stationContrast("#aa44ff", stationPalettes.dark.panel)).toBeLessThan(AA);
    expect(stationContrast("#aa44ff", stationPalettes.light.panel)).toBeLessThan(AA);
    expect(stationContrast("#aa44ff", stationPalettes.midnight.panel)).toBeLessThan(AA);
  });

  it("InsightsBar.tsx's bestCondition can never be Aurora (the Aurora branch is unreachable there)", () => {
    // InsightsBar's `goodBands` filter only keeps bands whose day/night
    // condition is "Good" or "Excellent", and `bestCondition` is derived
    // from that same pair -- so `getConditionColor(bestCondition)` at
    // InsightsBar.tsx:~356 never actually receives "Aurora". No behavioural
    // change was needed there for #799; this pins that fact so a future
    // edit widening the filter doesn't silently reintroduce the unreachable
    // literal path without anyone measuring it.
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/dx/InsightsBar.tsx"),
      "utf8",
    );
    const filterMatch = source.match(
      /const goodBands = useMemo\(\(\) => \{[\s\S]*?\n {2}\}, \[currentKp, currentSfi\]\);/,
    );
    expect(filterMatch, "goodBands useMemo block not found -- InsightsBar.tsx shape changed").not.toBeNull();
    const filterBody = filterMatch![0];
    expect(filterBody).toContain('"Good"');
    expect(filterBody).toContain('"Excellent"');
    expect(filterBody).not.toContain('"Aurora"');
  });
});

/** The four roles `getConditionColor`'s non-Aurora branches resolve to. */
const ROLES = ["success", "warning", "danger", "muted"] as const;

describe(
  'getConditionColor("Excellent"/"Good"/"Fair"/"Poor"/default) (#810)',
  () => {
    it("returns su-* tokens, never hex, for every remaining branch", () => {
      expect(getConditionColor("Excellent")).toBe("rgb(var(--su-success-rgb))");
      expect(getConditionColor("Excellent")).not.toMatch(HEX_COLOR);
      expect(getConditionColor("Good")).toBe("rgb(var(--su-success-rgb))");
      expect(getConditionColor("Good")).not.toMatch(HEX_COLOR);
      expect(getConditionColor("Fair")).toBe("rgb(var(--su-warning-rgb))");
      expect(getConditionColor("Fair")).not.toMatch(HEX_COLOR);
      expect(getConditionColor("Poor")).toBe("rgb(var(--su-danger-rgb))");
      expect(getConditionColor("Poor")).not.toMatch(HEX_COLOR);
      // The declared type (`BandCondition | VHFCondition`, src/types/solar.ts)
      // is exactly Excellent/Good/Fair/Poor/Aurora -- the `default` branch is
      // a defensive fallback with no legitimate caller, exercised here only
      // via a deliberately-invalid cast.
      expect(getConditionColor("Unknown" as VHFCondition)).toBe(
        "rgb(var(--su-muted-rgb))",
      );
      expect(getConditionColor("Unknown" as VHFCondition)).not.toMatch(HEX_COLOR);
    });

    it.each(THEMES)(
      "every role clears the status-text floor as bare text on %s panel/canvas",
      (theme) => {
        const palette = stationPalettes[theme];
        for (const role of ROLES) {
          const value = palette[role];
          expect(stationContrast(value, palette.panel)).toBeGreaterThanOrEqual(AA);
          expect(stationContrast(value, palette.canvas)).toBeGreaterThanOrEqual(AA);
        }
      },
    );

    it.each(THEMES)(
      "every role clears the floor on PredictionsCard's real surface (Card's bg-su-line/10 glass, no fill) over panel/canvas on %s",
      (theme) => {
        const palette = stationPalettes[theme];
        const glassOnPanel = compositeOnSurface(palette.line, 0.1, palette.panel);
        const glassOnCanvas = compositeOnSurface(palette.line, 0.1, palette.canvas);
        for (const role of ROLES) {
          const value = palette[role];
          expect(stationContrast(value, glassOnPanel)).toBeGreaterThanOrEqual(AA);
          expect(stationContrast(value, glassOnCanvas)).toBeGreaterThanOrEqual(AA);
        }
      },
    );

    it("the old literals actually failed this floor on the light theme's real surface (documents the bug this test guards)", () => {
      // Reproduces this session's own measured numbers for the record; not a
      // guard on its own. On glass-over-panel: #00ff88 1.10, #44dd66 1.46,
      // #ffaa00 1.56, #ff4455 2.76 -- all clearly below 4.5:1. The old
      // default literal, #666666, was closer (4.69 on glass-over-panel) but
      // still failed on glass-over-canvas (4.35); asserted there instead.
      const palette = stationPalettes.light;
      const glassOnPanel = compositeOnSurface(palette.line, 0.1, palette.panel);
      const glassOnCanvas = compositeOnSurface(palette.line, 0.1, palette.canvas);
      expect(stationContrast("#00ff88", glassOnPanel)).toBeLessThan(AA);
      expect(stationContrast("#44dd66", glassOnPanel)).toBeLessThan(AA);
      expect(stationContrast("#ffaa00", glassOnPanel)).toBeLessThan(AA);
      expect(stationContrast("#ff4455", glassOnPanel)).toBeLessThan(AA);
      expect(stationContrast("#666666", glassOnCanvas)).toBeLessThan(AA);
    });

    // A `rgb(var(--x-rgb) / alpha)` badge tint was measured as the #810
    // fix for PredictionsCard's dropped `${hex}20` suffix trick, and
    // rejected: at alpha 0.12 the light theme's `warning` role fails this
    // exact floor on the canvas composite (4.40:1, computed the same way
    // as the passing assertions above). PredictionsCard drops the fill for
    // every condition instead (matching the Aurora badge, #799/#807), so
    // there is no tint to test here -- this documents why the tint path
    // was not taken.
    it("the rejected tint alpha (0.12) actually failed on light/warning/canvas (documents why fills were dropped)", () => {
      const palette = stationPalettes.light;
      const glassOnCanvas = compositeOnSurface(palette.line, 0.1, palette.canvas);
      const tintOnGlass = compositeOnSurface(palette.warning, 0.12, glassOnCanvas);
      expect(stationContrast(palette.warning, tintOnGlass)).toBeLessThan(AA);
    });

    // `stationTokens()` rewrites `success`/`warning`/`danger` under a
    // colour-blind mode via `toneOnPanel`, whose guarantee is against bare
    // `panel` only (stationTokens.ts) -- not this glass composite, which is
    // what PredictionsCard's badges actually render against. Recorded, not
    // asserted: this is the systemic gap tracked by #811, not something
    // #810 introduces (`getConditionColor` never touches colour-blind
    // tokens itself).
    for (const theme of THEMES) {
      const palette = stationPalettes[theme];
      const glassOnPanel = compositeOnSurface(palette.line, 0.1, palette.panel);
      const glassOnCanvas = compositeOnSurface(palette.line, 0.1, palette.canvas);
      for (const mode of COLOR_BLIND_MODES) {
        const tokens = stationTokens(theme, "#ff6b35", mode);
        for (const role of ["success", "warning", "danger"] as const) {
          const value = tokens[`--su-${role}`] as unknown as string;
          const ratioPanel = stationContrast(value, glassOnPanel);
          const ratioCanvas = stationContrast(value, glassOnCanvas);
          it.todo(
            `${role} on ${theme}/${mode} glass composite: panel ${ratioPanel.toFixed(2)}${
              ratioPanel < AA ? " FAIL" : ""
            }, canvas ${ratioCanvas.toFixed(2)}${ratioCanvas < AA ? " FAIL" : ""} (#811)`,
          );
        }
      }
    }
  },
);

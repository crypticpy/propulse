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
 * formula, on every surface either consumer actually renders on. Of the two
 * grep hits for `getConditionColor`, only one is a live render: `PredictionsCard`
 * is exported from the `dx` barrel but never mounted anywhere in the app (its
 * only renders are its own two test files); `InsightsBar` (-> `DXConsole.tsx`
 * -> `OpsConsole`/`PropSphere`) is the real consumer. Its root uses
 * `bg-su-line/10 backdrop-blur-sm` (`InsightsBar.tsx:238`), the same
 * composite `Card.tsx:43` uses, so the numbers below transfer either way --
 * they are captioned for InsightsBar since that is the surface actually
 * rendering in production:
 *  - bare `panel`/`canvas` (never used bare by either consumer today, but a
 *    future plain-text consumer would land here)
 *  - InsightsBar's real surface: `bg-su-line/10` glass over the page
 *    background, composited the same way `auroraPurpleTintContrast.test.ts`
 *    does for other `aurora-purple` sites, plus its **hover** state, which
 *    stacks a second `su-line/10` layer on the Bands section
 *    (`InsightsBar.tsx:324`) -- unmeasured before this pass, now recorded in
 *    the single colour-blind/composite table below.
 *  - colour-blind modes for `success`/`warning`/`danger` (the three roles
 *    `stationTokens()` rewrites under a colour-blind mode): recorded, not
 *    asserted, via one computed table (not per-cell `it.todo`s) -- this is
 *    the systemic `toneOnPanel` gap tracked by #811. It is not something
 *    `getConditionColor` itself introduces (the function never touches
 *    colour-blind tokens), but #810 *does* newly expose these four roles to
 *    it: before this PR, Excellent/Good/Fair/Poor were non-adaptive hex
 *    literals that never routed through `toneOnPanel` at all; after it, they
 *    do, for the first time. See `bands.ts`'s `getConditionColor` doc
 *    comment and #811 for the before/after numbers.
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
    "clears the floor on the Card component's real glass surface (bg-su-line/10, same composite InsightsBar.tsx:238 uses) over panel/canvas on %s -- Aurora is only reachable via PredictionsCard, never InsightsBar",
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
      "every role clears the floor on InsightsBar's real surface (bg-su-line/10 glass, same composite Card.tsx:43 uses, no fill) over panel/canvas on %s",
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

    // A `rgb(var(--x-rgb) / alpha)` badge tint was measured as the #810 fix
    // for PredictionsCard's dropped `${hex}20` suffix trick. At alpha 0.12
    // the light theme's `warning` role fails this exact floor on the canvas
    // composite (4.40:1, computed the same way as the passing assertions
    // above) -- that failure is real and reproduced here, but it is not the
    // reason the tint was rejected: design-system README rule 7 forbids
    // "saturated text on a saturated background," which token ink on a
    // same-hue token tint always is, at any alpha. (The sweep below shows
    // the tint clears 4.5:1 at alpha <= 0.10 everywhere -- lowering the
    // alpha is not a fix for a rule-7 violation.) PredictionsCard drops the
    // fill for every condition instead (matching the Aurora badge,
    // #799/#807), so there is no tint to test in production; this documents
    // the alpha sweep for the record.
    it("the rejected tint alpha (0.12) actually failed on light/warning/canvas, and the sweep shows lower alphas would have passed (documents the rule-7 rationale, not an alpha-tuning invitation)", () => {
      const palette = stationPalettes.light;
      const glassOnCanvas = compositeOnSurface(palette.line, 0.1, palette.canvas);
      const failingTint = compositeOnSurface(palette.warning, 0.12, glassOnCanvas);
      expect(stationContrast(palette.warning, failingTint)).toBeLessThan(AA);

      // Worst cell per alpha across every role is light/canvas/warning.
      // Values: 0.06 -> 4.79, 0.08 -> 4.65, 0.10 -> 4.53, 0.12 -> 4.40 (the
      // failure above), 0.16 -> 4.16. Recorded, not gated -- rule 7 is the
      // reason to avoid this pattern, not any one alpha's number.
      for (const alpha of [0.06, 0.08, 0.1, 0.16]) {
        const tint = compositeOnSurface(palette.warning, alpha, glassOnCanvas);
        console.info(
          `alpha ${alpha} light/canvas/warning: ${stationContrast(palette.warning, tint).toFixed(2)}`,
        );
      }
    });

    // `stationTokens()` rewrites `success`/`warning`/`danger` under a
    // colour-blind mode via `toneOnPanel`, whose guarantee is against bare
    // `panel` only (`stationTokens.ts` ~:152) -- not the glass composite
    // InsightsBar actually renders against, nor its hover state (a second
    // `su-line/10` layer, `InsightsBar.tsx:324`). This is the systemic gap
    // tracked by #811 (`getConditionColor` itself never touches
    // colour-blind tokens), but #810 newly exposes Excellent/Good/Fair/Poor
    // to it -- see `bands.ts`'s doc comment for the framing. Recorded as one
    // computed table via `console.info`, not 36 standing `it.todo` entries
    // and not gated on any cell, since fixing this is #811's job.
    it("records the colour-blind glass-composite table and the InsightsBar hover composite, for #811 (not asserted here)", () => {
      const records: string[] = [];
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
            records.push(
              `${role} on ${theme}/${mode} glass composite: panel ${ratioPanel.toFixed(2)}${
                ratioPanel < AA ? " FAIL" : ""
              }, canvas ${ratioCanvas.toFixed(2)}${ratioCanvas < AA ? " FAIL" : ""}`,
            );
          }
        }

        // InsightsBar's hover state stacks a second su-line/10 layer on top
        // of the first (InsightsBar.tsx:324) -- unmeasured before this pass.
        for (const [base, baseHex] of [
          ["panel", palette.panel],
          ["canvas", palette.canvas],
        ] as const) {
          const firstLayer = compositeOnSurface(palette.line, 0.1, baseHex);
          const hoverComposite = compositeOnSurface(palette.line, 0.1, firstLayer);
          for (const role of ROLES) {
            const ratio = stationContrast(palette[role], hoverComposite);
            records.push(
              `${role} on ${theme}/${base} InsightsBar hover composite: ${ratio.toFixed(2)}${
                ratio < AA ? " FAIL" : ""
              }`,
            );
          }
        }
      }
      console.info(records.join("\n"));
      // Not a contrast gate -- just proves the sweep actually ran (4 themes
      // x 3 modes x 3 roles = 36 colour-blind rows, plus 4 themes x 2 bases
      // x 4 roles = 32 hover rows).
      expect(records).toHaveLength(36 + 32);
    });
  },
);

/**
 * `getConditionColor("Aurora")` (#799)
 *
 * #787 gave `aurora-purple` a per-theme `--su-purple` token; this function
 * kept shipping the pre-#787 literal `#aa44ff` for its `Aurora` case, which
 * measured 3.93/3.81/4.30 as bare text on `panel` across themes -- the exact
 * numbers #787's original description cited. Both consumers
 * (`InsightsBar.tsx`, `PredictionsCard.tsx`) apply the return value as a CSS
 * `color`/`backgroundColor`, never a canvas/SVG attribute needing a real
 * hex, so the fix is a token string: `rgb(var(--su-purple-rgb))`.
 *
 * This measures the fixed return against the production `stationPalettes`
 * `purple` role -- not a fixture -- via the real `stationContrast` formula,
 * on every surface the two consumers actually render on:
 *  - bare `panel`/`canvas` (never used bare by either consumer today, but a
 *    future plain-text consumer would land here)
 *  - `PredictionsCard`'s real surface: the `Card` component's default glass
 *    (`bg-su-line/10`) over the page background, composited the same way
 *    `auroraPurpleTintContrast.test.ts` does for other `aurora-purple` sites.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getConditionColor } from "@/lib/utils/bands";
import { stationContrast, stationPalettes } from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";

const AA = 4.5;
const THEMES = Object.keys(stationPalettes) as ThemeId[];
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

  it("leaves the other conditions as documented hex literals (out of scope for #799)", () => {
    expect(getConditionColor("Excellent")).toBe("#00ff88");
    expect(getConditionColor("Good")).toBe("#44dd66");
    expect(getConditionColor("Fair")).toBe("#ffaa00");
    expect(getConditionColor("Poor")).toBe("#ff4455");
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

/**
 * PredictionsCard's Aurora badge (#799)
 *
 * `getConditionColor("Aurora")` used to return the literal `#aa44ff`, and
 * this component built the badge's tint by string-concatenating a hex alpha
 * suffix onto it (`` `${getConditionColor(condition)}20` ``). #799 makes
 * `getConditionColor("Aurora")` return the `rgb(var(--su-purple-rgb))`
 * token instead (see `bands.conditionColor.test.ts`), which breaks that
 * suffix trick -- `rgb(var(--su-purple-rgb))20` is not a colour. Purple text
 * on its own same-hue tint also fails the 4.5:1 floor on this card's real
 * surface (`Card`'s `bg-su-line/10` glass) in every theme once measured
 * below, so the fix drops the fill for the Aurora badge specifically and
 * keeps the purple text (the #795 "drop the fill" remedy) -- the other
 * conditions keep their hex tint unchanged (out of scope for #799, see
 * bands.ts).
 *
 * This file proves three things: (1) the source still ships the exact
 * `isAurora` branch this test measures, so a rewrite that drops the branch
 * fails here rather than silently regressing; (2) a real render with a
 * forced Aurora prediction has no `backgroundColor` on the badge and a
 * `rgb(var(--su-purple-rgb))` `color`, while a non-Aurora badge keeps its
 * hex tint; (3) the ink-on-the-Card's-real-surface contrast clears 4.5:1 in
 * all four themes using production `stationContrast`/`stationPalettes`, and
 * that dropping the fill is actually necessary -- ink on the tint fails.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PredictionsCard } from "@/components/dx/PredictionsCard";
import { stationContrast, stationPalettes } from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const AA = 4.5;
const THEMES = Object.keys(stationPalettes) as ThemeId[];

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

// kp >= 5 puts the 6m (VHF) band into "Aurora" per getVHFCondition; a low
// SFI keeps every other band at Fair/Poor (well below the score threshold
// for Excellent/Good), so "6m" sorts first and survives the default
// maxPredictions=3 cutoff. See src/lib/propagation/bandRanking.ts.
const mocks = vi.hoisted(() => ({
  longitude: -97,
  solarFlux: [{ flux: 70 }],
  kIndex: [{ kp_index: 5 }],
  chain: { bands: [] as Array<{ band: string; supported: boolean; erpWatts: number }> },
}));

vi.mock("@/hooks/useSolarData", () => ({
  useSolarFlux: () => ({ data: mocks.solarFlux, isLoading: false }),
  useKIndex: () => ({ data: mocks.kIndex, isLoading: false }),
}));

vi.mock("@/hooks/useStationCastContext", () => ({
  useStationCastContext: () => ({ location: { lon: mocks.longitude } }),
}));

vi.mock("@/hooks/useChainPerformance", () => ({
  useChainPerformance: () => mocks.chain,
}));

beforeEach(() => {
  mocks.longitude = -97;
  mocks.solarFlux = [{ flux: 70 }];
  mocks.kIndex = [{ kp_index: 5 }];
  mocks.chain = { bands: [] };
});

describe("PredictionsCard source (#799)", () => {
  it("still ships the isAurora branch this test measures", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/dx/PredictionsCard.tsx"),
      "utf8",
    );
    expect(source).toContain('const isAurora = prediction.condition === "Aurora";');
    expect(source).toContain("backgroundColor: isAurora");
    expect(source).toContain("`${conditionColor}20`");
  });
});

describe("PredictionsCard renders the Aurora badge without a purple-on-purple fill (#799)", () => {
  it("gives the 6m Aurora badge no backgroundColor and purple token text", () => {
    render(<PredictionsCard />);

    const band = screen.getByText("6m");
    expect(band.style.backgroundColor).toBe("");
    expect(band.style.color).toBe("rgb(var(--su-purple-rgb))");
    expect(band.style.color).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("leaves a non-Aurora badge's hex tint untouched", () => {
    render(<PredictionsCard maxPredictions={12} />);

    // With this kp/sfi combo every HF band is Fair or Poor; grab one that
    // isn't the Aurora 6m badge to prove the non-Aurora path is unchanged.
    const bands = screen.getAllByText(/m$/).filter((el) => el.textContent !== "6m");
    expect(bands.length).toBeGreaterThan(0);
    // getConditionColor("Fair") / ("Poor") are still hex, so the `${hex}20`
    // suffix produces a real (jsdom-normalised) rgba/rgb background.
    expect(bands[0]!.style.backgroundColor).not.toBe("");
  });
});

describe("Aurora badge contrast on PredictionsCard's real surface (#799)", () => {
  it.each(THEMES)(
    "purple text with NO fill clears 4.5:1 on the Card's bg-su-line/10 glass over panel/canvas on %s",
    (theme) => {
      const palette = stationPalettes[theme];
      const glassOnPanel = compositeOnSurface(palette.line, 0.1, palette.panel);
      const glassOnCanvas = compositeOnSurface(palette.line, 0.1, palette.canvas);
      expect(stationContrast(palette.purple, glassOnPanel)).toBeGreaterThanOrEqual(AA);
      expect(stationContrast(palette.purple, glassOnCanvas)).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(THEMES)(
    "purple text WOULD fail on its own /20 (alpha=0x20/255) tint over the same glass on %s -- why the fill was dropped",
    (theme) => {
      const palette = stationPalettes[theme];
      const glassOnPanel = compositeOnSurface(palette.line, 0.1, palette.panel);
      const alpha = 0x20 / 255;
      const tint = compositeOnSurface(palette.purple, alpha, glassOnPanel);
      expect(stationContrast(palette.purple, tint)).toBeLessThan(AA);
    },
  );
});

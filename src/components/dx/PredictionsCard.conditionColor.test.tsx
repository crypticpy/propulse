/**
 * PredictionsCard's condition-colour badges (#799, #810)
 *
 * `getConditionColor("Aurora")` used to return the literal `#aa44ff`, and
 * this component built every badge's tint by string-concatenating a hex
 * alpha suffix onto it (`` `${getConditionColor(condition)}20` ``). #799
 * moved the `Aurora` branch to the `rgb(var(--su-purple-rgb))` token, which
 * broke that suffix trick for Aurora specifically (`rgb(var(--su-purple-
 * rgb))20` is not a colour) -- the fix there was to drop the Aurora badge's
 * fill and keep the purple text.
 *
 * #810 moves every remaining branch (`Excellent`/`Good`/`Fair`/`Poor`/the
 * default) onto its own `rgb(var(--su-*-rgb))` token too (see
 * `bands.conditionColor.test.ts` for the token measurements), which breaks
 * the same suffix trick for all of them. A `rgb(var(--su-*-rgb) / alpha)`
 * tint was measured as the replacement and rejected: at alpha 0.12 the
 * light theme's `warning` role fails 4.5:1 on the canvas composite (4.40:1,
 * see `bands.conditionColor.test.ts`). So #810 drops the fill for every
 * badge, not just Aurora's -- one consistent treatment (token ink, no
 * background) across all five conditions.
 *
 * This file proves: (1) a real render with a forced Aurora prediction has
 * no `backgroundColor` and a `rgb(var(--su-purple-rgb))` `color`; (2) every
 * other rendered badge -- across a render that spans Poor/Fair/Good/
 * Excellent -- also has no `backgroundColor` and a `color` that is always a
 * `rgb(var(--su-*-rgb))` token, never a hex literal and never that token
 * with a stray `20` suffix appended; (3) the ink-on-the-Card's-real-surface
 * contrast clears 4.5:1 in all four themes for the Aurora badge specifically
 * (purple's own tint fails, which is *why* it has no fill).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PredictionsCard } from "@/components/dx/PredictionsCard";
import { stationContrast, stationPalettes } from "@/lib/themes/stationTokens";
import type { ThemeId } from "@/lib/themes";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const AA = 4.5;
const THEMES = Object.keys(stationPalettes) as ThemeId[];
const TOKEN_COLOR =
  /^rgb\(var\(--su-(success|warning|danger|purple|muted)-rgb\)\)$/;

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

// kp >= 5 puts the 6m (VHF) band into "Aurora" -- but only by day.
// `calculateBandConditions` hands VHF bands `getVHFCondition(kp)` as their
// dayCondition and a hard-coded "Poor" as their nightCondition
// (src/lib/utils/bands.ts:226-227), so Aurora is unreachable at night for
// any Kp. A low SFI keeps every other band at Fair/Poor, well below the
// score threshold for Excellent/Good. See src/lib/propagation/bandRanking.ts.
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

// Local solar hour at the mocked longitude (-97 => UTC-6.47): 18:00Z is
// ~11.5 (day), 06:00Z is ~23.5 (night). Every render below pins one of the
// two, because both the band ranking and the VHF condition itself differ
// between them.
const DAY = "2026-01-15T18:00:00Z";
const NIGHT = "2026-01-15T06:00:00Z";

describe("PredictionsCard renders the Aurora badge without a purple-on-purple fill (#799)", () => {
  // #834: this used to render at the default maxPredictions=3 and reach for
  // "6m" on a real clock, so it was red for roughly half of every UTC day.
  // Two independent causes, both fixed here:
  //
  //   1. Whether 6m survives a 3-slot cutoff depends on the band ranking,
  //      which depends on day vs night. maxPredictions=12 renders the badge
  //      either way -- the claim is about how the badge is *styled*, and was
  //      never about where 6m ranks.
  //   2. At night 6m is not Aurora at all. VHF bands get a hard-coded "Poor"
  //      nightCondition regardless of Kp, so the purple assertion was
  //      unsatisfiable on a night run, not merely unreached.
  //
  // Cause 2 is why this is two tests rather than one parametrised over both
  // instants: the styling rule is the same on both sides, the condition is
  // not.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("by day, gives the 6m Aurora badge no backgroundColor and purple token text", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(DAY));

    render(<PredictionsCard maxPredictions={12} />);

    const band = screen.getByText("6m");
    expect(band.style.backgroundColor).toBe("");
    expect(band.style.color).toBe("rgb(var(--su-purple-rgb))");
    expect(band.style.color).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("by night the same 6m badge is Poor, still with no fill and a token colour", () => {
    // Not a duplicate of the day case: it pins the day-only nature of VHF
    // Aurora that made this file clock-dependent, and it puts a second
    // condition through the same styling path.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NIGHT));

    render(<PredictionsCard maxPredictions={12} />);

    const band = screen.getByText("6m");
    expect(band.style.backgroundColor).toBe("");
    expect(band.style.color).toBe("rgb(var(--su-danger-rgb))");
    expect(band.style.color).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});

describe("PredictionsCard's badges never fill and never carry a hex/suffix colour, for any condition (#810)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("every badge in a Poor/Fair-heavy render has no backgroundColor and a token color", () => {
    // sfi=70, kp=5: every HF band scores well under the Fair threshold
    // (0.3), so this render is Poor/Fair plus the Aurora 6m badge. The
    // assertions hold on either side of the terminator, but the clock is
    // pinned anyway so that no test in this file reads the wall clock (#834).
    vi.useFakeTimers();
    vi.setSystemTime(new Date(DAY));

    render(<PredictionsCard maxPredictions={12} />);

    const bands = screen.getAllByText(/^\d+m$/);
    expect(bands.length).toBeGreaterThan(1);
    for (const band of bands) {
      expect(band.style.backgroundColor).toBe("");
      expect(band.style.color).toMatch(TOKEN_COLOR);
      expect(band.style.color).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(band.style.color).not.toMatch(/rgb\([^)]*\)\d/); // no `...))20` suffix survivors
    }
  });

  describe("with a strong opening (Excellent/Good present)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Daytime, so this combo is deterministic across runs regardless of
      // when the suite executes. kp=1 keeps the VHF band Poor
      // (getVHFCondition needs kp>=4), so no Aurora badge competes for the
      // maxPredictions slots here.
      vi.setSystemTime(new Date(DAY));
      mocks.solarFlux = [{ flux: 280 }];
      mocks.kIndex = [{ kp_index: 1 }];
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("still gives every badge no backgroundColor and a token color, whatever the condition", () => {
      render(<PredictionsCard maxPredictions={12} />);

      const bands = screen.getAllByText(/^\d+m$/);
      // sfi=280/kp=1 clears the Good/Excellent score threshold for most HF
      // bands (getCondition in bands.ts) while 160m and the VHF 6m band
      // stay Poor, so this render mixes the success and danger tokens --
      // proof this isn't a single-condition render.
      expect(bands.length).toBeGreaterThan(5);
      const colorsSeen = new Set(bands.map((band) => band.style.color));
      expect(colorsSeen.size).toBeGreaterThan(1);
      expect(colorsSeen.has("rgb(var(--su-success-rgb))")).toBe(true);
      expect(colorsSeen.has("rgb(var(--su-danger-rgb))")).toBe(true);
      for (const band of bands) {
        expect(band.style.backgroundColor).toBe("");
        expect(band.style.color).toMatch(TOKEN_COLOR);
        expect(band.style.color).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      }
    });
  });
});

describe("Aurora badge contrast on the Card component's glass surface (#799) -- Aurora only reaches this badge via PredictionsCard, since InsightsBar's bestCondition can never be Aurora", () => {
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

describe("PredictionsCard source no longer carries a fill for any condition (#810)", () => {
  it("the source drops the old alpha-suffix trick and the Aurora-only special case", () => {
    // `backgroundColor` itself is intentionally NOT scanned for here: a
    // source-wide `not.toContain` trips on any unrelated future
    // `backgroundColor` anywhere in the file. The badge's own style object
    // having no `backgroundColor` is proven at the DOM level instead, by
    // the `band.style.backgroundColor` assertions above (every band, across
    // an Aurora render and a mixed Poor/Fair/Good/Excellent render).
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/dx/PredictionsCard.tsx"),
      "utf8",
    );
    expect(source).not.toContain("${conditionColor}20");
    expect(source).not.toContain("isAurora");
  });
});

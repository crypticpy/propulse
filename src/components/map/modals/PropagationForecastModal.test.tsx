/**
 * Unit tests for the SNR heat-map sizing/fit helpers in
 * `PropagationForecastModal.tsx` (#854).
 *
 * Round 1 replaced the always-true `CELL_WIDTH > 20 && CELL_HEIGHT > 20`
 * gate with a pure `snrLabelFits(value, cellWidthPx, textScale)` built from
 * a hardcoded per-`TextScale` root-font table, and left the chart's pixel
 * dimensions fixed at 600x300 regardless of scale. Two reviews found real
 * problems with that: (1) a browser default font size other than 16px,
 * combined with the app's default `md` setting, is invisible to a table
 * keyed by `TextScale` -- the table assumes `md` means 16px, which is only
 * true when the browser's own default also happens to be 16px; and (2) a
 * fixed-size chart means a label that's `text-xs` (and so follows Settings
 * -> Text Size like the rest of this round's conversions) can outgrow its
 * cell as the scale grows, with nothing to compensate.
 *
 * Round 2 (this file): `snrLabelFits` now takes the *computed* root font
 * size in pixels rather than a `TextScale` key, and the chart's own pixel
 * dimensions (`chartGeometry`) scale with that same value, keeping
 * `viewBox` and `width` equal so 1 SVG user unit stays 1 CSS px. The fit
 * margin also grew from 0.5px to 3px, since 0.5px let two adjacent labels'
 * rendered edges sit only ~0.73px apart -- close enough to touch.
 *
 * Worked example used throughout (verified against the implementation,
 * not assumed): with `LABEL_FIT_MARGIN_PX = 3`, a 3-character label (most
 * SNR values, since `bands.ts` clamps to [-30, -5]) never has enough
 * clearance to fit at any of this app's four text scales, growth or not --
 * the color heatmap still carries that information. A 2-character label
 * (e.g. "-5") always fits comfortably *given a chart that grows with the
 * text*, but would lose its fit right around `xl` on a chart that stayed a
 * fixed 600px wide. That crossover is what proves the growth fix below,
 * rather than picking a value and asserting it "should" work.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HourlyForecast } from "@/lib/utils/bands";
import type { TextScale } from "@/types/user";

const mocks = vi.hoisted(() => ({
  textScale: "md" as TextScale,
  /** Root font size `getComputedStyle(document.documentElement)` reports
   * to the component under test, or `null` to fall through to jsdom's own
   * (typically unset) value -- exercising the component's 16px fallback. */
  rootFontPxOverride: null as number | null,
}));

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (selector: (state: { textScale: TextScale }) => unknown) =>
    selector({ textScale: mocks.textScale }),
}));

import {
  chartGeometry,
  nowLabelY,
  PropagationForecastModal,
  snrLabelFits,
} from "./PropagationForecastModal";

/** The chart's fixed pixel width before round 2, i.e. `chartGeometry(16)`'s
 * cell width -- used below to show what the *old*, non-growing gate would
 * have decided, without duplicating that dead code. */
const OLD_FIXED_CELL_WIDTH = chartGeometry(16).cellWidth;

const originalGetComputedStyle = window.getComputedStyle.bind(window);

/** Makes `getComputedStyle(document.documentElement).fontSize` report
 * `px`, or an empty string (jsdom's own default) when `px` is `null`. */
function mockRootFontPx(px: number | null) {
  vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudoElt) => {
    if (el === document.documentElement) {
      return {
        fontSize: px === null ? "" : `${px}px`,
      } as unknown as CSSStyleDeclaration;
    }
    return originalGetComputedStyle(el, pseudoElt);
  });
}

afterEach(() => {
  mocks.textScale = "md";
  mocks.rootFontPxOverride = null;
});

describe("chartGeometry (#854)", () => {
  it("returns the unscaled 600px chart at the default 16px root", () => {
    const { chartWidth, cellWidth } = chartGeometry(16);
    expect(chartWidth).toBe(600);
    // (600 - 48 - 16) / 24
    expect(cellWidth).toBeCloseTo(22.3333, 4);
  });

  it("scales both dimensions up together at a 22px root", () => {
    const { chartWidth, cellWidth } = chartGeometry(22);
    // 600 * (22 / 16)
    expect(chartWidth).toBeCloseTo(825, 4);
    // (825 - 48 - 16) / 24
    expect(cellWidth).toBeCloseTo(31.7083, 4);
  });

  it("scales an in-between root size (19px) proportionally, not just the four named text scales", () => {
    const { chartWidth, cellWidth } = chartGeometry(19);
    // 600 * (19 / 16); (712.5 - 48 - 16) / 24
    expect(chartWidth).toBeCloseTo(712.5, 4);
    expect(cellWidth).toBeCloseTo(27.0208, 4);
  });
});

describe("snrLabelFits (#854)", () => {
  it("holds the exact <= boundary with the 3px fit margin", () => {
    // 1-char value at a 16px root: 1 * (16 * 0.75 * 0.6) = 7.2, + 3 = 10.2.
    expect(snrLabelFits(5, 10.2, 16)).toBe(true);
    expect(snrLabelFits(5, 10.199999, 16)).toBe(false);
  });

  it("defaults to a 16px root when none is given", () => {
    expect(snrLabelFits(5, 10.2)).toBe(true);
  });

  it("hides a label whose cell is far too narrow for it, regardless of root size", () => {
    expect(snrLabelFits(-20, 5, 16)).toBe(false);
    expect(snrLabelFits(-20, 5, 22)).toBe(false);
  });

  it("never fits a 3-character value (most SNR readings) at any of the app's text scales", () => {
    // sm=14.4, md=16, lg=18.4, xl=22 root px; -30..-10 are 3 characters.
    for (const rootFontPx of [14.4, 16, 18.4, 22]) {
      const { cellWidth } = chartGeometry(rootFontPx);
      expect(snrLabelFits(-20, cellWidth, rootFontPx)).toBe(false);
    }
  });

  it("keeps a 2-character value fitting at xl on the grown chart, where a fixed 600px chart would have dropped it", () => {
    const grownCellWidth = chartGeometry(22).cellWidth;
    // This is the actual regression round 2 fixes: on the old, non-growing
    // chart, a value that fit fine at the default scale stops fitting
    // once the text (but not the chart) grows to xl.
    expect(snrLabelFits(-5, OLD_FIXED_CELL_WIDTH, 22)).toBe(false);
    expect(snrLabelFits(-5, grownCellWidth, 22)).toBe(true);
  });
});

describe("nowLabelY (#854)", () => {
  it("keeps the label's top edge on-screen (y >= 0) at every text scale", () => {
    for (const rootFontPx of [14.4, 16, 18.4, 22]) {
      const fontSizePx = rootFontPx * 0.75; // text-xs is 0.75rem everywhere
      // A commonly used cap-height approximation for sans/mono uppercase
      // glyphs is ~70% of the font's em box; this is independent of (not
      // copied from) nowLabelY's own implementation.
      const capHeightPx = fontSizePx * 0.7;
      const y = nowLabelY(rootFontPx);
      expect(y - capHeightPx / 2).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("PropagationForecastModal SNR label at scale (#854)", () => {
  function forecastWith(snrEstimate: number): HourlyForecast[] {
    return [{ hour: 0, bands: [{ band: "20m", status: "good", snrEstimate }] }];
  }

  function renderModal(forecast: HourlyForecast[]) {
    return render(
      <PropagationForecastModal
        isOpen
        onClose={() => {}}
        forecast={forecast}
        bestWindows={[]}
        currentHour={0}
        kp={2}
        sfi={120}
        stationCallsign="K5ABC"
        targetName="Tokyo"
      />,
    );
  }

  it("keeps showing a 2-character SNR label once the scale grows to xl, instead of dropping it", () => {
    mocks.textScale = "md";
    mockRootFontPx(16);
    const { rerender } = renderModal(forecastWith(-5));
    expect(screen.getByText("-5")).toBeTruthy();

    mocks.textScale = "xl";
    mockRootFontPx(22);
    rerender(
      <PropagationForecastModal
        isOpen
        onClose={() => {}}
        forecast={forecastWith(-5)}
        bestWindows={[]}
        currentHour={0}
        kp={2}
        sfi={120}
        stationCallsign="K5ABC"
        targetName="Tokyo"
      />,
    );
    expect(screen.getByText("-5")).toBeTruthy();

    // The safety gate itself still hides a label whose cell is genuinely
    // too narrow for it -- growing the chart doesn't disable the check.
    expect(snrLabelFits(-5, 5, 22)).toBe(false);
  });

  it("reads the browser's actual computed root font size, not a table keyed by the Text Size setting", () => {
    // 19px matches none of the app's sm/md/lg/xl table entries from round
    // 1 -- a browser default other than 16px, kept at the app's default
    // `md` Text Size setting. The chart must still grow to chartGeometry(19),
    // proving the value came from getComputedStyle rather than a lookup
    // keyed on `textScale` ("md" would otherwise mean a fixed 16).
    mocks.textScale = "md";
    mockRootFontPx(19);
    renderModal(forecastWith(-5));
    // DetailModal portals into document.body, so the RTL-returned
    // container (a wrapper div left empty by the portal) won't have it.
    const svg = document.body.querySelector("svg");
    const { chartWidth } = chartGeometry(19);
    expect(Number(svg?.getAttribute("width"))).toBeCloseTo(chartWidth, 4);
    expect(svg?.getAttribute("viewBox")).toBe(`0 0 ${chartWidth} 300`);
  });

  it("falls back to a 16px root when the computed style can't be parsed", () => {
    mocks.textScale = "md";
    mockRootFontPx(null); // jsdom reports "" here
    renderModal(forecastWith(-5));
    const svg = document.body.querySelector("svg");
    expect(Number(svg?.getAttribute("width"))).toBe(600);
  });

  it("centers the SNR label vertically in its cell instead of the old fixed-text baseline offset", () => {
    mocks.textScale = "md";
    mockRootFontPx(16);
    renderModal(forecastWith(-5));
    const label = screen.getByText("-5");
    expect(label.getAttribute("dominant-baseline")).toBe("central");
  });

  it("positions the NOW label from nowLabelY and keeps its baseline centered", () => {
    mocks.textScale = "xl";
    mockRootFontPx(22);
    renderModal(forecastWith(-5));
    const nowLabel = screen.getByText("NOW");
    expect(nowLabel.getAttribute("dominant-baseline")).toBe("central");
    expect(Number(nowLabel.getAttribute("y"))).toBeCloseTo(nowLabelY(22), 4);
  });

  it("lets the legend row wrap instead of overflowing next to the heading", () => {
    mocks.textScale = "md";
    mockRootFontPx(16);
    renderModal(forecastWith(-5));
    const legendLabel = screen.getByText("Excellent");
    // Walk up past the per-swatch wrapper (`gap-1.5`) to the row that sits
    // beside the "Band Conditions..." h3 (`gap-4`, unique to that row).
    const legendRow = legendLabel.closest("div.gap-4");
    expect(legendRow?.className).toContain("flex-wrap");
  });
});

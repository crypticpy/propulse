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
 * Round 3 (this file): round 2's *proportional* scaling turned out not to
 * help -- growing the cell width and the label width by the same factor
 * leaves their ratio, and therefore the fit, unchanged at every scale. A
 * 3-character label (most SNR values, since `bands.ts` clamps to
 * [-30, -5]) never had enough clearance to fit at any of the app's four
 * text scales under that scheme, a real regression versus main. Cells are
 * now sized from the *widest label they need to hold* (a 3-character
 * value, plus a full `2 * LABEL_FIT_MARGIN_PX` of clearance) instead of a
 * fixed 600px base, with `chartWidth` rebuilt from that cell width.
 */

import { act, render, screen } from "@testing-library/react";
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

/** The chart's fixed pixel cell width before round 2 ever ran, i.e. the
 * plain `(600 - MARGIN.left - MARGIN.right) / 24` used when the chart was
 * a flat 600px regardless of scale -- used below to show what the *old*,
 * non-growing gate would have decided, without duplicating that dead code.
 * `chartGeometry(16)` no longer equals this since round 3, because cells
 * are now sized from the widest label they must hold, not from a fixed
 * 600px base. */
const OLD_FIXED_CELL_WIDTH = (600 - 48 - 16) / 24;

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
  document.documentElement.removeAttribute("data-text-scale");
  document.documentElement.style.removeProperty("font-size");
});

describe("chartGeometry (#854)", () => {
  it("sizes the cell from the widest (3-character) SNR label at the default 16px root, not the proportional-only width", () => {
    const { chartWidth, cellWidth } = chartGeometry(16);
    // labelPx = 3 * 0.6 * (16 * 0.75) = 21.6; + 2*3 margin = 27.6, which
    // beats the proportional (600 - 48 - 16) / 24 = 22.3333.
    expect(cellWidth).toBeCloseTo(27.6, 4);
    // MARGIN.left + MARGIN.right + 24 * cellWidth = 48 + 16 + 24*27.6
    expect(chartWidth).toBeCloseTo(726.4, 4);
    // The whole point of this round: comfortably under the 800px this
    // test's caller asked to confirm, at the app's default root size.
    expect(chartWidth).toBeLessThan(800);
  });

  it("keeps scaling the label-driven width up at a 22px root", () => {
    const { chartWidth, cellWidth } = chartGeometry(22);
    // labelPx = 3 * 0.6 * (22 * 0.75) = 29.7; + 6 margin = 35.7, which
    // still beats the proportional (825 - 48 - 16) / 24 = 31.7083.
    expect(cellWidth).toBeCloseTo(35.7, 4);
    expect(chartWidth).toBeCloseTo(920.8, 4);
  });

  it("scales an in-between root size (19px) proportionally, not just the four named text scales", () => {
    const { chartWidth, cellWidth } = chartGeometry(19);
    // labelPx = 3 * 0.6 * (19 * 0.75) = 25.65; + 6 margin = 31.65.
    expect(cellWidth).toBeCloseTo(31.65, 4);
    expect(chartWidth).toBeCloseTo(823.6, 4);
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

  it("fits a 3-character value (most SNR readings, e.g. -20) with the 3px margin at every one of the app's text scales", () => {
    // sm=14.4, md=16, lg=18.4, xl=22 root px; -30..-10 are 3 characters.
    // This is the round-3 fix: round 2's proportional-only chartGeometry
    // kept the label/cell ratio constant, so this was false at every
    // scale (a real regression vs. main). Cells are now sized from the
    // widest label's own pixel width plus a full 2*margin, so the fit
    // holds regardless of root size.
    for (const rootFontPx of [14.4, 16, 18.4, 22]) {
      const { cellWidth } = chartGeometry(rootFontPx);
      expect(snrLabelFits(-20, cellWidth, rootFontPx)).toBe(true);
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

  function renderModal(forecast: HourlyForecast[], isOpen = true) {
    return render(
      <PropagationForecastModal
        isOpen={isOpen}
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
    // chartGeometry(16).chartWidth -- not a bare 600, since round 3 sizes
    // the chart from the widest label rather than a fixed base.
    expect(Number(svg?.getAttribute("width"))).toBeCloseTo(
      chartGeometry(16).chartWidth,
      4,
    );
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

  // #870 Codex round 4, finding 1 (PropagationForecastModal.tsx:200): a
  // descendant effect keyed only on the `textScale` store value reads
  // `rootFontPx` before `useTextScale()`'s own effect (further up the tree)
  // applies `data-text-scale` to `<html>` -- so a persisted `lg`/`xl`
  // preference read 16px on the very first pass, and since `textScale`
  // itself never changes again for an already-hydrated store, the effect
  // never got a second chance to correct it. Both forecast callers keep this
  // modal mounted while closed, which rules out remount as a fix too.
  it("re-measures the root font size via MutationObserver when data-text-scale changes after mount, not only when textScale changes (#870 finding 1)", async () => {
    mocks.textScale = "xl";
    mockRootFontPx(16); // simulates useTextScale()'s effect not having run yet
    renderModal(forecastWith(-5));

    let svg = document.body.querySelector("svg");
    expect(Number(svg?.getAttribute("width"))).toBeCloseTo(
      chartGeometry(16).chartWidth,
      4,
    );

    // useTextScale()'s effect applies the attribute; `mocks.textScale` (the
    // store value read by this component) is already "xl" and does not
    // change again, so only a live DOM observation can catch this.
    mockRootFontPx(22);
    await act(async () => {
      document.documentElement.setAttribute("data-text-scale", "xl");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    svg = document.body.querySelector("svg");
    expect(Number(svg?.getAttribute("width"))).toBeCloseTo(
      chartGeometry(22).chartWidth,
      4,
    );
  });

  it("re-reads the root font size when a mounted-while-closed modal opens (#870 finding 1)", () => {
    mocks.textScale = "xl";
    mockRootFontPx(22);
    const { rerender } = renderModal(forecastWith(-5), false);

    // Closed: AccessibleDialog renders null, so there is nothing painted yet
    // for a stale measurement to have leaked into.
    expect(document.body.querySelector("svg")).toBeNull();

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

    const svg = document.body.querySelector("svg");
    expect(Number(svg?.getAttribute("width"))).toBeCloseTo(
      chartGeometry(22).chartWidth,
      4,
    );
  });

  // #870 Codex round 4, finding 2 (PropagationForecastModal.tsx:385): the
  // chart's `overflow-x-auto` container lets the SVG shrink as a flex item
  // below its `min-w-[500px]` floor once the container is narrower than
  // `chartWidth`; the unchanged `viewBox` then scales all SVG content --
  // including the `text-xs` SNR labels -- down with it, undoing the
  // `subTextSizeFloor` fix at exactly the screen widths it targets.
  it("keeps the svg from shrinking as a flex item instead of relying on a min-w floor (#870 finding 2)", () => {
    mocks.textScale = "md";
    mockRootFontPx(16);
    renderModal(forecastWith(-5));

    const svg = document.body.querySelector("svg");
    const { chartWidth } = chartGeometry(16);
    expect(svg?.getAttribute("class")).toContain("shrink-0");
    expect(svg?.getAttribute("class")).not.toContain("min-w-[500px]");
    expect(svg?.style.width).toBe(`${chartWidth}px`);
  });
});

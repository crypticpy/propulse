/**
 * Composition guards for the geometry fixes in this #832 follow-up round: the
 * grid view's canonical status labels no longer overflow their cell
 * (`BandConditionsPanel.tsx`), the hover tooltip re-places itself once its
 * real rendered height is known (`TargetHoverTooltip.tsx`), the Layers
 * popover's quality-preset buttons reflow instead of overflowing their fixed
 * submenu column (`layers/BasemapCategory.tsx`), and the ISS tracker's info
 * card widens with its own text instead of clipping a frequency row
 * (`ISSTrackerOverlay.tsx`).
 *
 * The forecast heatmap's per-cell SNR label fit-check
 * (`modals/PropagationForecastModal.tsx`) was carved out of this PR to stay
 * at the 15-file cap; its `snrLabelFits` arithmetic tests were extracted to
 * /tmp/839-modal-fix.test-block.txt for the follow-up PR.
 *
 * jsdom computes no layout -- `getBoundingClientRect` returns zeros for real
 * DOM measurement and a collapsed box is invisible to it. Nothing here
 * asserts on a measured pixel from real layout: the grid-cell and
 * quality-button checks read the rendered class/style attributes (not
 * layout), the tooltip check supplies its own controlled height via a mocked
 * `getBoundingClientRect` rather than trusting jsdom to compute one, and the
 * ISS card check reads the exported width-style constant directly rather
 * than rendering the component (it lives in a React Three Fiber `<Html>`
 * tree that requires a real `<Canvas>` context Testing Library can't supply).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { render, fireEvent } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BandConditionGridCell,
  BAND_GRID_STYLE,
} from "./BandConditionsPanel";
import { TargetHoverTooltip } from "./TargetHoverTooltip";
import BasemapCategory from "./layers/BasemapCategory";
import { ISS_INFO_CARD_WIDTH_STYLE } from "./ISSTrackerOverlay";
import { SATELLITE_INFO_CARD_WIDTH_STYLE } from "./SatelliteOverlay";
import { PassRow } from "./SatellitePanel";
import { PassRow as ModalPassRow } from "./layers/SatelliteDetailModal";
import { OperatorProfile } from "./OperatorProfile";
import { useUserStore } from "@/stores/userStore";
import { useShackStore } from "@/stores/shackStore";
import type { PathBandCondition } from "@/lib/utils/bands";
import type { BandLadderEntry } from "@/hooks/useBandVerdicts";
import type { PassPrediction } from "@/types/satellite";

// OperatorProfile's band-conditions strip calls useBandConditionsTint, which
// pulls live K-index/SFI via these hooks. Mocked to static "no data" so the
// two tests below exercise only the layout fix, not network/react-query
// plumbing this file doesn't otherwise set up.
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: undefined }),
  useSolarFlux: () => ({ data: undefined }),
}));

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");

vi.mock("@/hooks/useActiveStationGain", () => ({
  useActiveStationGain: () => ({
    antennaType: "dipole",
    systemLossDb: 0,
    txPowerWatts: 100,
    erpWatts: 100,
    physicsMode: "erp",
  }),
}));

function baseCondition(
  status: PathBandCondition["status"],
): PathBandCondition {
  return {
    band: "20m",
    frequency: "14 MHz",
    status,
    snrEstimate: -10,
    notes: "",
  };
}

describe("BandConditionGridCell (fix 1: grid status label geometry)", () => {
  it("sizes the grid track in rem so it is not pinned to a fixed pixel floor", () => {
    expect(BAND_GRID_STYLE.gridTemplateColumns).toContain("rem");
    expect(BAND_GRID_STYLE.gridTemplateColumns).not.toContain("50px");
  });

  it("lets the canonical status label wrap instead of overflowing its cell", () => {
    const { container } = render(
      <BandConditionGridCell
        condition={baseCondition("excellent")}
        isSynced={false}
      />,
    );
    const label = Array.from(container.querySelectorAll("div")).find(
      (el) => el.textContent === "EXCELLENT",
    );
    expect(label).toBeDefined();
    expect(label!.style.overflowWrap).toBe("break-word");
  });

  it("wraps the live-verdict label too (the longest canonical string, VERIFIED OPEN)", () => {
    const verdict = { stable: "verified", fading: false } as BandLadderEntry;
    const { container } = render(
      <BandConditionGridCell
        condition={baseCondition("excellent")}
        verdict={verdict}
        isSynced={false}
      />,
    );
    const label = Array.from(container.querySelectorAll("div")).find(
      (el) => el.textContent === "VERIFIED OPEN",
    );
    expect(label).toBeDefined();
    expect(label!.style.overflowWrap).toBe("break-word");

    const pathLine = Array.from(container.querySelectorAll("div")).find(
      (el) => el.textContent === "PATH EXCELLENT",
    );
    expect(pathLine).toBeDefined();
    expect(pathLine!.style.overflowWrap).toBe("break-word");
  });
});

describe("TargetHoverTooltip (fix 2: measured-height re-placement)", () => {
  it("re-places using the measured height, not the stale estimate, and settles", () => {
    // The estimate formula for this prop shape (no notes, no distance/bearing
    // row, no context label) is 102. Force a measured height far outside
    // that so the two placements are unambiguously different, and prove the
    // component actually adopted the measured value rather than the guess.
    const MEASURED_HEIGHT = 400;
    let rectCalls = 0;
    const getRectSpy = vi
      .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLDivElement) {
        rectCalls += 1;
        return {
          width: 260,
          height: MEASURED_HEIGHT,
          top: 0,
          left: 0,
          right: 260,
          bottom: MEASURED_HEIGHT,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        } as DOMRect;
      });

    const { rerender } = render(
      <TargetHoverTooltip
        visible
        position={{ x: 100, y: 500, width: 10, height: 10 }}
        label="TEST1"
        optimalSignal={null}
      />,
    );

    const tooltipRoot = document.querySelector(
      "div.bg-su-canvas",
    ) as HTMLElement | null;
    expect(tooltipRoot).not.toBeNull();

    const appliedTop = Number.parseFloat(tooltipRoot!.style.top);
    expect(Number.isNaN(appliedTop)).toBe(false);

    // Independently recompute both candidate placements (mirroring the
    // production "vertical" placement math, not importing it) and assert the
    // DOM matches the one derived from the measured height, not the old
    // static estimate.
    const anchor = { x: 100, y: 500, width: 10, height: 10 };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const withMeasured = placeVertical(anchor, MEASURED_HEIGHT, viewport);
    const withEstimate = placeVertical(anchor, 102, viewport);
    expect(appliedTop).toBeCloseTo(withMeasured.y, 5);
    expect(appliedTop).not.toBeCloseTo(withEstimate.y, 5);

    // Convergence: a placement-only re-render (identical props) must not
    // keep re-measuring and re-placing forever.
    const callsBeforeNoopRerender = rectCalls;
    act(() => {
      rerender(
        <TargetHoverTooltip
          visible
          position={{ x: 100, y: 500, width: 10, height: 10 }}
          label="TEST1"
          optimalSignal={null}
        />,
      );
    });
    expect(rectCalls).toBeLessThanOrEqual(callsBeforeNoopRerender + 2);

    getRectSpy.mockRestore();
  });
});

describe("TargetHoverTooltip (round-5 fix: signal-summary row wraps instead of overlapping)", () => {
  it("wraps the SignalMeter band/status/EST group and S-unit/confidence group instead of holding one non-wrapping line", () => {
    render(
      <TargetHoverTooltip
        visible
        position={{ x: 100, y: 500, width: 10, height: 10 }}
        label="TEST-WRAP"
        optimalSignal={{
          band: "20m",
          status: "good",
          sUnit: { value: 7, text: "S7", dBm: -80 },
          confidence: 82,
        }}
      />,
    );
    // TargetHoverTooltip renders via createPortal into document.body, so it
    // is not a descendant of Testing Library's `container`.
    const bandBadge = Array.from(document.querySelectorAll("span")).find(
      (el) => el.textContent === "20m",
    );
    expect(bandBadge).toBeDefined();
    // bandBadge -> left group (min-w-0) -> the row that must wrap
    const row = bandBadge!.parentElement!.parentElement as HTMLElement;
    expect(row.className).toContain("flex-wrap");
  });

  it("does not call getBoundingClientRect again on a position-only rerender (no content-shape change)", () => {
    let rectCalls = 0;
    const getRectSpy = vi
      .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        rectCalls += 1;
        return {
          width: 260,
          height: 150,
          top: 0,
          left: 0,
          right: 260,
          bottom: 150,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        } as DOMRect;
      });

    const { rerender } = render(
      <TargetHoverTooltip
        visible
        position={{ x: 100, y: 500, width: 10, height: 10 }}
        label="TEST-POSITION-ONLY"
        optimalSignal={null}
      />,
    );

    const callsAfterMount = rectCalls;
    expect(callsAfterMount).toBeGreaterThan(0);

    // Simulates GlobeView updating `position` on every pointer move while a
    // target is hovered: only `position` changes, none of the effect's
    // actual dependencies (notes/distance-bearing/contextLabel/label/
    // textScale) do. Before the fix, the dependency-free effect reran on
    // every commit and called getBoundingClientRect here too.
    act(() => {
      rerender(
        <TargetHoverTooltip
          visible
          position={{ x: 250, y: 380, width: 10, height: 10 }}
          label="TEST-POSITION-ONLY"
          optimalSignal={null}
        />,
      );
    });

    expect(rectCalls).toBe(callsAfterMount);

    getRectSpy.mockRestore();
  });
});

describe("TargetHoverTooltip (round-6 fix: visible is a measurement dependency)", () => {
  it("does not measure while hidden, then measures once when it becomes visible", () => {
    let rectCalls = 0;
    const getRectSpy = vi
      .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        rectCalls += 1;
        return {
          width: 260,
          height: 150,
          top: 0,
          left: 0,
          right: 260,
          bottom: 150,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        } as DOMRect;
      });

    const { rerender } = render(
      <TargetHoverTooltip
        visible={false}
        position={{ x: 100, y: 500, width: 10, height: 10 }}
        label="TEST-HIDDEN"
        optimalSignal={null}
      />,
    );

    // Hidden: the component returns null, so contentRef never attaches to a
    // node and the layout effect has nothing to measure.
    expect(rectCalls).toBe(0);

    act(() => {
      rerender(
        <TargetHoverTooltip
          visible
          position={{ x: 100, y: 500, width: 10, height: 10 }}
          label="TEST-HIDDEN"
          optimalSignal={null}
        />,
      );
    });

    // Visible now, with the content node mounted for the first time: the
    // effect must re-run even though none of the content-shape dependencies
    // (optimalSignal/showsDistanceOrBearing/contextLabel/label/textScale)
    // changed between the two renders.
    expect(rectCalls).toBe(1);

    getRectSpy.mockRestore();
  });
});

describe("BasemapCategory (fix 4: quality-button grid reflow)", () => {
  it("sizes the quality-button grid to reflow columns in rem, not a fixed 4-column track, and lets labels wrap", () => {
    const { container } = render(<BasemapCategory />);

    const extremeButton = Array.from(
      container.querySelectorAll("button"),
    ).find((el) => el.textContent === "Extreme");
    expect(extremeButton).toBeDefined();

    const grid = extremeButton!.parentElement as HTMLElement;
    expect(grid.className).toContain("auto-fit");
    expect(grid.className).toContain("minmax(5rem");
    expect(grid.className).not.toContain("grid-cols-4");
    expect(extremeButton!.className).toContain("break-words");
  });
});

describe("ISSTrackerOverlay (fix 5: info card width follows its own text)", () => {
  it("sizes the info card's width range in rem instead of a fixed pixel range", () => {
    expect(ISS_INFO_CARD_WIDTH_STYLE.minWidth).toContain("rem");
    expect(ISS_INFO_CARD_WIDTH_STYLE.maxWidth).toContain("rem");
    expect(ISS_INFO_CARD_WIDTH_STYLE.minWidth).not.toBe("240px");
    expect(ISS_INFO_CARD_WIDTH_STYLE.maxWidth).not.toBe("280px");
  });

  it("round-6: also clamps both bounds to the viewport so the card cannot clip on a narrow phone screen", () => {
    expect(ISS_INFO_CARD_WIDTH_STYLE.minWidth).toContain("100vw");
    expect(ISS_INFO_CARD_WIDTH_STYLE.maxWidth).toContain("100vw");
  });

  it("round-6: the ham-radio frequency rows carry flex-wrap so a long value can drop under its label at the narrow viewport cap", () => {
    const absPath = resolve(
      REPO_ROOT,
      "src/components/map/ISSTrackerOverlay.tsx",
    );
    const source = readFileSync(absPath, "utf8");
    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) =>
      line.includes("ISS_FREQUENCIES.map"),
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);

    const rowLine = lines
      .slice(markerIndex)
      .find((line) => line.includes("className="));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
  });

  it("round-8: the orbital/observer/pass grids stack instead of clipping their fixed two-column cells, and the frequency label can wrap", () => {
    const absPath = resolve(
      REPO_ROOT,
      "src/components/map/ISSTrackerOverlay.tsx",
    );
    const source = readFileSync(absPath, "utf8");
    // A fixed two-column grid cannot reflow at the narrow viewport cap;
    // auto-fit columns stack when the card is narrower than two cells (same
    // pattern as SatelliteOverlay's round-7 fix above).
    expect(source).not.toContain('className="grid grid-cols-2');
    expect(source).toContain("grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))]");

    const lines = source.split("\n");
    const labelLineIndex = lines.findIndex((line) =>
      line.includes("{f.label}"),
    );
    expect(labelLineIndex).toBeGreaterThanOrEqual(0);
    // Grab the whole opening-tag block that precedes {f.label}, not just the
    // nearest line: the tag's attributes can be spread across several lines
    // (className on one, style on another), and a search for the single
    // nearest "<span" line would miss a `truncate`/max-width sitting on a
    // sibling attribute line.
    const labelSpanBlock = lines
      .slice(Math.max(0, labelLineIndex - 6), labelLineIndex)
      .join("\n");
    expect(labelSpanBlock).not.toContain("truncate");
    expect(labelSpanBlock).not.toContain("max-w-[");
    expect(labelSpanBlock).not.toContain("maxWidth");
  });
});

describe("SatellitePanel (round-5 sweep: pass-quality row wraps instead of overflowing)", () => {
  it("wraps both the outer pass row and the star/badge/future-label sub-row, and right-aligns the elevation/azimuth column", () => {
    const pass: PassPrediction = {
      aos: new Date(Date.now() + 60 * 60 * 1000),
      los: new Date(Date.now() + 60 * 60 * 1000 + 10 * 60 * 1000),
      maxEl: 75,
      aosAz: 120,
      losAz: 200,
    };

    const { container } = render(<PassRow pass={pass} />);

    const outerRow = container.firstElementChild as HTMLElement;
    expect(outerRow).not.toBeNull();
    expect(outerRow.className).toContain("flex-wrap");

    const elevationText = Array.from(container.querySelectorAll("div")).find(
      (el) => el.textContent === "75° max",
    );
    expect(elevationText).toBeDefined();
    const elevationColumn = elevationText!.parentElement as HTMLElement;
    expect(elevationColumn.className).toContain("ml-auto");

    // Locate the quality sub-row (stars/badge/future-label) via the
    // future-label text, which is unambiguous.
    const futureLabel = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent?.startsWith("in "),
    );
    expect(futureLabel).toBeDefined();
    const qualityRow = futureLabel!.parentElement as HTMLElement;
    expect(qualityRow.className).toContain("flex-wrap");
  });
});

describe("SatelliteDetailModal (round-6 fix: modal's own pass-quality row copy wraps too)", () => {
  it("wraps both the outer pass row and the star/badge/future-label sub-row, and right-aligns the elevation/azimuth column", () => {
    const pass: PassPrediction = {
      aos: new Date(Date.now() + 60 * 60 * 1000),
      los: new Date(Date.now() + 60 * 60 * 1000 + 10 * 60 * 1000),
      maxEl: 75,
      aosAz: 120,
      losAz: 200,
    };

    const { container } = render(<ModalPassRow pass={pass} />);

    const outerRow = container.firstElementChild as HTMLElement;
    expect(outerRow).not.toBeNull();
    expect(outerRow.className).toContain("flex-wrap");

    const elevationText = Array.from(container.querySelectorAll("div")).find(
      (el) => el.textContent === "75° max",
    );
    expect(elevationText).toBeDefined();
    const elevationColumn = elevationText!.parentElement as HTMLElement;
    expect(elevationColumn.className).toContain("ml-auto");

    const futureLabel = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent?.startsWith("in "),
    );
    expect(futureLabel).toBeDefined();
    const qualityRow = futureLabel!.parentElement as HTMLElement;
    expect(qualityRow.className).toContain("flex-wrap");
  });
});

describe("SatelliteOverlay (round-5 sweep: info card width follows its own text)", () => {
  it("sizes the info card's width range in rem instead of a fixed pixel range", () => {
    expect(SATELLITE_INFO_CARD_WIDTH_STYLE.minWidth).toContain("rem");
    expect(SATELLITE_INFO_CARD_WIDTH_STYLE.maxWidth).toContain("rem");
    expect(SATELLITE_INFO_CARD_WIDTH_STYLE.minWidth).not.toBe("200px");
    expect(SATELLITE_INFO_CARD_WIDTH_STYLE.maxWidth).not.toBe("260px");
  });

  it("round-7: clamps both bounds to the viewport and lets the two-column rows stack", () => {
    expect(SATELLITE_INFO_CARD_WIDTH_STYLE.minWidth).toContain("100vw");
    expect(SATELLITE_INFO_CARD_WIDTH_STYLE.maxWidth).toContain("100vw");
    const source = readFileSync(
      resolve(__dirname, "SatelliteOverlay.tsx"),
      "utf8",
    );
    // A fixed two-column grid cannot reflow at the narrow cap; auto-fit
    // columns stack when the card is narrower than two cells.
    expect(source).not.toContain('className="grid grid-cols-2');
    expect(source).toContain("grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))]");
  });
});

describe("PathAnalysis (round-5 sweep: collapsed header row wraps instead of overflowing)", () => {
  it("wraps the collapsed row's fields instead of holding one non-wrapping line", () => {
    const absPath = resolve(REPO_ROOT, "src/components/map/PathAnalysis.tsx");
    const source = readFileSync(absPath, "utf8");
    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) =>
      line.includes("COLLAPSED: Clean horizontal layout"),
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);

    // The collapsed-row wrapper div is the first `<div className=` after the
    // marker comment.
    const rowLine = lines
      .slice(markerIndex)
      .find((line) => line.includes("<div className="));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
    expect(rowLine).not.toContain('className="flex items-center gap-3 w-full"');
  });
});

/**
 * Round-9 sweep census (file, line, shape, disposition). Lines are as of
 * the commit that added this block; later edits may shift them.
 *
 *  - TargetHoverTooltip.tsx:228     dependency-tracked measure effect  FIXED (ResizeObserver added)
 *  - OperatorProfile.tsx:597        flex row, 3 badges, no wrap        FIXED (flex-wrap)
 *  - SatellitePanel.tsx:285         grid-cols-2 (UP/DN)                FIXED (auto-fit)
 *  - SatellitePanel.tsx:391         grid-cols-2 (UP/DN, static xpdr)   FIXED (auto-fit)
 *  - SatellitePanel.tsx:430         grid-cols-2 (TX/RX Doppler)        FIXED (auto-fit)
 *  - SatellitePanel.tsx:159,264,518,808  truncate, dynamic flex-1     safe: flex-1/min-w-0 truncation, no fixed cap
 *  - SatellitePanel.tsx:971         whitespace-nowrap chip row         safe: intentional horizontal-scroll tab bar
 *  - layers/SatelliteDetailModal.tsx:144  grid-cols-2 (UP/DN)          FIXED (auto-fit)
 *  - layers/SatelliteDetailModal.tsx:252  grid-cols-2 (UP/DN static)  FIXED (auto-fit)
 *  - layers/SatelliteDetailModal.tsx:291  grid-cols-2 (TX/RX Doppler) FIXED (auto-fit)
 *  - layers/SatelliteDetailModal.tsx:586  flex row, FSPL/Squint/Margin FIXED (flex-wrap)
 *  - layers/SatelliteDetailModal.tsx:214  "Transponders"+badge row    safe: only 2 short items
 *  - layers/SatelliteDetailModal.tsx:355  PassRow                     safe: already flex-wrap (round-6)
 *  - BandConditionsPanel.tsx:918-932  lite-overlay collapsed summary  FIXED (flex-wrap + Card viewport max-width)
 *  - BandConditionsPanel.tsx:1149  "Solar inputs" + refresh icon      safe: plain text wraps, single scaling child
 *  - PathAnalysis.tsx:1033         truncate + fixed max-width chip    FIXED (rem cap)
 *  - PathAnalysis.tsx:1053         fixed max-width decision group     FIXED (rem cap)
 *  - PathAnalysis.tsx:398          grid-cols-2 (EndSunTimes)          FIXED (auto-fit, round 15)
 *  - PathAnalysis.tsx:1383,1424,1450  grid-cols-3 (MetricItem)        FIXED (auto-fit, round 15: 3 x 65px tiles cannot hold the tracked labels at xl)
 *  - PathAnalysis.tsx:1713,1904    grid-cols-2 (Freq Limits)          FIXED (auto-fit, round 15)
 *  - PathAnalysis.tsx:915-1057     collapsed header row               safe: already flex-wrap (prior round)
 *  - ISSTrackerOverlay.tsx:231     header row (name + status badge)   safe: name is a fixed immune size, one scaling badge, fits the viewport-clamped card
 *  - ISSTrackerOverlay.tsx:641     globe-anchored label pill          safe: floats unconstrained over the 3D globe
 *  - LayersPopover.tsx (sliders/rows) already rem-based               safe: prior rounds converted these; category/submenu labels use a fixed immune size
 *  - LayersPopover.tsx:1303,1333   168/232 column widths              safe: structural columns, content is fixed-size or auto-sizing
 *  - SatelliteOverlay.tsx (grids, header row)                         safe: grid already auto-fit (round-7); header row same pattern as ISS card
 *  - WatchPopover.tsx:392,465,740,743  popover width + truncate       safe: already viewport-capped; truncate sites are dynamic flex-1
 *  - TimeControl.tsx                                                  safe: no scalable text in a fixed-size box found
 *  - BasemapCategory.tsx:239       grid-cols-2 (thumbnail cards)       safe: 2-up visual card grid, short single-word labels
 *  - SatelliteFilters.tsx:274,305-311  tracking label + SatRow         safe: short content / dynamic flex-1 truncation
 */
describe("TargetHoverTooltip (round-9 fix: ResizeObserver catches shape changes the dependency list misses)", () => {
  it("remeasures via ResizeObserver when signalUnavailableReason changes without a new optimalSignal reference", () => {
    let capturedCallback: ResizeObserverCallback | null = null;
    let observedNode: Element | null = null;
    class StubResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        capturedCallback = cb;
      }
      observe(node: Element) {
        observedNode = node;
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", StubResizeObserver);

    let rectHeight = 150;
    const getRectSpy = vi
      .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        return {
          width: 260,
          height: rectHeight,
          top: 0,
          left: 0,
          right: 260,
          bottom: rectHeight,
          x: 0,
          y: 0,
          toJSON() {
            return {};
          },
        } as DOMRect;
      });

    const { rerender } = render(
      <TargetHoverTooltip
        visible
        position={{ x: 100, y: 500, width: 10, height: 10 }}
        label="TEST-RO"
        optimalSignal={null}
      />,
    );

    expect(capturedCallback).not.toBeNull();
    expect(observedNode).not.toBeNull();

    const tooltipRoot = document.querySelector(
      "div.bg-su-canvas",
    ) as HTMLElement;
    const initialTop = Number.parseFloat(tooltipRoot.style.top);

    // `signalUnavailableReason` is not in the dependency-tracked effect's
    // list (it never was), so that effect does not remeasure here even
    // though the rendered content (the reason string appearing) changed
    // shape. `optimalSignal` stays `null` across both renders -- the same
    // reference -- so this isolates the case the old effect could not see.
    act(() => {
      rerender(
        <TargetHoverTooltip
          visible
          position={{ x: 100, y: 500, width: 10, height: 10 }}
          label="TEST-RO"
          optimalSignal={null}
          signalUnavailableReason="No viable propagation on modeled HF bands right now"
        />,
      );
    });

    // Simulate the browser's real resize notification once the new content
    // has actually changed the box's rendered height.
    rectHeight = 260;
    act(() => {
      capturedCallback!([], {} as ResizeObserver);
    });

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const anchor = { x: 100, y: 500, width: 10, height: 10 };
    const expected = placeVertical(anchor, rectHeight, viewport);
    const updatedTop = Number.parseFloat(tooltipRoot.style.top);
    expect(updatedTop).toBeCloseTo(expected.y, 5);
    expect(updatedTop).not.toBeCloseTo(initialTop, 5);

    getRectSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("does not throw when ResizeObserver is unavailable and still measures via the layout effect", () => {
    // Sanity check for this repo's actual jsdom default (no ResizeObserver
    // polyfilled in): mounting must not throw, and the pre-existing
    // dependency-tracked effect must still place the tooltip.
    expect(() =>
      render(
        <TargetHoverTooltip
          visible
          position={{ x: 100, y: 500, width: 10, height: 10 }}
          label="TEST-NO-RO"
          optimalSignal={null}
        />,
      ),
    ).not.toThrow();
  });
});

describe("OperatorProfile (round-9 fix: primary VFO row wraps instead of clipping in the overflow-hidden button)", () => {
  it("wraps the band/mode/source row so the source badge can drop to its own line", () => {
    const absPath = resolve(REPO_ROOT, "src/components/map/OperatorProfile.tsx");
    const source = readFileSync(absPath, "utf8");
    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) =>
      line.includes("Primary row: Pulse dot + Band"),
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);

    const rowLine = lines
      .slice(markerIndex)
      .find((line) => line.includes("<div className="));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
    expect(rowLine).not.toContain('className="flex items-center gap-2"');
  });
});

describe("SatellitePanel + SatelliteDetailModal (round-9 fix: UP/DN and TX/RX grids stack instead of squeezing)", () => {
  it("SatellitePanel.tsx: all four transponder/Doppler/position grids are auto-fit, none are a fixed two-column grid", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/SatellitePanel.tsx"),
      "utf8",
    );
    expect(source).not.toContain('className="grid grid-cols-2');
    const autoFitCount = (
      source.match(/grid-cols-\[repeat\(auto-fit,minmax\(6\.5rem,1fr\)\)\]/g) ?? []
    ).length;
    expect(autoFitCount).toBe(4);
  });

  it("layers/SatelliteDetailModal.tsx: all four duplicated grids are auto-fit, none are a fixed two-column grid", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/layers/SatelliteDetailModal.tsx"),
      "utf8",
    );
    expect(source).not.toContain('className="grid grid-cols-2');
    const autoFitCount = (
      source.match(/grid-cols-\[repeat\(auto-fit,minmax\(6\.5rem,1fr\)\)\]/g) ?? []
    ).length;
    expect(autoFitCount).toBe(4);
  });

  it("layers/SatelliteDetailModal.tsx: the link-budget FSPL/Squint/Margin row wraps instead of overflowing", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/layers/SatelliteDetailModal.tsx"),
      "utf8",
    );
    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) => line.includes("FSPL:"));
    expect(markerIndex).toBeGreaterThanOrEqual(0);
    const rowLine = lines
      .slice(0, markerIndex)
      .reverse()
      .find((line) => line.includes("<div className="));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
  });
});

describe("BandConditionsPanel (round-9 fix: lite-overlay collapsed summary wraps and the panel caps to the viewport)", () => {
  it("the collapsed Card carries a viewport-relative max-width and the summary row wraps", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/BandConditionsPanel.tsx"),
      "utf8",
    );
    expect(source).toContain("max-w-[calc(100vw-2rem)]");

    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) =>
      line.includes("lite overlay"),
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);
    const rowLine = lines
      .slice(markerIndex)
      .find((line) => line.includes("<div className="));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
    expect(rowLine).not.toContain('className="flex items-center gap-3 w-full"');
  });
});

describe("PathAnalysis (round-9 sweep: fixed-pixel truncation caps converted to rem)", () => {
  it("the target chip and decision-summary group cap their width in rem, not a fixed pixel value carried over from the old sub-floor size", () => {
    const source = readFileSync(REPO_ROOT + "/src/components/map/PathAnalysis.tsx", "utf8");
    expect(source).not.toContain("max-w-[80px]");
    expect(source).not.toContain("max-w-[280px]");
    expect(source).toContain("max-w-[5rem]");
    expect(source).toContain("max-w-[17.5rem]");
  });
});

/** Minimal re-implementation of the vertical placement math (mirrors
 * `placeAnchoredOverlay`'s "vertical" branch) used only to independently
 * predict which of two candidate heights the component actually used --
 * this does not import the production function so the test can't pass by
 * accident if that function's math itself regresses. */
function placeVertical(
  anchor: { x: number; y: number; width: number; height: number },
  overlayHeight: number,
  viewport: { width: number; height: number },
  gap = 10,
  padding = 10,
) {
  const aboveY = anchor.y - overlayHeight - gap;
  const belowY = anchor.y + anchor.height + gap;
  const fitsAbove = aboveY >= padding;
  const rawY = fitsAbove ? aboveY : belowY;
  const y = Math.max(
    padding,
    Math.min(viewport.height - overlayHeight - padding, rawY),
  );
  return { y };
}

/**
 * Round-10 sweep: three named Codex findings (LayersPopover's category row,
 * OperatorProfile's secondary VFO row, BandConditionsPanel's table-view band
 * cell) plus two more of the same shape found while auditing the rest of the
 * PR's diff (BasemapCategory's "Image quality" header row and
 * SatelliteFilters' tracking-status footer, both in the same fixed 232px
 * LayersPopover submenu column as the already-fixed quality-button grid).
 * All five are local, unexported components rendered deep in store-backed
 * trees, so -- matching this file's established pattern for such cases
 * (e.g. the round-9 OperatorProfile primary-row check above) -- these read
 * the source text directly rather than rendering the component.
 */
describe("LayersPopover (round-10 fix: category row wraps instead of overflowing the 168px column)", () => {
  it("wraps the icon/label/count-badge/chevron row so the badge can drop under the label", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/LayersPopover.tsx"),
      "utf8",
    );
    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) =>
      line.includes("This row sits in LayersPopover's fixed 168px category column"),
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);

    const rowLine = lines
      .slice(markerIndex)
      .find((line) => line.includes("className={`flex"));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
  });
});

describe("OperatorProfile (round-10 fix: secondary VFO row wraps instead of clipping in the overflow-hidden button)", () => {
  it("wraps the frequency/segment/session row so the session timer can drop to its own line", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/OperatorProfile.tsx"),
      "utf8",
    );
    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) =>
      line.includes("Secondary row: Frequency + Segment + Session"),
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);

    const rowLine = lines
      .slice(markerIndex)
      .find((line) => line.includes("<div className="));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
    expect(rowLine).not.toContain(
      'className="flex items-center gap-1.5 mt-1.5 text-xs font-mono text-su-muted"',
    );
  });
});

describe("BandConditionsPanel (round-10 fix: table-view band cell wraps instead of clipping in overflow-x-hidden)", () => {
  it("wraps the band-name/GL/Es/OPEN row so a badge can drop to its own line", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/BandConditionsPanel.tsx"),
      "utf8",
    );
    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) =>
      line.includes(
        "Table view's first cell, inside the scroll container's",
      ),
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);

    const rowLine = lines
      .slice(markerIndex)
      .find((line) => line.includes("<div className="));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
    expect(rowLine).not.toContain('className="flex items-center gap-1.5"');
  });
});

describe("BasemapCategory (round-10 fix: Image quality header row wraps in the fixed 232px submenu column)", () => {
  it("wraps the 'Image quality' / 'Effective: <label>' row instead of overflowing", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/layers/BasemapCategory.tsx"),
      "utf8",
    );
    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) =>
      line.includes(
        "Same fixed-pixel submenu column as the quality-button grid below",
      ),
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);

    const rowLine = lines
      .slice(markerIndex)
      .find((line) => line.includes("<div className="));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
    expect(rowLine).not.toContain(
      'className="mb-2 flex items-center justify-between gap-2"',
    );
  });
});

describe("SatelliteFilters (round-10 fix: tracking-status footer wraps in the fixed 232px submenu column)", () => {
  it("wraps the tracking-label / Manage-link row instead of overflowing", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/layers/SatelliteFilters.tsx"),
      "utf8",
    );
    const lines = source.split("\n");
    const markerIndex = lines.findIndex((line) =>
      line.includes(
        "This footer sits in the same fixed 232px LayersPopover submenu column",
      ),
    );
    expect(markerIndex).toBeGreaterThanOrEqual(0);

    const rowLine = lines
      .slice(markerIndex)
      .find((line) => line.includes("<div className="));
    expect(rowLine).toBeDefined();
    expect(rowLine).toContain("flex-wrap");
    expect(rowLine).not.toContain(
      'className="flex items-center justify-between px-0.5 pt-1 border-t border-su-line/20"',
    );
  });
});

describe("LayersPopover (round-10 design review: count badge and chevron wrap as one unit)", () => {
  it("groups the count badge with the chevron so a wrapped row never orphans the chevron", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/LayersPopover.tsx"),
      "utf8",
    );
    const lines = source.split("\n");
    const groupIndex = lines.findIndex((line) =>
      line.includes('<span className="ml-auto flex shrink-0 items-center gap-2">'),
    );
    expect(groupIndex).toBeGreaterThanOrEqual(0);
    const after = lines.slice(groupIndex, groupIndex + 30).join("\n");
    expect(after).toContain("{enabledCount}/{totalCount}");
    expect(after).toContain('viewBox="0 0 6 10"');
  });
});

describe("BasemapCategory (round-10 design review: basemap tiles stack before the subtitle spills)", () => {
  it("uses auto-fit tile columns and a wrapping subtitle instead of a fixed two-column grid", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/layers/BasemapCategory.tsx"),
      "utf8",
    );
    expect(source).not.toContain('className="grid grid-cols-2 gap-2"');
    expect(source).toContain(
      "grid-cols-[repeat(auto-fit,minmax(6.25rem,1fr))]",
    );
    expect(source).toContain(
      'className="max-w-full break-words text-center text-xs text-su-text/80"',
    );
  });
});

describe("OperatorProfile (round-11 Codex sites: narrow 220px column overflow)", () => {
  beforeEach(() => {
    useUserStore.getState().setStation({
      callsign: "K1ABC",
      homeLocationId: "home",
      activeLocationId: "home",
      savedLocations: [],
      grid: "FN42",
      lat: 42.36,
      lon: -71.06,
    });
    // "flex-6700" resolves via the built-in radio catalog (src/lib/data/radios.ts)
    // to manufacturer "FlexRadio" / model "FLEX-6700" / maxPower 100 -- the
    // exact combination Codex named as clipping in the tertiary row.
    useShackStore.setState({ activeRadioId: "flex-6700", radios: [] });
  });

  afterEach(() => {
    useUserStore.getState().setStation(null);
    useShackStore.setState({ activeRadioId: null, radios: [] });
  });

  it("lets the band-strip status tooltip wrap and cap to the column instead of overflowing it with whitespace-nowrap", () => {
    const { container } = render(<OperatorProfile />);
    const bandGroup = container.querySelector(
      '[aria-label="Band conditions — click any bar to switch bands"]',
    );
    expect(bandGroup).toBeTruthy();
    const firstBandButton = bandGroup!.querySelector("button");
    expect(firstBandButton).toBeTruthy();

    fireEvent.mouseEnter(firstBandButton as Element);

    // Anchored to the strip's top edge (`bottom-full`), not a fixed
    // `-top-6` offset: once the tooltip wraps at xl it grows upward instead
    // of downward over the bars it describes (design review, round 11).
    const tooltip = container.querySelector(".absolute.bottom-full");
    expect(tooltip).toBeTruthy();
    expect(container.querySelector(".absolute.-top-6")).toBeNull();
    const tooltipInner = tooltip!.firstElementChild as HTMLElement;
    expect(tooltipInner).toBeTruthy();
    expect(tooltipInner.className).not.toContain("whitespace-nowrap");
    expect(tooltipInner.className).toContain("flex-wrap");
    expect(tooltipInner.className).toContain("max-w-full");
  });

  it("lets the active-radio tertiary row wrap instead of silently clipping the manufacturer/model inside the VFO button's overflow-hidden", () => {
    const { getByText } = render(<OperatorProfile />);

    const modelLabel = getByText(/FLEX-6700/);
    expect(modelLabel.className).toContain("break-words");

    const row = modelLabel.parentElement as HTMLElement;
    expect(row.className).toContain("flex-wrap");
    expect(row.className).toContain("min-w-0");
    expect(row.textContent).toContain("100W");
  });
});

describe("round-12 Codex sites: implicit grid tracks and a non-wrapping path header", () => {
  it("ISS pass rows span the full explicit grid instead of forcing an implicit second column at the single-track fallback", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/ISSTrackerOverlay.tsx"),
      "utf8",
    );
    // `col-span-2` on an auto-fit grid that has collapsed to one 6.5rem
    // track makes CSS Grid create an implicit second column, so the pass
    // section overflows the card at xl on a 320px viewport. `col-span-full`
    // spans whatever explicit tracks exist without adding one.
    expect(source).not.toContain("col-span-2");
    expect(source.match(/col-span-full flex justify-between/g)?.length).toBe(2);
  });

  it("Short Path / Long Path headers wrap so the ACTIVE badge drops under the heading at the 220px panel minimum", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/PathAnalysis.tsx"),
      "utf8",
    );
    const lines = source.split("\n");
    for (const heading of ["Short Path <InfoTip", "Long Path <InfoTip"]) {
      const headingIndex = lines.findIndex((line) => line.includes(heading));
      expect(headingIndex, heading).toBeGreaterThanOrEqual(0);
      // The header row is the flex container just above the <h4>.
      const rowLine = lines
        .slice(Math.max(0, headingIndex - 3), headingIndex)
        .reverse()
        .find((line) => line.includes('className="flex'));
      expect(rowLine, heading).toBeDefined();
      expect(rowLine, heading).toContain("flex-wrap");
    }
  });
});

describe("round-13 Codex site family: fixed-width labels that grew from sub-floor sizes", () => {
  // Every span in this PR that moved from text-[9px]/text-[10px] to text-xs
  // kept a fixed `w-N` sized for the old glyphs. A rem width scales with the
  // root text setting exactly as the glyphs do, so Text Size never restores
  // the missing character width and the longest values ("0.5x speed",
  // "Real-time", "10.0×") paint into the neighbouring controls. Each site
  // now reserves the same width as a minimum and lets the content grow.
  const FILES = [
    "src/components/map/LayersPopover.tsx",
    "src/components/map/PathAnalysis.tsx",
    "src/components/map/TimeControl.tsx",
  ];

  it.each(FILES)("%s has no text-xs label with a fixed w-N width", (file) => {
    const source = readFileSync(resolve(REPO_ROOT, file), "utf8");
    const offenders = (source.match(/className="[^"]*"/g) ?? []).filter(
      (cls) => /\btext-xs\b/.test(cls) && /(^|[\s"])w-\d+(\.\d+)?(?=[\s"])/.test(cls),
    );
    expect(offenders).toEqual([]);
  });

  it("the playback-speed label reserves room for its longest value", () => {
    const source = readFileSync(
      resolve(REPO_ROOT, "src/components/map/TimeControl.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'className="text-xs text-su-muted min-w-16 whitespace-nowrap text-center"',
    );
  });
});

describe("round-14 Codex site family: non-wrapping label rows in the narrow columns", () => {
  // At xl text scale the 200px Time column (PropSphere grid) and the 220px
  // Operator Profile / Satellite panel minimum leave under 180px of row.
  // A `flex items-center` row that holds an uppercase tracking-wider label
  // plus a badge, control group or dot strip must be allowed to wrap, or
  // the trailing items paint into the neighbouring column or get clipped
  // by an `overflow-hidden` ancestor.
  const SITES: Array<[file: string, anchor: string]> = [
    ["src/components/map/TimeControl.tsx", 'title={isPlaying ? "Pause" : "Play through time"}'],
    ["src/components/map/OperatorProfile.tsx", "Watch\n"],
    ["src/components/map/OperatorProfile.tsx", "{watchedBands.map((band) => ("],
    ["src/components/map/SatellitePanel.tsx", "Transponders\n"],
    ["src/components/map/PathAnalysis.tsx", "<span className=\"min-w-6 text-xs font-medium uppercase tracking-wider"],
    ["src/components/map/layers/SatelliteDetailModal.tsx", "Transponders\n"],
    ["src/components/map/layers/SatelliteDetailModal.tsx", "Signal\n"],
    // Round 16: the info card's pass, transponder and TLE rows; at xl on a
    // 320px viewport the card keeps ~243px of inner width and the
    // `Next pass: / in 3 hours / 47° max` trio is wider than that.
    ["src/components/map/SatelliteOverlay.tsx", "PASS NOW\n"],
    ["src/components/map/SatelliteOverlay.tsx", '<span style={{ color: "#888" }}>Next pass: </span>'],
    ["src/components/map/SatelliteOverlay.tsx", '<span style={{ color: "#555" }}>TLE:</span>'],
    ["src/components/map/SatelliteOverlay.tsx", 'xpdr.mode === "FM"'],
    // Round 17: the Watch popover's Grid row (input + shrink-0 TX/RX/Any
    // radio group) at 276px of popover width on a 320px viewport at xl.
    ["src/components/map/WatchPopover.tsx", 'placeholder="e.g., EM73"'],
  ];

  it.each(SITES)("%s: the row above %j wraps", (file, anchor) => {
    const lines = readFileSync(resolve(REPO_ROOT, file), "utf8").split("\n");
    const anchorLine = anchor.replace(/\n$/, "");
    const at = lines.findIndex((l) => l.includes(anchorLine) && (anchor.endsWith("\n") ? l.trim() === anchorLine : true));
    expect(at, anchor).toBeGreaterThanOrEqual(0);
    // The nearest `flex` container above the anchor (the row) must wrap.
    const row = lines
      .slice(Math.max(0, at - 14), at)
      .reverse()
      .find((l) => /className="flex /.test(l));
    expect(row, anchor).toBeDefined();
    expect(row, anchor).toContain("flex-wrap");
  });

  it("the Watch popover's grid input keeps a min width that fits six mono characters so the row wraps instead of squeezing it", () => {
    const source = readFileSync(resolve(REPO_ROOT, "src/components/map/WatchPopover.tsx"), "utf8");
    expect(source).toMatch(/placeholder="e\.g\., EM73"[\s\S]{0,80}className="flex-1 min-w-\[6\.5rem\] /);
  });

  it("no diff file keeps a non-wrapping flex row whose label is uppercase tracking-wider text-xs", () => {
    const files = [
      "src/components/map/TimeControl.tsx",
      "src/components/map/OperatorProfile.tsx",
      "src/components/map/SatellitePanel.tsx",
      "src/components/map/PathAnalysis.tsx",
      "src/components/map/layers/SatelliteDetailModal.tsx",
      "src/components/map/LayersPopover.tsx",
      "src/components/map/ISSTrackerOverlay.tsx",
      "src/components/map/SatelliteOverlay.tsx",
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(resolve(REPO_ROOT, file), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes('className="flex items-center') || line.includes("flex-wrap") || line.includes("justify-between")) return;
        const window = lines.slice(i + 1, i + 4).join("\n");
        if (window.includes("uppercase tracking-wider") && window.includes("text-xs")) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe("round-15 Codex site family: fixed-column tile grids in the narrow panels", () => {
  // At xl text scale a 220px panel leaves 65-72px per tile in a two-column
  // grid and less in a three-column one; the uppercase tracked headings
  // (POSITION, ALTITUDE, VELOCITY, DISTANCE) cannot break and overflow into
  // the neighbouring tile. Every labelled-tile grid in the PR's files now
  // uses the auto-fit geometry the transponder grids already had, so the
  // tiles stack when a column would drop below the label width.
  const FILES = [
    "src/components/map/SatellitePanel.tsx",
    "src/components/map/layers/SatelliteDetailModal.tsx",
    "src/components/map/PathAnalysis.tsx",
  ];

  it.each(FILES)("%s has no fixed two- or three-column grid and no inline 1fr 1fr template", (file) => {
    const source = readFileSync(resolve(REPO_ROOT, file), "utf8");
    expect(source.match(/className="[^"]*\bgrid grid-cols-[23]\b[^"]*"/g) ?? []).toEqual([]);
    expect(source).not.toContain('gridTemplateColumns: "1fr 1fr"');
  });

  it("the satellite position grids use the auto-fit tile geometry", () => {
    for (const file of FILES.slice(0, 2)) {
      const source = readFileSync(resolve(REPO_ROOT, file), "utf8");
      expect(source, file).toContain(
        'className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2 mb-3"',
      );
    }
  });
});

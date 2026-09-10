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
import { render } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  BandConditionGridCell,
  BAND_GRID_STYLE,
} from "./BandConditionsPanel";
import { TargetHoverTooltip } from "./TargetHoverTooltip";
import BasemapCategory from "./layers/BasemapCategory";
import { ISS_INFO_CARD_WIDTH_STYLE } from "./ISSTrackerOverlay";
import { SATELLITE_INFO_CARD_WIDTH_STYLE } from "./SatelliteOverlay";
import { PassRow } from "./SatellitePanel";
import type { PathBandCondition } from "@/lib/utils/bands";
import type { BandLadderEntry } from "@/hooks/useBandVerdicts";
import type { PassPrediction } from "@/types/satellite";

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

describe("SatelliteOverlay (round-5 sweep: info card width follows its own text)", () => {
  it("sizes the info card's width range in rem instead of a fixed pixel range", () => {
    expect(SATELLITE_INFO_CARD_WIDTH_STYLE.minWidth).toContain("rem");
    expect(SATELLITE_INFO_CARD_WIDTH_STYLE.maxWidth).toContain("rem");
    expect(SATELLITE_INFO_CARD_WIDTH_STYLE.minWidth).not.toBe("200px");
    expect(SATELLITE_INFO_CARD_WIDTH_STYLE.maxWidth).not.toBe("260px");
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

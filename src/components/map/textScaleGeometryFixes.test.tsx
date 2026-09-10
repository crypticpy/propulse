/**
 * Composition guards for two of the three geometry fixes in this #832
 * follow-up round: the grid view's canonical status labels no longer overflow
 * their cell (`BandConditionsPanel.tsx`), and the hover tooltip re-places
 * itself once its real rendered height is known (`TargetHoverTooltip.tsx`).
 *
 * The third fix in this round (the forecast heatmap's per-cell SNR label
 * fit-check, `modals/PropagationForecastModal.tsx`) was carved out of this
 * PR to stay at the 15-file cap; its `snrLabelFits` arithmetic tests were
 * extracted to /tmp/839-modal-fix.test-block.txt for the follow-up PR.
 *
 * jsdom computes no layout -- `getBoundingClientRect` returns zeros for real
 * DOM measurement and a collapsed box is invisible to it. Nothing here
 * asserts on a measured pixel from real layout: the grid-cell checks read
 * the rendered class/style attributes (not layout), and the tooltip check
 * supplies its own controlled height via a mocked `getBoundingClientRect`
 * rather than trusting jsdom to compute one.
 */

import { render } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  BandConditionGridCell,
  BAND_GRID_STYLE,
} from "./BandConditionsPanel";
import { TargetHoverTooltip } from "./TargetHoverTooltip";
import type { PathBandCondition } from "@/lib/utils/bands";
import type { BandLadderEntry } from "@/hooks/useBandVerdicts";

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

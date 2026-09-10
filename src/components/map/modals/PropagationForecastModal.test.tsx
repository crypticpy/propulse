/**
 * Unit tests for `snrLabelFits`, the SNR heat-map label fit check in
 * `PropagationForecastModal.tsx` (#854, carved out of PR #839's #832
 * follow-up round to stay under the 15-file cap -- see
 * /tmp/839-modal-fix.patch and /tmp/839-modal-fix.test-block.txt, and the
 * module doc in `../subTextSizeFloor.test.ts` for the full history).
 *
 * The old gate (`CELL_WIDTH > 20 && CELL_HEIGHT > 20`) was built from two
 * module-level constants, so it was a compile-time `true` that never
 * actually gated anything. `snrLabelFits` is a pure, exported helper so the
 * arithmetic is testable without rendering the SVG (jsdom computes no
 * layout, so a real measurement isn't available here); the last test below
 * additionally renders the component to prove the fix end to end.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HourlyForecast } from "@/lib/utils/bands";
import type { TextScale } from "@/types/user";

const mocks = vi.hoisted(() => ({
  textScale: "md" as TextScale,
}));

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (selector: (state: { textScale: TextScale }) => unknown) =>
    selector({ textScale: mocks.textScale }),
}));

import { CELL_WIDTH, PropagationForecastModal, snrLabelFits } from "./PropagationForecastModal";

describe("snrLabelFits (#854: PropagationForecastModal SNR label)", () => {
  // Worked from the brief: a 3-char value like "-20" at the default (md)
  // scale is 3 * (16 * 0.75 * 0.6) = 21.6 units, barely inside a
  // 22.33-unit CELL_WIDTH; the same value at xl is
  // 3 * (22 * 0.75 * 0.6) = 29.7 units, clearly wider than the cell.
  it("fits a 3-character value at the default scale but not at xl", () => {
    expect(snrLabelFits(-20, CELL_WIDTH, "md")).toBe(true);
    expect(snrLabelFits(-20, CELL_WIDTH, "xl")).toBe(false);
  });

  it("holds the exact <= boundary with the fit margin", () => {
    // 1-char value at md: 1 * (16 * 0.75 * 0.6) = 7.2, + 0.5 margin = 7.7.
    expect(snrLabelFits(5, 7.7, "md")).toBe(true);
    expect(snrLabelFits(5, 7.699999, "md")).toBe(false);
  });

  it("defaults to the md scale when none is given", () => {
    expect(snrLabelFits(-20, CELL_WIDTH)).toBe(true);
  });

  it("fails a two-digit value at a cell too narrow for it, regardless of scale", () => {
    // 2-char value at md: 2 * (16 * 0.75 * 0.6) = 14.4 units.
    expect(snrLabelFits(12, 14, "md")).toBe(false);
    expect(snrLabelFits(12, 14.4, "md")).toBe(false);
    expect(snrLabelFits(12, 14.9, "md")).toBe(true);
  });

  it("fails a negative two-digit value the same way a positive one does, plus the sign character", () => {
    // "-12" is 3 characters, one more than "12".
    expect(snrLabelFits(-12, 14.9, "md")).toBe(false);
    expect(snrLabelFits(-12, 25, "md")).toBe(true);
  });
});

describe("PropagationForecastModal SNR label at scale (#854)", () => {
  const forecast: HourlyForecast[] = [
    {
      hour: 0,
      bands: [{ band: "20m", status: "good", snrEstimate: -20 }],
    },
  ];

  function renderModal() {
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

  it("shows the SNR label at the default (md) scale but hides it once the scale grows to xl", () => {
    mocks.textScale = "md";
    const { rerender } = renderModal();
    expect(screen.getByText("-20")).toBeTruthy();

    mocks.textScale = "xl";
    rerender(
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
    expect(screen.queryByText("-20")).toBeNull();
  });
});

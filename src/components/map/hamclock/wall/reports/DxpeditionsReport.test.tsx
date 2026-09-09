import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DxpeditionsReport } from "./DxpeditionsReport";

const mocks = vi.hoisted(() => ({ dxpeditions: vi.fn() }));

vi.mock("@/hooks/useDxpeditions", () => ({
  useDxpeditions: mocks.dxpeditions,
  formatDateRange: () => "",
}));
vi.mock("@/hooks/useUTCClock", () => ({
  useUTCClock: () => new Date("2026-09-09T13:10:00.000Z"),
}));

// F3 (#609 review): identical bug to ContestsReport — the footer passed
// `now` as both the update timestamp and the comparison time, so it claimed
// NG3K ADXO updated "JUST NOW" every tick despite the hook's hour-long
// client cache and six-hour server cache. The footer must reflect
// `dataUpdatedAt`, not the render clock.
describe("DxpeditionsReport footer timestamp", () => {
  it("shows when NG3K ADXO was actually fetched, not the render clock", () => {
    mocks.dxpeditions.mockReturnValue({
      entries: [],
      status: "ok",
      // Fetched 45 minutes before the clock reads "now" — well inside the
      // hook's hour-long cache, so a naive "now" timestamp would lie.
      dataUpdatedAt: Date.parse("2026-09-09T12:25:00.000Z"),
      isLoading: false,
      error: null,
    });

    render(<DxpeditionsReport open onClose={() => {}} />);

    const footText = document.querySelector(".hcr-foot")?.textContent ?? "";
    expect(footText).toContain("UPDATED 12:25 UTC");
    expect(footText).toContain("45 MIN AGO");
    expect(footText).not.toContain("JUST NOW");
  });

  it("reports WAITING before the schedule has ever resolved", () => {
    mocks.dxpeditions.mockReturnValue({
      entries: [],
      status: "ok",
      dataUpdatedAt: 0,
      isLoading: true,
      error: null,
    });

    render(<DxpeditionsReport open onClose={() => {}} />);

    expect(document.querySelector(".hcr-foot")?.textContent).toContain(
      "WAITING",
    );
  });
});

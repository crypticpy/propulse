import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContestsReport } from "./ContestsReport";

const mocks = vi.hoisted(() => ({ rss: vi.fn() }));

vi.mock("@/hooks/useRssFeed", () => ({ useRssFeed: mocks.rss }));
vi.mock("@/hooks/useUTCClock", () => ({
  useUTCClock: () => new Date("2026-09-09T13:10:00.000Z"),
}));

// F3 (#609 review): the footer used to pass `now` as both the update
// timestamp and the comparison time, so it claimed the WA7BNM feed updated
// "JUST NOW" on every clock tick even while React Query served cached data.
// The footer must reflect when the feed was actually fetched
// (`dataUpdatedAt`), not the render clock.
describe("ContestsReport footer timestamp", () => {
  it("shows when the WA7BNM feed was actually fetched, not the render clock", () => {
    mocks.rss.mockReturnValue({
      items: [],
      status: "ok",
      // Fetched 6 minutes before the clock reads "now".
      dataUpdatedAt: Date.parse("2026-09-09T13:04:00.000Z"),
      isLoading: false,
      error: null,
    });

    render(<ContestsReport open onClose={() => {}} />);

    const footText = document.querySelector(".hcr-foot")?.textContent ?? "";
    expect(footText).toContain("UPDATED 13:04 UTC");
    expect(footText).toContain("6 MIN AGO");
    expect(footText).not.toContain("JUST NOW");
  });

  it("reports WAITING before the feed has ever resolved", () => {
    mocks.rss.mockReturnValue({
      items: [],
      status: "ok",
      dataUpdatedAt: 0,
      isLoading: true,
      error: null,
    });

    render(<ContestsReport open onClose={() => {}} />);

    expect(document.querySelector(".hcr-foot")?.textContent).toContain(
      "WAITING",
    );
  });
});

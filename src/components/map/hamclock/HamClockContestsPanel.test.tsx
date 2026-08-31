import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HamClockContestsPanel, WA7BNM_RSS_URL } from "./HamClockContestsPanel";

const mocks = vi.hoisted(() => ({ rss: vi.fn() }));

vi.mock("@/hooks/useRssFeed", () => ({ useRssFeed: mocks.rss }));
vi.mock("@/hooks/useUTCClock", () => ({
  useUTCClock: () => new Date("2026-08-31T13:30:00.000Z"),
}));

describe("HamClockContestsPanel", () => {
  it("renders active and upcoming WA7BNM entries with countdowns and source", () => {
    mocks.rss.mockReturnValue({
      items: [
        {
          id: "active",
          title: "Active Sprint",
          link: "https://www.contestcalendar.com/active",
          publishedAt: null,
          summary: "1300Z-1400Z, Aug 31",
        },
        {
          id: "upcoming",
          title: "Evening Test",
          link: null,
          publishedAt: null,
          summary: "1900Z-2000Z, Aug 31",
        },
      ],
      status: "ok",
      isLoading: false,
      error: null,
    });

    render(<HamClockContestsPanel />);

    expect(mocks.rss).toHaveBeenCalledWith(WA7BNM_RSS_URL);
    expect(screen.getByText("NOW")).toBeTruthy();
    expect(screen.getByText("Ends in 30m")).toBeTruthy();
    expect(screen.getByText("Starts in 5h 30m")).toBeTruthy();
    expect(screen.getByRole("link", { name: /WA7BNM Contest Calendar/i })).toBeTruthy();
  });

  it("reports a rejected feed as unavailable rather than empty", () => {
    mocks.rss.mockReturnValue({
      items: [],
      status: "ok",
      isLoading: false,
      error: new Error("rate limited"),
    });

    render(<HamClockContestsPanel />);

    expect(screen.getByText("Contest calendar unavailable")).toBeTruthy();
    expect(screen.queryByText(/No contests/)).toBeNull();
  });
});

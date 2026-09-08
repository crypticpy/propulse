import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WA7BNM_RSS_URL } from "@/lib/hamclock/wallCalendar";
import { ContestsTile } from "./ContestsTile";

const mocks = vi.hoisted(() => ({ rss: vi.fn() }));

vi.mock("@/hooks/useRssFeed", () => ({ useRssFeed: mocks.rss }));
vi.mock("@/hooks/useUTCClock", () => ({
  useUTCClock: () => new Date("2026-08-31T13:30:00.000Z"),
}));

describe("ContestsTile", () => {
  it("heroes on-air count and lists NOW ahead of upcoming", () => {
    mocks.rss.mockReturnValue({
      items: [
        {
          id: "upcoming",
          title: "Evening Test",
          link: null,
          publishedAt: null,
          summary: "1900Z-2000Z, Aug 31",
        },
        {
          id: "active",
          title: "Active Sprint",
          link: "https://www.contestcalendar.com/active",
          publishedAt: null,
          summary: "1300Z-1400Z, Aug 31",
        },
      ],
      status: "ok",
      isLoading: false,
      error: null,
    });

    render(<ContestsTile />);

    expect(mocks.rss).toHaveBeenCalledWith(WA7BNM_RSS_URL);
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("ON AIR")).toBeTruthy();
    expect(screen.getByText("NOW")).toBeTruthy();
    expect(screen.getByText("Active Sprint")).toBeTruthy();
    expect(screen.getByText("Ends in 30m")).toBeTruthy();
    expect(screen.getByText("Starts in 5h 30m")).toBeTruthy();
  });

  it("reports a rejected feed as unavailable rather than empty", () => {
    mocks.rss.mockReturnValue({
      items: [],
      status: "ok",
      isLoading: false,
      error: new Error("rate limited"),
    });

    render(<ContestsTile />);

    expect(screen.getByText("CONTEST CALENDAR UNAVAILABLE")).toBeTruthy();
    expect(screen.queryByText("ON AIR")).toBeNull();
  });

  it("opens the report with the WA7BNM source link", async () => {
    mocks.rss.mockReturnValue({
      items: [
        {
          id: "active",
          title: "Active Sprint",
          link: "https://www.contestcalendar.com/active",
          publishedAt: null,
          summary: "1300Z-1400Z, Aug 31",
        },
      ],
      status: "ok",
      isLoading: false,
      error: null,
    });

    render(<ContestsTile />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the contest report/i }),
    );
    expect(
      await screen.findByRole("link", { name: /WA7BNM Contest Calendar/i }),
    ).toBeTruthy();
  });
});

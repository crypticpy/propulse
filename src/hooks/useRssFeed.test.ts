import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { relativeTime, useRssFeeds } from "@/hooks/useRssFeed";

const queryMocks = vi.hoisted(() => ({
  useQueries: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => queryMocks);

const NOW = new Date("2026-09-05T12:00:00.000Z");

describe("relativeTime", () => {
  it("returns an empty string for a null timestamp", () => {
    expect(relativeTime(null, NOW)).toBe("");
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("");
  });

  it("reports just now for sub-minute deltas", () => {
    expect(relativeTime("2026-09-05T11:59:45.000Z", NOW)).toBe("just now");
  });

  it("reports minutes ago", () => {
    expect(relativeTime("2026-09-05T11:30:00.000Z", NOW)).toBe("30m ago");
    expect(relativeTime("2026-09-05T11:57:00.000Z", NOW)).toBe("3m ago");
  });

  it("reports hours ago", () => {
    expect(relativeTime("2026-09-05T09:30:00.000Z", NOW)).toBe("2h ago");
  });

  it("reports days ago", () => {
    expect(relativeTime("2026-09-02T12:00:00.000Z", NOW)).toBe("3d ago");
  });

  it("falls back to a short date past 30 days", () => {
    expect(relativeTime("2026-06-01T12:00:00.000Z", NOW)).toBe("Jun 1");
  });

  it("clamps future-dated (clock-skew) timestamps to just now", () => {
    expect(relativeTime("2026-09-05T12:05:00.000Z", NOW)).toBe("just now");
  });
});

describe("useRssFeeds", () => {
  beforeEach(() => {
    queryMocks.useQueries.mockReset();
    queryMocks.useQueries.mockReturnValue([{}]);
  });

  it("polls crawl feeds when their cache becomes stale", () => {
    renderHook(() =>
      useRssFeeds([{ id: "arrl", url: "https://example.com/rss" }]),
    );

    const options = queryMocks.useQueries.mock.calls[0][0].queries[0];
    expect(options.staleTime).toBe(10 * 60 * 1000);
    expect(options.refetchInterval).toBe(options.staleTime);
  });
});

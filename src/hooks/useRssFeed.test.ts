import { describe, expect, it } from "vitest";
import { relativeTime } from "@/hooks/useRssFeed";

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

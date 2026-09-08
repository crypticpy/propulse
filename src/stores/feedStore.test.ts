import { describe, expect, it } from "vitest";
import {
  DEFAULT_TICKER_CRAWL_PREFERENCES,
  normalizePersistedFeedState,
} from "./feedStore";

describe("feedStore crawl migration", () => {
  it("preserves legacy feeds while enabling bounded crawl defaults", () => {
    const migrated = normalizePersistedFeedState({
      feeds: [
        {
          id: "legacy",
          url: "https://example.com/rss",
          label: "Legacy feed",
        },
      ],
      activeFeedId: "legacy",
    });

    expect(migrated.feeds).toEqual([
      {
        id: "legacy",
        url: "https://example.com/rss",
        label: "Legacy feed",
        crawlEnabled: true,
        crawlMaxAgeHours: 24,
      },
    ]);
    expect(migrated.crawlPreferences).toEqual(
      DEFAULT_TICKER_CRAWL_PREFERENCES,
    );
  });
});


it("normalizes stored refresh intervals without discarding legacy feeds", () => {
  expect(normalizePersistedFeedState({ refreshMinutes: 30 }).refreshMinutes).toBe(30);
  expect(normalizePersistedFeedState({ refreshMinutes: -1 }).refreshMinutes).toBe(10);
  expect(normalizePersistedFeedState({}).refreshMinutes).toBe(10);
});

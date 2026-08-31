import { describe, expect, it } from "vitest";
import type { FeedSource } from "@/stores/feedStore";
import {
  buildRssCrawlHeadlines,
  meetsSolarTickerThreshold,
  meetsWeatherTickerThreshold,
  pruneBreakInHistory,
} from "./tickerCrawl";

const feeds: FeedSource[] = [
  {
    id: "arrl",
    label: "ARRL",
    url: "https://example.com/arrl.xml",
    crawlEnabled: true,
    crawlMaxAgeHours: 6,
  },
  {
    id: "club",
    label: "Club",
    url: "https://example.com/club.xml",
    crawlEnabled: true,
    crawlMaxAgeHours: 24,
  },
];

describe("ticker crawl helpers", () => {
  it("applies independent space-weather and NWS thresholds", () => {
    expect(meetsSolarTickerThreshold("WARNING", "WARNING")).toBe(true);
    expect(meetsSolarTickerThreshold("INFO", "WARNING")).toBe(false);
    expect(meetsSolarTickerThreshold("CRITICAL", "off")).toBe(false);
    expect(meetsWeatherTickerThreshold("Extreme", "Severe")).toBe(true);
    expect(meetsWeatherTickerThreshold("Moderate", "Severe")).toBe(false);
  });

  it("honors per-feed age windows and deduplicates shared links", () => {
    const now = new Date("2026-08-31T12:00:00.000Z").getTime();
    const shared = {
      id: "shared",
      title: "Shared story",
      link: "https://example.com/shared",
      publishedAt: "2026-08-31T10:00:00.000Z",
      summary: "Same syndicated item",
    };
    const headlines = buildRssCrawlHeadlines(
      feeds,
      [
        {
          source: { id: "arrl" },
          items: [
            shared,
            {
              ...shared,
              id: "old",
              link: "https://example.com/old",
              publishedAt: "2026-08-31T04:00:00.000Z",
            },
            {
              ...shared,
              id: "undated",
              link: "https://example.com/undated",
              publishedAt: null,
            },
            {
              ...shared,
              id: "invalid-date",
              link: "https://example.com/invalid-date",
              publishedAt: "not-a-date",
            },
          ],
        },
        { source: { id: "club" }, items: [shared] },
      ],
      now,
    );

    expect(headlines).toHaveLength(1);
    expect(headlines[0].feed.id).toBe("arrl");
  });

  it("prunes repeated break-ins at the configured window", () => {
    expect(
      pruneBreakInHistory(
        { recent: 9_900, old: 1_000, invalid: Number.NaN },
        10_000,
        0.1,
      ),
    ).toEqual({ recent: 9_900 });
  });
});

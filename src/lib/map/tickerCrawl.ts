import type { RssFeedItem } from "@/hooks/useRssFeed";
import type {
  FeedSource,
  TickerSolarThreshold,
  TickerWeatherThreshold,
} from "@/stores/feedStore";
import type { AlertPriority } from "@/types/alerts";
import type { WeatherAlert } from "@/lib/api/weather";

const SOLAR_RANK: Record<AlertPriority, number> = {
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3,
};

const WEATHER_RANK: Record<WeatherAlert["severity"], number> = {
  Unknown: 0,
  Minor: 1,
  Moderate: 2,
  Severe: 3,
  Extreme: 4,
};

export function meetsSolarTickerThreshold(
  priority: AlertPriority,
  threshold: TickerSolarThreshold,
): boolean {
  return threshold !== "off" && SOLAR_RANK[priority] >= SOLAR_RANK[threshold];
}

export function meetsWeatherTickerThreshold(
  severity: WeatherAlert["severity"],
  threshold: TickerWeatherThreshold,
): boolean {
  return (
    threshold !== "off" &&
    WEATHER_RANK[severity] >= WEATHER_RANK[threshold]
  );
}

export interface RssCrawlResult {
  source: { id: string };
  items: RssFeedItem[];
}

export interface RssCrawlHeadline {
  key: string;
  feed: FeedSource;
  item: RssFeedItem;
  publishedAtMs: number;
}

function rssItemKey(item: RssFeedItem): string {
  const link = item.link?.trim();
  if (link) {
    try {
      // URL parses scheme and hostname with their case-insensitive semantics
      // while preserving case-sensitive path, query, and fragment data.
      return `link:${new URL(link).toString()}`;
    } catch {
      // Relative or opaque links have no trustworthy base here. Preserve them
      // exactly rather than silently merging case-distinct provider values.
      return `link:${link}`;
    }
  }

  const id = item.id?.trim();
  if (id) return `id:${id}`;

  // Titles are human-readable fallback text, where case-only differences are
  // much more likely to be syndicated duplicates than distinct identifiers.
  return `title:${item.title.trim().toLocaleLowerCase()}`;
}

/**
 * Merge enabled RSS feeds into one newest-first crawl while honoring each
 * source's freshness threshold and removing cross-feed duplicates.
 */
export function buildRssCrawlHeadlines(
  feeds: readonly FeedSource[],
  results: readonly RssCrawlResult[],
  nowMs: number,
  limit = 8,
): RssCrawlHeadline[] {
  const feedById = new Map(feeds.map((feed) => [feed.id, feed]));
  const seen = new Set<string>();
  const headlines: RssCrawlHeadline[] = [];

  for (const result of results) {
    const feed = feedById.get(result.source.id);
    if (!feed?.crawlEnabled) continue;
    const cutoffMs = nowMs - feed.crawlMaxAgeHours * 60 * 60 * 1000;

    for (const item of result.items) {
      const publishedAtMs = item.publishedAt
        ? new Date(item.publishedAt).getTime()
        : null;
      if (
        publishedAtMs === null ||
        !Number.isFinite(publishedAtMs) ||
        publishedAtMs < cutoffMs
      ) {
        continue;
      }

      const key = rssItemKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      headlines.push({
        key,
        feed,
        item,
        publishedAtMs,
      });
    }
  }

  return headlines
    .sort((left, right) =>
      left.publishedAtMs == null
        ? 1
        : right.publishedAtMs == null
          ? -1
          : right.publishedAtMs - left.publishedAtMs,
    )
    .slice(0, Math.max(0, limit));
}

export type TickerAlertLevel = "info" | "warning" | "critical";

export function tickerAlertRank(level: TickerAlertLevel): number {
  return level === "critical" ? 3 : level === "warning" ? 2 : 1;
}

export interface BreakInHistory {
  [key: string]: number;
}

/** Keep only recent finite timestamps so storage cannot grow without bound. */
export function pruneBreakInHistory(
  history: BreakInHistory,
  nowMs: number,
  dedupMinutes: number,
): BreakInHistory {
  const cutoffMs = nowMs - dedupMinutes * 60 * 1000;
  return Object.fromEntries(
    Object.entries(history).filter(
      ([, timestamp]) => Number.isFinite(timestamp) && timestamp >= cutoffMs,
    ),
  );
}

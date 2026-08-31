/**
 * Zustand store for user-configured news/RSS feeds (Dashboard E6 parity).
 *
 * Operators can pin up to MAX_FEEDS RSS/Atom feed URLs (club announcements,
 * contest calendars, blogs) and pick one as the active feed shown on the
 * News dashboard card. URL validation happens at the UI boundary
 * (NewsFeedCard) before addFeed is called; the server re-validates anyway.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AlertPriority } from "@/types/alerts";

export const MAX_FEEDS = 5;

export type CrawlFeedMaxAgeHours = 1 | 6 | 24 | 72;
export type TickerSolarThreshold = AlertPriority | "off";
export type TickerWeatherThreshold =
  | "Moderate"
  | "Severe"
  | "Extreme"
  | "off";

export interface FeedSource {
  id: string;
  url: string;
  label: string;
  /** Whether this source contributes headlines to the HamClock crawl. */
  crawlEnabled: boolean;
  /** Per-feed freshness threshold for crawl headlines. */
  crawlMaxAgeHours: CrawlFeedMaxAgeHours;
}

export interface TickerCrawlPreferences {
  solarThreshold: TickerSolarThreshold;
  weatherThreshold: TickerWeatherThreshold;
  breakInToneEnabled: boolean;
  breakInVolume: number;
  dedupMinutes: 15 | 60 | 360 | 1440;
}

export const DEFAULT_TICKER_CRAWL_PREFERENCES: TickerCrawlPreferences = {
  solarThreshold: "INFO",
  weatherThreshold: "Moderate",
  breakInToneEnabled: true,
  breakInVolume: 45,
  dedupMinutes: 360,
};

const DEFAULT_FEEDS: FeedSource[] = [
  {
    id: "default-arrl",
    url: "https://www.arrl.org/news/rss",
    label: "ARRL News",
    crawlEnabled: true,
    crawlMaxAgeHours: 24,
  },
];

interface FeedStore {
  feeds: FeedSource[];
  activeFeedId: string | null;
  crawlPreferences: TickerCrawlPreferences;

  /** Adds a feed (label derived from the URL's hostname); no-op past MAX_FEEDS */
  addFeed: (url: string) => FeedSource | null;
  /** Removes a feed; the last remaining feed cannot be removed */
  removeFeed: (id: string) => void;
  setActiveFeed: (id: string) => void;
  updateFeedCrawl: (
    id: string,
    patch: Partial<Pick<FeedSource, "crawlEnabled" | "crawlMaxAgeHours">>,
  ) => void;
  updateCrawlPreferences: (patch: Partial<TickerCrawlPreferences>) => void;
}

function labelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Upgrade legacy dashboard-only feeds into crawl-capable persisted state. */
export function normalizePersistedFeedState(
  persisted: unknown,
): FeedStore {
  const state = persisted as Partial<FeedStore>;
  const feeds = (state.feeds ?? DEFAULT_FEEDS).map((feed) => ({
    ...feed,
    crawlEnabled: feed.crawlEnabled ?? true,
    crawlMaxAgeHours: feed.crawlMaxAgeHours ?? 24,
  }));
  return {
    ...state,
    feeds,
    activeFeedId: state.activeFeedId ?? feeds[0]?.id ?? null,
    crawlPreferences: {
      ...DEFAULT_TICKER_CRAWL_PREFERENCES,
      ...state.crawlPreferences,
    },
  } as FeedStore;
}

export const useFeedStore = create<FeedStore>()(
  persist(
    (set, get) => ({
      feeds: DEFAULT_FEEDS,
      activeFeedId: DEFAULT_FEEDS[0].id,
      crawlPreferences: DEFAULT_TICKER_CRAWL_PREFERENCES,

      addFeed: (url) => {
        const { feeds } = get();
        if (feeds.length >= MAX_FEEDS) return null;
        const created: FeedSource = {
          id: crypto.randomUUID(),
          url,
          label: labelFromUrl(url),
          crawlEnabled: true,
          crawlMaxAgeHours: 24,
        };
        set((state) => ({ feeds: [...state.feeds, created] }));
        return created;
      },

      removeFeed: (id) =>
        set((state) => {
          if (state.feeds.length <= 1) return state;
          const feeds = state.feeds.filter((f) => f.id !== id);
          return {
            feeds,
            activeFeedId:
              state.activeFeedId === id
                ? (feeds[0]?.id ?? null)
                : state.activeFeedId,
          };
        }),

      setActiveFeed: (id) => set({ activeFeedId: id }),

      updateFeedCrawl: (id, patch) =>
        set((state) => ({
          feeds: state.feeds.map((feed) =>
            feed.id === id ? { ...feed, ...patch } : feed,
          ),
        })),

      updateCrawlPreferences: (patch) =>
        set((state) => ({
          crawlPreferences: { ...state.crawlPreferences, ...patch },
        })),
    }),
    {
      name: "propulse-feeds",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: normalizePersistedFeedState,
    },
  ),
);

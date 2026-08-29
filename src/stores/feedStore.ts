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

export const MAX_FEEDS = 5;

export interface FeedSource {
  id: string;
  url: string;
  label: string;
}

const DEFAULT_FEEDS: FeedSource[] = [
  {
    id: "default-arrl",
    url: "https://www.arrl.org/news/rss",
    label: "ARRL News",
  },
];

interface FeedStore {
  feeds: FeedSource[];
  activeFeedId: string | null;

  /** Adds a feed (label derived from the URL's hostname); no-op past MAX_FEEDS */
  addFeed: (url: string) => FeedSource | null;
  /** Removes a feed; the last remaining feed cannot be removed */
  removeFeed: (id: string) => void;
  setActiveFeed: (id: string) => void;
}

function labelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const useFeedStore = create<FeedStore>()(
  persist(
    (set, get) => ({
      feeds: DEFAULT_FEEDS,
      activeFeedId: DEFAULT_FEEDS[0].id,

      addFeed: (url) => {
        const { feeds } = get();
        if (feeds.length >= MAX_FEEDS) return null;
        const created: FeedSource = {
          id: crypto.randomUUID(),
          url,
          label: labelFromUrl(url),
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
    }),
    {
      name: "propulse-feeds",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown) => {
        const state = persisted as Record<string, unknown>;
        return state as unknown as FeedStore;
      },
    },
  ),
);

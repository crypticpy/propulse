/**
 * useRssFeed Hook
 *
 * Fetches a normalized RSS/Atom feed via the /api/feeds/rss edge proxy.
 * Gated on a truthy url; the server does its own SSRF/URL validation, so
 * the client only needs to pass through the value the user configured.
 *
 * @module hooks/useRssFeed
 */

import { useQuery } from "@tanstack/react-query";

const MINUTE = 60 * 1000;

export interface RssFeedItem {
  id: string | null;
  title: string;
  link: string | null;
  publishedAt: string | null;
  summary: string;
}

export type RssFeedStatus = "ok" | "unreachable" | "too_large" | "empty";

interface RssFeedResponse {
  status: RssFeedStatus;
  feed: { title: string; link: string | null } | null;
  items: RssFeedItem[];
}

/** Relative "Nm/Nh/Nd ago" label; falls back to a short date past 30 days. */
export function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const diffSec = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function useRssFeed(url: string | null) {
  const { data, isLoading, error } = useQuery<RssFeedResponse>({
    queryKey: ["rss-feed", url],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/feeds/rss?url=${encodeURIComponent(url as string)}`,
        { signal },
      );
      if (!res.ok) throw new Error(`RSS feed fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!url,
    staleTime: 10 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return {
    feed: data?.feed ?? null,
    items: data?.items ?? [],
    status: data?.status ?? "ok",
    isLoading,
    error: error as Error | null,
  };
}

export default useRssFeed;

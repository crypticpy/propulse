/**
 * NewsFeedCard Component (E6 parity)
 *
 * Dashboard card showing the operator's active RSS/Atom feed (club
 * announcements, contest calendars, blogs) via the /api/feeds/rss edge
 * proxy. Existing feeds are selected/removed inline; additions use the shared
 * verified news configuration dialog.
 *
 * @module components/dashboard/NewsFeedCard
 */

import { lazy, Suspense, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useFeedStore } from "@/stores/feedStore";
import { useRssFeed, relativeTime } from "@/hooks/useRssFeed";

const MAX_VISIBLE_ITEMS = 6;

const NewsFeedsConfigDialog = lazy(() => import("@/components/map/hamclock/wall/config/NewsFeedsConfig").then(module => ({ default: module.NewsFeedsConfigDialog })));

export interface NewsFeedCardProps {
  className?: string;
}

export function NewsFeedCard({ className = "" }: NewsFeedCardProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const activeFeedId = useFeedStore((s) => s.activeFeedId);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const setActiveFeed = useFeedStore((s) => s.setActiveFeed);

  const activeFeed = feeds.find((f) => f.id === activeFeedId) ?? feeds[0] ?? null;
  const { items, status, isLoading, error } = useRssFeed(activeFeed?.url ?? null);

  const [editing, setEditing] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);


  const degraded = status !== "ok" || error != null;
  const statusMessage =
    status === "unreachable"
      ? "Feed unreachable"
      : status === "too_large"
        ? "Feed too large"
        : status === "empty"
          ? "No items"
          : error != null
            ? "Feed URL rejected or unavailable"
            : null;

  return (
    <Card className={className} role="region" aria-label="News">
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide shrink-0">
            News
          </span>
          <span className="text-[10px] text-gray-500 truncate">
            {activeFeed?.label ?? "No feed"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-gray-400 hover:text-white shrink-0"
          aria-label="Manage feeds"
          aria-expanded={editing}
        >
          {"⚙"}
        </button>
      </div>

      {editing && (
        <div className="mb-2 pb-2 border-b border-white/10 space-y-1.5">
          {feeds.map((f) => (
            <div key={f.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveFeed(f.id)}
                className={`flex-1 min-w-0 text-left text-xs truncate rounded px-1.5 py-1 ${
                  f.id === activeFeed?.id
                    ? "bg-nebula-blue/20 text-nebula-blue"
                    : "text-gray-300 hover:bg-white/5"
                }`}
              >
                {f.label}
              </button>
              <button
                type="button"
                onClick={() => removeFeed(f.id)}
                disabled={feeds.length <= 1}
                className="text-gray-400 hover:text-alert-red disabled:opacity-30 px-1 shrink-0"
                aria-label={`Remove ${f.label}`}
              >
                {"✕"}
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setConfigOpen(true)}
            className="text-xs font-medium rounded-lg px-3 py-1.5">
            VERIFY & ADD NEWS FEED
          </button>
        </div>
      )}

      {statusMessage && !isLoading && (
        <div className="text-xs text-gray-500">{statusMessage}</div>
      )}

      {!degraded && !isLoading && items.length === 0 && (
        <div className="text-xs text-gray-500">No items</div>
      )}

      {!degraded && items.length > 0 && (
        <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
          {items.slice(0, MAX_VISIBLE_ITEMS).map((item) => (
            <div key={item.id ?? item.link ?? item.title} className="py-1.5">
              {item.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-200 hover:text-nebula-blue line-clamp-2"
                >
                  {item.title}
                </a>
              ) : (
                <div className="text-xs text-gray-200 line-clamp-2">
                  {item.title}
                </div>
              )}
              {item.publishedAt && (
                <div className="text-[10px] text-gray-500 font-mono tabular-nums">
                  {relativeTime(item.publishedAt, now)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {configOpen && <Suspense fallback={null}><NewsFeedsConfigDialog open onAdded={setActiveFeed} onClose={() => setConfigOpen(false)} /></Suspense>}
    </Card>
  );
}

NewsFeedCard.displayName = "NewsFeedCard";

export default NewsFeedCard;

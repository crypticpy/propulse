/**
 * NewsFeedCard Component (E6 parity)
 *
 * Dashboard card showing the operator's active RSS/Atom feed (club
 * announcements, contest calendars, blogs) via the /api/feeds/rss edge
 * proxy. Feed management (add/remove/select) happens inline behind a gear
 * toggle -- no flyouts, no modals.
 *
 * @module components/dashboard/NewsFeedCard
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useFeedStore, MAX_FEEDS } from "@/stores/feedStore";
import { useRssFeed, relativeTime } from "@/hooks/useRssFeed";

const MAX_VISIBLE_ITEMS = 6;

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export interface NewsFeedCardProps {
  className?: string;
}

export function NewsFeedCard({ className = "" }: NewsFeedCardProps) {
  const feeds = useFeedStore((s) => s.feeds);
  const activeFeedId = useFeedStore((s) => s.activeFeedId);
  const addFeed = useFeedStore((s) => s.addFeed);
  const removeFeed = useFeedStore((s) => s.removeFeed);
  const setActiveFeed = useFeedStore((s) => s.setActiveFeed);

  const activeFeed = feeds.find((f) => f.id === activeFeedId) ?? feeds[0] ?? null;
  const { items, status, isLoading, error } = useRssFeed(activeFeed?.url ?? null);

  const [editing, setEditing] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const handleAdd = () => {
    const trimmed = newUrl.trim();
    if (!isValidHttpUrl(trimmed)) {
      setUrlError("Enter a valid http(s) URL");
      return;
    }
    const created = addFeed(trimmed);
    if (!created) {
      setUrlError(`Limit of ${MAX_FEEDS} feeds reached`);
      return;
    }
    setActiveFeed(created.id);
    setNewUrl("");
    setUrlError(null);
  };

  // A 400 from the SSRF gate throws in the hook (no status in the payload) —
  // surface it instead of rendering an empty ok-state
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
          <span className="text-sm font-medium text-su-muted uppercase tracking-wide shrink-0">
            News
          </span>
          <span className="text-sm text-su-muted/80 truncate">
            {activeFeed?.label ?? "No feed"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-su-muted hover:text-su-text shrink-0"
          aria-label="Manage feeds"
          aria-expanded={editing}
        >
          {"⚙"}
        </button>
      </div>

      {editing && (
        <div className="mb-2 pb-2 border-b border-su-line/40 space-y-1.5">
          {feeds.map((f) => (
            <div key={f.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveFeed(f.id)}
                className={`flex-1 min-w-0 text-left text-sm truncate rounded px-1.5 py-1 ${
                  f.id === activeFeed?.id
                    ? "bg-su-info/20 text-su-info"
                    : "text-su-muted hover:bg-su-input"
                }`}
              >
                {f.label}
              </button>
              <button
                type="button"
                onClick={() => removeFeed(f.id)}
                disabled={feeds.length <= 1}
                className="text-su-muted hover:text-su-danger disabled:opacity-30 px-1 shrink-0"
                aria-label={`Remove ${f.label}`}
              >
                {"✕"}
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="text"
              value={newUrl}
              onChange={(e) => {
                setNewUrl(e.target.value);
                setUrlError(null);
              }}
              placeholder="https://example.com/feed.xml"
              className="flex-1 min-w-0 text-sm bg-su-input border border-su-line/40 rounded-lg px-2 py-1.5 text-su-text placeholder:text-su-muted/80"
              aria-label="New feed URL"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={feeds.length >= MAX_FEEDS}
              className="text-sm font-medium text-su-on-accent bg-su-accent/80 hover:bg-su-accent disabled:opacity-30 rounded-lg px-3 py-1.5 shrink-0"
            >
              Add
            </button>
          </div>
          {urlError && (
            <div className="text-sm text-su-danger">{urlError}</div>
          )}
        </div>
      )}

      {statusMessage && !isLoading && (
        <div className="text-sm text-su-muted/80">{statusMessage}</div>
      )}

      {!degraded && !isLoading && items.length === 0 && (
        <div className="text-sm text-su-muted/80">No items</div>
      )}

      {!degraded && items.length > 0 && (
        <div className="max-h-56 overflow-y-auto divide-y divide-su-line/20">
          {items.slice(0, MAX_VISIBLE_ITEMS).map((item) => (
            <div key={item.id ?? item.link ?? item.title} className="py-1.5">
              {item.link ? (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-su-text hover:text-su-info line-clamp-2"
                >
                  {item.title}
                </a>
              ) : (
                <div className="text-sm text-su-text line-clamp-2">
                  {item.title}
                </div>
              )}
              {item.publishedAt && (
                <div className="text-sm text-su-muted/80 font-mono tabular-nums">
                  {relativeTime(item.publishedAt, now)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

NewsFeedCard.displayName = "NewsFeedCard";

export default NewsFeedCard;

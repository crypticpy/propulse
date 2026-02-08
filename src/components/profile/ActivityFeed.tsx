/**
 * ActivityFeed — Reverse-chronological activity feed for the Social tab.
 *
 * Shows events from the user and followed operators.
 * Uses IntersectionObserver for infinite scroll pagination.
 */

import { useEffect, useRef, useCallback } from "react";
import { useSocialStore } from "@/stores/socialStore";
import type { ActivityEventType } from "@/types/social";

// ── Time formatting ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ── Event icons ─────────────────────────────────────────────────────────

const EVENT_ICONS: Record<ActivityEventType, string> = {
  qso_milestone: "Q",
  award_earned: "A",
  achievement_unlocked: "U",
  new_dxcc: "D",
  contest_result: "C",
  equipment_change: "E",
  location_change: "L",
};

const EVENT_COLORS: Record<ActivityEventType, string> = {
  qso_milestone: "bg-signal-green/20 text-signal-green",
  award_earned: "bg-plasma-orange/20 text-plasma-orange",
  achievement_unlocked: "bg-caution-amber/20 text-caution-amber",
  new_dxcc: "bg-nebula-blue/20 text-nebula-blue",
  contest_result: "bg-purple-500/20 text-purple-400",
  equipment_change: "bg-cyan-500/20 text-cyan-400",
  location_change: "bg-emerald-500/20 text-emerald-400",
};

// ── Event description renderer ──────────────────────────────────────────

function eventDescription(
  type: ActivityEventType,
  data: Record<string, unknown>,
): string {
  switch (type) {
    case "qso_milestone":
      return `Reached ${data.count ?? "?"} QSOs!`;
    case "award_earned":
      return `Earned ${data.award ?? "award"} (${data.tier ?? "?"})`;
    case "achievement_unlocked":
      return `Unlocked ${data.name ?? "achievement"} (${data.tier ?? "?"})`;
    case "new_dxcc":
      return `Worked new DXCC entity: ${data.entity ?? "Unknown"}`;
    case "contest_result":
      return `Placed #${data.place ?? "?"} in ${data.contest ?? "contest"}`;
    case "equipment_change":
      return `Added new radio: ${data.model ?? data.name ?? "equipment"}`;
    case "location_change":
      return `Operating from ${data.name ?? data.grid ?? "new location"}${data.grid ? ` (${data.grid})` : ""}`;
    default:
      return "Activity event";
  }
}

// ── Component ───────────────────────────────────────────────────────────

export function ActivityFeed() {
  const feed = useSocialStore((s) => s.feed);
  const isLoading = useSocialStore((s) => s.isLoadingFeed);
  const feedCursor = useSocialStore((s) => s.feedCursor);
  const fetchFeed = useSocialStore((s) => s.fetchFeed);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Initial fetch
  useEffect(() => {
    fetchFeed(false);
  }, [fetchFeed]);

  // IntersectionObserver for infinite scroll
  const loadMore = useCallback(() => {
    if (!isLoading && feedCursor) {
      fetchFeed(true);
    }
  }, [isLoading, feedCursor, fetchFeed]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        Activity Feed
      </h3>

      {feed.length === 0 && !isLoading && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">No activity yet</p>
        </div>
      )}

      <div>
        {feed.map((event) => (
          <div
            key={event.id}
            className="border-b border-white/5 py-3 last:border-0 flex items-start gap-3"
          >
            {/* Icon badge */}
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                EVENT_COLORS[event.type] ?? "bg-white/10 text-gray-400"
              }`}
            >
              {EVENT_ICONS[event.type] ?? "?"}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-300">
                {eventDescription(event.type, event.data)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {relativeTime(event.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <p className="text-sm text-gray-500 text-center animate-pulse motion-reduce:animate-none py-2">
          Loading...
        </p>
      )}

      {/* Sentinel for infinite scroll */}
      {feedCursor && <div ref={sentinelRef} className="h-1" />}

      {/* End-of-feed indicator */}
      {!feedCursor && feed.length > 0 && (
        <p className="text-xs text-gray-600 text-center py-2">End of feed</p>
      )}
    </div>
  );
}

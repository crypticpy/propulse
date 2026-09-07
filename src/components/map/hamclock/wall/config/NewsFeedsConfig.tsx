import { useRef, useState } from "react";
import { useRssFeeds } from "@/hooks/useRssFeed";
import { FEED_REFRESH_MINUTES, MAX_FEEDS, useFeedStore, type CrawlFeedMaxAgeHours, type FeedRefreshMinutes } from "@/stores/feedStore";
import { HamClockButton, HamClockSegmented, HamClockTabs, HamClockToggleRow } from "../controls";
import { WidgetConfigDialog } from "./WidgetConfigDialog";

/** Store adapter: feed settings remain authoritative in feedStore. */
export function NewsFeedsConfig({ onAdded }: { onAdded?: (id: string) => void } = {}) {
  const { feeds, refreshMinutes, setRefreshMinutes, updateFeedCrawl, addFeed, removeFeed } = useFeedStore();
  const results = useRssFeeds(feeds.map(feed => ({ ...feed, enabled: feed.crawlEnabled })));
  const [active, setActive] = useState("preferences");
  const [url, setUrl] = useState("");
  const [verified, setVerified] = useState<{ url: string; title: string; itemCount: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const revision = useRef(0);
  async function verify() {
    const current = ++revision.current;
    const candidate = url.trim();
    setPending(true); setVerified(null); setMessage("");
    try {
      const response = await fetch(`/api/feeds/rss?verify=1&url=${encodeURIComponent(candidate)}`);
      const data = await response.json();
      if (current !== revision.current) return;
      if (!response.ok || data.status !== "ok" || typeof data.title !== "string" || !data.title.trim() || !Number.isInteger(data.itemCount) || data.itemCount < 0) {
        throw new Error("Could not verify this feed. Check the URL and try again.");
      }
      setVerified({ url: candidate, title: data.title, itemCount: data.itemCount });
      setMessage(`${data.title} · ${data.itemCount} items · VERIFIED`);
    } catch {
      if (current === revision.current) setMessage("Could not verify this feed. Check the URL and try again.");
    } finally {
      if (current === revision.current) setPending(false);
    }
  }
  const pages = Array.from({ length: Math.ceil(feeds.length / 2) }, (_, page) => ({
    id: `news-${page}`, label: `NEWS ${page + 1}`,
    content: <div>{feeds.slice(page * 2, page * 2 + 2).map(feed => {
      const result = results.find(row => row.source.id === feed.id);
      const fetched = result?.fetchedAt ? new Date(result.fetchedAt).toISOString().slice(11, 16) : null;
      return <div key={feed.id}>
        <HamClockToggleRow label={feed.label} icon={<span>RSS</span>}
          detail={<><span className="hcc-news-source" title={feed.url}>{feed.url}</span><span>{`${fetched ? `UPDATED ${fetched} UTC` : "— · NOT YET FETCHED"} · ${result?.isFetching ? "FETCHING" : result?.error ? "UNAVAILABLE" : !fetched ? "UNKNOWN" : result?.status?.toUpperCase() ?? "UNKNOWN"}`}</span></>}
          checked={feed.crawlEnabled} onChange={enabled => updateFeedCrawl(feed.id, { crawlEnabled: enabled })}
          actions={<><HamClockButton disabled={result?.isFetching} onClick={() => void result?.refresh()}>REFRESH</HamClockButton><HamClockButton disabled={feeds.length <= 1} onClick={() => { removeFeed(feed.id); setActive(`news-${Math.max(0, Math.min(page, Math.ceil((feeds.length - 1) / 2) - 1))}`); }}>REMOVE</HamClockButton></>} />
        <HamClockSegmented label={`${feed.label} max age`} value={String(feed.crawlMaxAgeHours)}
          options={[1, 6, 24, 72].map(hours => ({ value: String(hours), label: `${hours} H` }))}
          onChange={value => updateFeedCrawl(feed.id, { crawlMaxAgeHours: Number(value) as CrawlFeedMaxAgeHours })} />
      </div>;
    })}</div>,
  }));
  return <HamClockTabs label="News configuration" active={active.startsWith("news-") && Number(active.slice(5)) >= pages.length ? "preferences" : active} onChange={setActive} tabs={[
    { id: "preferences", label: "PREFERENCES", content: <HamClockSegmented label="Fetch interval" value={String(refreshMinutes ?? 10)}
      options={FEED_REFRESH_MINUTES.map(minutes => ({ value: String(minutes), label: `${minutes} MIN` }))}
      onChange={value => setRefreshMinutes(Number(value) as FeedRefreshMinutes)} /> },
    ...pages,
    { id: "add", label: "ADD FEED", content: <div>
      <label className="hcc-row-label" htmlFor="hc-news-url">Feed URL</label>
      <input id="hc-news-url" type="url" value={url} className="hcc-input" onChange={event => {
        revision.current++; setUrl(event.target.value); setVerified(null); setPending(false); setMessage("");
      }} />
      <div><HamClockButton disabled={pending || !url.trim() || feeds.length >= MAX_FEEDS} onClick={() => void verify()}>{pending ? "VERIFYING" : "VERIFY"}</HamClockButton>
        <HamClockButton disabled={!verified || verified.url !== url.trim() || feeds.length >= MAX_FEEDS} onClick={() => {
          if (!verified || verified.url !== url.trim()) return;
          if (feeds.some(feed => feed.url === verified.url)) { setMessage("This feed is already configured."); return; }
          const added = addFeed(verified.url, verified.title);
          if (added) { onAdded?.(added.id); setUrl(""); setVerified(null); setMessage("Feed added."); }
        }}>ADD</HamClockButton></div>
      <p role="status">{message || `${feeds.length}/${MAX_FEEDS} feeds · Verify a feed before adding it.`}</p>
    </div> },
  ]} />;
}

export function NewsFeedsConfigDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (id: string) => void }) {
  return <WidgetConfigDialog open={open} onClose={onClose} title="NEWS FEEDS"
    purpose="Choose news sources, headline age and refresh timing.">
    {open && <NewsFeedsConfig onAdded={onAdded} />}
  </WidgetConfigDialog>;
}

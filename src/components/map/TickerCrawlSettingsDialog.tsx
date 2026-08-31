import { useState } from "react";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import {
  MAX_FEEDS,
  useFeedStore,
  type CrawlFeedMaxAgeHours,
  type TickerSolarThreshold,
  type TickerWeatherThreshold,
} from "@/stores/feedStore";

interface TickerCrawlSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const selectClassName =
  "rounded-lg border border-white/10 bg-void-black px-2.5 py-2 text-xs text-gray-200 focus:border-plasma-orange/50 focus:outline-none focus:ring-1 focus:ring-plasma-orange/30";

export function TickerCrawlSettingsDialog({
  open,
  onClose,
}: TickerCrawlSettingsDialogProps) {
  const feeds = useFeedStore((state) => state.feeds);
  const crawlPreferences = useFeedStore((state) => state.crawlPreferences);
  const addFeed = useFeedStore((state) => state.addFeed);
  const removeFeed = useFeedStore((state) => state.removeFeed);
  const updateFeedCrawl = useFeedStore((state) => state.updateFeedCrawl);
  const updateCrawlPreferences = useFeedStore(
    (state) => state.updateCrawlPreferences,
  );
  const [newUrl, setNewUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = newUrl.trim();
    if (!isValidHttpUrl(trimmed)) {
      setUrlError("Enter a valid http(s) feed URL");
      return;
    }
    if (!addFeed(trimmed)) {
      setUrlError(`Limit of ${MAX_FEEDS} feeds reached`);
      return;
    }
    setNewUrl("");
    setUrlError(null);
  };

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      title="Alert & News Crawl"
      description="Choose crawl sources, thresholds, and repeat suppression for the HamClock ticker."
      size="lg"
    >
      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3 className="font-orbitron text-xs font-semibold uppercase tracking-wider text-white">
                RSS sources
              </h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Each source has its own headline freshness threshold. Shared
                stories are shown only once.
              </p>
            </div>
            <span className="shrink-0 font-mono text-[10px] text-gray-500">
              {feeds.length}/{MAX_FEEDS}
            </span>
          </div>

          <div className="space-y-2">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <label className="flex min-w-0 items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={feed.crawlEnabled}
                    onChange={(event) =>
                      updateFeedCrawl(feed.id, {
                        crawlEnabled: event.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-white/20 bg-void-black accent-plasma-orange"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-gray-200">
                      {feed.label}
                    </span>
                    <span className="block truncate font-mono text-[9px] text-gray-600">
                      {feed.url}
                    </span>
                  </span>
                </label>

                <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-gray-500">
                  Newer than
                  <select
                    value={feed.crawlMaxAgeHours}
                    disabled={!feed.crawlEnabled}
                    onChange={(event) =>
                      updateFeedCrawl(feed.id, {
                        crawlMaxAgeHours: Number(
                          event.target.value,
                        ) as CrawlFeedMaxAgeHours,
                      })
                    }
                    className={`${selectClassName} disabled:opacity-40`}
                    aria-label={`${feed.label} headline age`}
                  >
                    <option value={1}>1 hour</option>
                    <option value={6}>6 hours</option>
                    <option value={24}>24 hours</option>
                    <option value={72}>3 days</option>
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => removeFeed(feed.id)}
                  disabled={feeds.length <= 1}
                  className="justify-self-end rounded-lg px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"
                  aria-label={`Remove ${feed.label}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              type="url"
              value={newUrl}
              onChange={(event) => {
                setNewUrl(event.target.value);
                setUrlError(null);
              }}
              placeholder="https://example.com/feed.xml"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-void-black px-3 py-2 text-xs text-gray-200 placeholder:text-gray-600 focus:border-plasma-orange/50 focus:outline-none"
              aria-label="Add RSS feed URL"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={feeds.length >= MAX_FEEDS}
              className="rounded-lg bg-plasma-orange px-3 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              Add feed
            </button>
          </div>
          {urlError && <p className="mt-1 text-xs text-red-400">{urlError}</p>}
        </section>

        <section className="border-t border-white/10 pt-5">
          <h3 className="font-orbitron text-xs font-semibold uppercase tracking-wider text-white">
            Alert thresholds
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs text-gray-400">
              <span>Space weather break-in</span>
              <select
                value={crawlPreferences.solarThreshold}
                onChange={(event) =>
                  updateCrawlPreferences({
                    solarThreshold: event.target
                      .value as TickerSolarThreshold,
                  })
                }
                className={`${selectClassName} w-full`}
              >
                <option value="INFO">Info and above</option>
                <option value="WARNING">Warning and above</option>
                <option value="CRITICAL">Critical only</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-gray-400">
              <span>NWS break-in</span>
              <select
                value={crawlPreferences.weatherThreshold}
                onChange={(event) =>
                  updateCrawlPreferences({
                    weatherThreshold: event.target
                      .value as TickerWeatherThreshold,
                  })
                }
                className={`${selectClassName} w-full`}
              >
                <option value="Moderate">Moderate and above</option>
                <option value="Severe">Severe and above</option>
                <option value="Extreme">Extreme only</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs text-gray-400">
              <span>Suppress repeats for</span>
              <select
                value={crawlPreferences.dedupMinutes}
                onChange={(event) =>
                  updateCrawlPreferences({
                    dedupMinutes: Number(event.target.value) as
                      | 15
                      | 60
                      | 360
                      | 1440,
                  })
                }
                className={`${selectClassName} w-full`}
              >
                <option value={15}>15 minutes</option>
                <option value={60}>1 hour</option>
                <option value={360}>6 hours</option>
                <option value={1440}>24 hours</option>
              </select>
            </label>
          </div>
        </section>

        <section className="border-t border-white/10 pt-5">
          <ToggleSwitch
            checked={crawlPreferences.breakInToneEnabled}
            onChange={(breakInToneEnabled) =>
              updateCrawlPreferences({ breakInToneEnabled })
            }
            label="Play alert break-in tone"
            description="New threshold-matching NWS and space-weather notices interrupt the crawl once per repeat-suppression window. Browser audio rules may require prior interaction."
          />
          <label className="mt-4 block text-xs text-gray-400">
            Tone volume · {crawlPreferences.breakInVolume}%
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={crawlPreferences.breakInVolume}
              disabled={!crawlPreferences.breakInToneEnabled}
              onChange={(event) =>
                updateCrawlPreferences({
                  breakInVolume: Number(event.target.value),
                })
              }
              className="mt-2 w-full accent-plasma-orange disabled:opacity-40"
            />
          </label>
        </section>
      </div>
    </AccessibleDialog>
  );
}

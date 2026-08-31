/**
 * DXNewsTicker Component
 *
 * A CSS-animated scrolling information bar showing live propagation data.
 * Displays solar indices, band conditions, and DX spot activity in a
 * continuously scrolling ticker with pause-on-hover behavior. Weather,
 * lightning, and space-weather notices open the app's detailed alert views.
 *
 * Data sources:
 * - Solar flux (SFI) and K-index from useSolarData hooks
 * - Active solar alerts from useSolarAlerts
 * - Band conditions from store-derived calculations
 * - DX spot activity from dxStore
 * - Station-centered weather alerts and lightning from their live data hooks
 * - Operator-selected RSS/Atom feeds through the normalized edge proxy
 *
 * Coverage approach:
 * - Solar indices, space-weather alerts, and DX activity are always global
 * - The operator chooses nearby, regional, or wide weather/lightning coverage
 * - The historical 500 km lightning / 800 km weather scope remains the default
 * - Per-source thresholds and persisted alert IDs prevent repeated break-ins
 *
 * Animation approach:
 * - Content is rendered twice (duplicated) in a scrolling container
 * - CSS @keyframes scrolls from translateX(0) to translateX(-50%)
 * - Duration is dynamically calculated based on content width (~90px/sec)
 * - Edge fade via CSS mask-image gradient
 */

import {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useSolarAlerts } from "@/hooks/useSolarAlerts";
import { useDXStore } from "@/stores/dxStore";
import { getGeomagneticCondition } from "@/lib/utils/solarConversions";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import { useLightning } from "@/hooks/useLightning";
import { useUserStore } from "@/stores/userStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useFeedStore } from "@/stores/feedStore";
import { getDistance } from "@/lib/utils/path";
import type { LightningStrike } from "@/lib/api/lightning";
import type { WeatherAlert } from "@/lib/api/weather";
import type { SolarAlert } from "@/types/alerts";
import {
  getTickerCoveragePreset,
  type TickerCoveragePreset,
} from "@/lib/map/tickerCoverage";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";
import { useRssFeeds, relativeTime } from "@/hooks/useRssFeed";
import {
  buildRssCrawlHeadlines,
  meetsSolarTickerThreshold,
  meetsWeatherTickerThreshold,
  pruneBreakInHistory,
  tickerAlertRank,
  type RssCrawlHeadline,
} from "@/lib/map/tickerCrawl";
import { playAlertTone } from "@/lib/audio/alertSynthesizer";

const AlertDetailModal = lazy(() =>
  import("@/components/alerts/AlertDetailModal").then((module) => ({
    default: module.AlertDetailModal,
  })),
);

const WeatherAlertModal = lazy(() =>
  import("@/components/map/WeatherAlertModal").then((module) => ({
    default: module.WeatherAlertModal,
  })),
);

const TickerCrawlSettingsDialog = lazy(() =>
  import("@/components/map/TickerCrawlSettingsDialog").then((module) => ({
    default: module.TickerCrawlSettingsDialog,
  })),
);

// =============================================================================
// TYPES
// =============================================================================

interface DXNewsTickerProps {
  className?: string;
  visible?: boolean;
}

interface TickerItem {
  id: string;
  text: string;
  highlight?: boolean;
  alertLevel?: "info" | "warning" | "critical";
  detail?: TickerDetail;
}

type TickerDetail =
  | { kind: "solar"; alert: SolarAlert }
  | { kind: "weather"; alert: WeatherAlert }
  | { kind: "rss"; headline: RssCrawlHeadline }
  | {
      kind: "lightning";
      proximity: LightningProximity;
      coverage: TickerCoveragePreset;
    };

// =============================================================================
// CONSTANTS
// =============================================================================

/** Scroll speed in pixels per second */
const SCROLL_SPEED_PX_PER_SEC = 90;

/** How often to regenerate ticker content (ms) */
const CONTENT_REFRESH_INTERVAL_MS = 30_000;

/** Diamond separator character */
const SEPARATOR = "\u25C6";

/** Keyframes name for the scroll animation */
const KEYFRAMES_NAME = "dx-ticker-scroll";

/** Persisted alert IDs prevent reloads and polling refreshes from replaying tones. */
const BREAK_IN_HISTORY_KEY = "propulse-ticker-breakins-v1";

/** New NWS/SWPC notices temporarily interrupt the ordinary crawl. */
const BREAK_IN_DURATION_MS = 12_000;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get a human-readable label for the solar flux index value
 */
function getSfiLabel(sfi: number): string {
  if (sfi >= 150) return "Excellent";
  if (sfi >= 100) return "Good";
  if (sfi >= 70) return "Fair";
  return "Poor";
}

/**
 * Get the most active band and mode from spots
 */
function getMostActiveBandAndMode(
  spots: { band?: string; mode?: string; time: Date }[],
): { band: string; mode: string } | null {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
  const recentSpots = spots.filter((s) => new Date(s.time) >= fifteenMinAgo);

  if (recentSpots.length === 0) return null;

  // Count by band+mode combination
  const comboCounts: Record<string, number> = {};
  for (const spot of recentSpots) {
    const key = `${spot.band || "?"}_${spot.mode || "?"}`;
    comboCounts[key] = (comboCounts[key] || 0) + 1;
  }

  // Find the most frequent combination
  let maxKey = "";
  let maxCount = 0;
  for (const [key, count] of Object.entries(comboCounts)) {
    if (count > maxCount) {
      maxCount = count;
      maxKey = key;
    }
  }

  if (!maxKey) return null;

  const [band, mode] = maxKey.split("_");
  return { band: band || "?", mode: mode || "?" };
}

/**
 * Count spots within the last N minutes
 */
function countRecentSpots(spots: { time: Date }[], minutesAgo: number): number {
  const cutoff = new Date(Date.now() - minutesAgo * 60 * 1000);
  return spots.filter((s) => new Date(s.time) >= cutoff).length;
}

function readBreakInHistory(): Record<string, number> {
  try {
    const raw = localStorage.getItem(BREAK_IN_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

function writeBreakInHistory(history: Record<string, number>) {
  try {
    localStorage.setItem(BREAK_IN_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Private browsing and exhausted storage should not disable live alerts.
  }
}

function solarAlertLevel(alert: SolarAlert): TickerItem["alertLevel"] {
  return alert.priority === "CRITICAL"
    ? "critical"
    : alert.priority === "WARNING"
      ? "warning"
      : "info";
}

function weatherAlertLevel(alert: WeatherAlert): TickerItem["alertLevel"] {
  return alert.severity === "Extreme"
    ? "critical"
    : alert.severity === "Severe"
      ? "warning"
      : "info";
}

// =============================================================================
// LIGHTNING / WEATHER HELPERS
// =============================================================================

interface LightningProximity {
  nearestKm: number;
  countWithin: number;
  bearing: string; // "NE", "SW", etc.
  maxCurrentKA: number;
}

function computeLightningProximity(
  strikes: LightningStrike[],
  stationLat: number,
  stationLon: number,
  proximityKm: number,
): LightningProximity | null {
  // Filter strikes from last 10 minutes
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  const recent = strikes.filter((s) => s.time > tenMinAgo);

  let nearest = Infinity;
  let nearestBearing = "";
  let count = 0;
  let maxKA = 0;

  for (const strike of recent) {
    const dist = getDistance(stationLat, stationLon, strike.lat, strike.lon);
    if (dist <= proximityKm) {
      count++;
      // Polarity identifies the discharge direction; operators care about the
      // largest absolute peak when estimating likely static-crash intensity.
      const magnitudeKA = Math.abs(strike.currentKA);
      if (magnitudeKA > maxKA) maxKA = magnitudeKA;
      if (dist < nearest) {
        nearest = dist;
        // Compute rough bearing
        const dLon = strike.lon - stationLon;
        const dLat = strike.lat - stationLat;
        nearestBearing = getCardinalDirection(dLat, dLon);
      }
    }
  }

  if (count === 0) return null;
  return {
    nearestKm: Math.round(nearest),
    countWithin: count,
    bearing: nearestBearing,
    maxCurrentKA: maxKA,
  };
}

function getCardinalDirection(dLat: number, dLon: number): string {
  const angle = (Math.atan2(dLon, dLat) * 180) / Math.PI;
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((angle + 360) % 360) / 45) % 8;
  return dirs[idx];
}

// =============================================================================
// COMPONENT
// =============================================================================

export function DXNewsTicker({
  className = "",
  visible = true,
}: DXNewsTickerProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  // Hover and keyboard focus are independent pause sources. Keeping them
  // separate prevents either exit handler from restarting the marquee while
  // the other interaction is still active.
  const [isHovered, setIsHovered] = useState(false);
  const [hasTickerFocus, setHasTickerFocus] = useState(false);
  const [animationDuration, setAnimationDuration] = useState(20);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedDetail, setSelectedDetail] = useState<TickerDetail | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [breakInItem, setBreakInItem] = useState<TickerItem | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Data hooks
  // ---------------------------------------------------------------------------
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();
  const { activeAlerts } = useSolarAlerts({ enabled: true });
  const spots = useDXStore((s) => s.spots);
  const { alerts: weatherAlerts } = useWeatherAlerts(true);
  const { strikes: lightningStrikes } = useLightning(true);
  const station = useUserStore((s) => s.station);
  const tickerCoverageArea = useSettingsStore(
    (s) => s.tickerCoverageArea ?? "regional",
  );
  const tickerCoverage = useMemo(
    () => getTickerCoveragePreset(tickerCoverageArea),
    [tickerCoverageArea],
  );
  const feeds = useFeedStore((state) => state.feeds);
  const crawlPreferences = useFeedStore((state) => state.crawlPreferences);
  const enabledCrawlFeeds = useMemo(
    () => feeds.filter((feed) => feed.crawlEnabled),
    [feeds],
  );
  const rssSources = useMemo(
    () => enabledCrawlFeeds.map(({ id, url }) => ({ id, url })),
    [enabledCrawlFeeds],
  );
  const rssResults = useRssFeeds(rssSources);

  // Compute spot count by band locally to avoid infinite loop from
  // selector returning a new object reference on every call
  const spotCountByBand = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const spot of spots) {
      if (spot.band) {
        counts[spot.band] = (counts[spot.band] || 0) + 1;
      }
    }
    return counts;
  }, [spots]);

  // ---------------------------------------------------------------------------
  // Derived solar values
  // ---------------------------------------------------------------------------
  const currentKp = useMemo(() => {
    if (!kIndexData || kIndexData.length === 0) return null;
    return kIndexData[kIndexData.length - 1].kp_index;
  }, [kIndexData]);

  const currentSfi = useMemo(() => {
    if (!solarFluxData || solarFluxData.length === 0) return null;
    return solarFluxData[solarFluxData.length - 1].flux;
  }, [solarFluxData]);

  const breakInSolarAlerts = useMemo(
    () =>
      activeAlerts.filter((alert) =>
        meetsSolarTickerThreshold(
          alert.priority,
          crawlPreferences.solarThreshold,
        ),
      ),
    [activeAlerts, crawlPreferences.solarThreshold],
  );

  const nearbyWeatherAlerts = useMemo(() => {
    if (!station) return [];
    return weatherAlerts.filter(
      (alert) =>
        getDistance(station.lat, station.lon, alert.lat, alert.lon) <=
        tickerCoverage.weatherKm,
    );
  }, [station, tickerCoverage.weatherKm, weatherAlerts]);

  const breakInWeatherAlerts = useMemo(
    () =>
      nearbyWeatherAlerts.filter((alert) =>
        meetsWeatherTickerThreshold(
          alert.severity,
          crawlPreferences.weatherThreshold,
        ),
      ),
    [crawlPreferences.weatherThreshold, nearbyWeatherAlerts],
  );

  const rssHeadlines = buildRssCrawlHeadlines(
    feeds,
    rssResults,
    Date.now(),
  );

  // ---------------------------------------------------------------------------
  // Periodic content refresh
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTick((t) => t + 1);
    }, CONTENT_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const breakInCandidates = useMemo((): TickerItem[] => {
    const solarItems = breakInSolarAlerts.map((alert) => ({
      id: `alert-${alert.id}`,
      text: alert.title,
      highlight: true,
      alertLevel: solarAlertLevel(alert),
      detail: { kind: "solar" as const, alert },
    }));
    const weatherItems = breakInWeatherAlerts.map((alert) => {
      const distanceKm = station
        ? Math.round(
            getDistance(station.lat, station.lon, alert.lat, alert.lon),
          )
        : 0;
      return {
        id: `wx-${alert.id}`,
        text: `\u26A0 ${alert.event} \u2014 ${distanceKm}km away`,
        highlight: true,
        alertLevel: weatherAlertLevel(alert),
        detail: { kind: "weather" as const, alert },
      };
    });
    return [...solarItems, ...weatherItems];
  }, [breakInSolarAlerts, breakInWeatherAlerts, station]);

  const breakInSignature = breakInCandidates
    .map((item) => `${item.id}:${item.alertLevel}`)
    .sort()
    .join("|");

  useEffect(() => {
    if (!breakInSignature) return;
    const nowMs = Date.now();
    const history = pruneBreakInHistory(
      readBreakInHistory(),
      nowMs,
      crawlPreferences.dedupMinutes,
    );
    const unseen = breakInCandidates.filter((item) => history[item.id] == null);
    const next = [...unseen]
      .sort(
        (left, right) =>
          tickerAlertRank(right.alertLevel ?? "info") -
          tickerAlertRank(left.alertLevel ?? "info"),
      )[0];

    if (!next) {
      writeBreakInHistory(history);
      return;
    }

    // Treat one simultaneous poll as one interruption: present the most
    // important notice while marking its cohort seen so stale alerts do not
    // cascade into delayed tones on later query refreshes.
    for (const item of unseen) history[item.id] = nowMs;
    writeBreakInHistory(history);
    setBreakInItem(next);

    // The global solar-alert service owns space-weather audio and applies its
    // mute, quiet-hours, and notification controls. The ticker only sounds NWS
    // break-ins here so one solar event never produces overlapping tones.
    if (
      crawlPreferences.breakInToneEnabled &&
      next.detail?.kind === "weather"
    ) {
      const priority =
        next.alertLevel === "critical"
          ? "CRITICAL"
          : next.alertLevel === "warning"
            ? "WARNING"
            : "INFO";
      playAlertTone(priority, undefined, crawlPreferences.breakInVolume);
    }
  }, [
    breakInCandidates,
    breakInSignature,
    crawlPreferences.breakInToneEnabled,
    crawlPreferences.breakInVolume,
    crawlPreferences.dedupMinutes,
    // Time passing does not change an active alert's identity. The shared
    // 30-second crawl tick wakes this effect so an expired suppression record
    // can be pruned and the still-active notice can repeat at the promised
    // once-per-window cadence.
    refreshTick,
  ]);

  useEffect(() => {
    if (!breakInItem) return;
    const timeout = window.setTimeout(
      () => setBreakInItem(null),
      BREAK_IN_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [breakInItem]);

  // ---------------------------------------------------------------------------
  // Build ticker items
  // ---------------------------------------------------------------------------
  const tickerItems = useMemo((): TickerItem[] => {
    // Force dependency on refreshTick so items regenerate periodically
    void refreshTick;

    const items: TickerItem[] = [];

    // --- Active alerts (highest priority) ---
    if (activeAlerts.length > 0) {
      for (const alert of activeAlerts.slice(0, 2)) {
        items.push({
          id: `alert-${alert.id}`,
          text: alert.title,
          highlight: true,
          alertLevel: solarAlertLevel(alert),
          detail: { kind: "solar", alert },
        });
      }
    }

    // --- Weather / Lightning proximity alerts ---
    if (station) {
      // Lightning proximity
      const lightning = computeLightningProximity(
        lightningStrikes,
        station.lat,
        station.lon,
        tickerCoverage.lightningKm,
      );
      if (lightning) {
        const severity =
          lightning.nearestKm < 100
            ? "critical"
            : lightning.nearestKm < 300
              ? "warning"
              : "info";
        items.push({
          id: "lightning",
          text: `\u26A1 Lightning ${lightning.nearestKm}km ${lightning.bearing} | ${lightning.countWithin} strikes within ${tickerCoverage.lightningKm}km | Peak: ${lightning.maxCurrentKA}kA`,
          highlight: true,
          alertLevel: severity,
          detail: {
            kind: "lightning",
            proximity: lightning,
            coverage: tickerCoverage,
          },
        });

        // Add QRN impact note for close lightning
        if (lightning.nearestKm < 300) {
          items.push({
            id: "qrn",
            text: "\u26A1 QRN likely on 160m-40m | Static crashes expected",
            highlight: true,
            alertLevel: "warning",
            detail: {
              kind: "lightning",
              proximity: lightning,
              coverage: tickerCoverage,
            },
          });
        }
      }

      // Nearby NWS alerts remain in the ordinary crawl even when interruption
      // thresholds are disabled or set above this notice's severity.
      for (const alert of nearbyWeatherAlerts.slice(0, 2)) {
        const dist = Math.round(
          getDistance(station.lat, station.lon, alert.lat, alert.lon),
        );
        items.push({
          id: `wx-${alert.id}`,
          text: `\u26A0 ${alert.event} \u2014 ${dist}km away`,
          highlight: true,
          alertLevel: weatherAlertLevel(alert),
          detail: { kind: "weather", alert },
        });
      }
    }

    // --- Configured RSS/Atom crawl ---
    for (const headline of rssHeadlines) {
      const age = relativeTime(headline.item.publishedAt, new Date());
      items.push({
        id: `rss-${headline.feed.id}-${headline.key}`,
        text: `${headline.feed.label}: ${headline.item.title}${age ? ` · ${age}` : ""}`,
        detail: { kind: "rss", headline },
      });
    }

    // --- Solar Flux Index ---
    if (currentSfi !== null) {
      items.push({
        id: "sfi",
        text: `SFI: ${currentSfi} (${getSfiLabel(currentSfi)})`,
        highlight: false,
      });
    }

    // --- K-Index ---
    if (currentKp !== null) {
      items.push({
        id: "kp",
        text: `K-Index: ${currentKp} (${getGeomagneticCondition(currentKp)})`,
        highlight: currentKp >= 4,
        alertLevel: currentKp >= 5 ? "warning" : undefined,
      });
    }

    // --- Band activity summary (top 3 most active bands) ---
    const sortedBands = Object.entries(spotCountByBand)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4);

    if (sortedBands.length > 0) {
      const bandSummary = sortedBands
        .map(([band, count]) => `${band}: ${count}`)
        .join(" | ");
      items.push({
        id: "bands",
        text: `Active bands (live): ${bandSummary}`,
        highlight: false,
      });
    }

    // --- Spot activity ---
    const recentCount = countRecentSpots(spots, 15);
    if (recentCount > 0) {
      const mostActive = getMostActiveBandAndMode(spots);
      let spotText = `${recentCount} spots in last 15min`;
      if (mostActive) {
        spotText += ` | Most active: ${mostActive.band} ${mostActive.mode}`;
      }
      items.push({
        id: "spots",
        text: spotText,
        highlight: false,
      });
    } else if (spots.length > 0) {
      items.push({
        id: "spots",
        text: `${spots.length} spots loaded`,
        highlight: false,
      });
    }

    // --- UTC time ---
    const utcNow = new Date();
    const utcStr = utcNow.toISOString().slice(11, 16).replace(":", "");
    items.push({
      id: "utc",
      text: `${utcStr}z UTC`,
      highlight: false,
    });

    // If we have nothing meaningful, show a loading message
    if (items.length <= 1) {
      items.unshift({
        id: "loading",
        text: "Loading propagation data...",
        highlight: false,
      });
    }

    return items;
  }, [
    currentKp,
    currentSfi,
    activeAlerts,
    nearbyWeatherAlerts,
    rssHeadlines,
    spots,
    spotCountByBand,
    refreshTick,
    lightningStrikes,
    station,
    tickerCoverage,
  ]);

  // ---------------------------------------------------------------------------
  // Measure content width and calculate animation duration
  // ---------------------------------------------------------------------------
  const recalcDuration = useCallback(() => {
    if (!contentRef.current) return;
    const width = contentRef.current.scrollWidth / 2; // Content is duplicated
    if (width > 0) {
      const duration = width / SCROLL_SPEED_PX_PER_SEC;
      setAnimationDuration(Math.max(10, duration));
    }
  }, []);

  useEffect(() => {
    recalcDuration();
  }, [tickerItems, recalcDuration]);

  // Also recalculate on resize
  useEffect(() => {
    const observer = new ResizeObserver(recalcDuration);
    if (contentRef.current) {
      observer.observe(contentRef.current);
    }
    return () => observer.disconnect();
  }, [recalcDuration]);

  // ---------------------------------------------------------------------------
  // Render ticker text content (single copy)
  // ---------------------------------------------------------------------------
  const renderTickerContent = useCallback((duplicate = false) => {
    return tickerItems.map((item, index) => (
      <span
        key={item.id}
        className="inline-flex items-center whitespace-nowrap"
      >
        {index > 0 && (
          <span className="mx-3 text-gray-600 select-none">{SEPARATOR}</span>
        )}
        {item.detail && duplicate ? (
          // The second marquee copy exists only to make the animation loop.
          // Render detail notices as text so an aria-hidden subtree never
          // contains a button that can be focused or activated.
          <span className={getTickerItemClass(item)}>
            {item.text} <span aria-hidden="true">↗</span>
          </span>
        ) : item.detail ? (
          <button
            type="button"
            onClick={() => setSelectedDetail(item.detail ?? null)}
            className={`rounded-sm underline decoration-current/40 underline-offset-2 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/70 ${getTickerItemClass(item)}`}
            aria-label={`${item.text}. Open details`}
          >
            {item.text} <span aria-hidden="true">↗</span>
          </button>
        ) : item.highlight ? (
          <span className={getTickerItemClass(item)}>{item.text}</span>
        ) : (
          <TickerText text={item.text} />
        )}
      </span>
    ));
  }, [tickerItems]);

  // ---------------------------------------------------------------------------
  // Visibility
  // ---------------------------------------------------------------------------
  if (!visible) return null;

  // ---------------------------------------------------------------------------
  // Inline keyframes style
  // ---------------------------------------------------------------------------
  const keyframesStyle = `
    @keyframes ${KEYFRAMES_NAME} {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
  `;

  return (
    <>
      <div
        className={`relative flex items-center h-[30px] overflow-hidden select-none ${className}`}
        style={{
          background: "rgba(10, 10, 26, 0.85)",
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          maskImage:
            "linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%)",
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setHasTickerFocus(true)}
        onBlurCapture={(event) => {
          // Focus moving between notices is still focus within the ticker.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setHasTickerFocus(false);
          }
        }}
        role="marquee"
        aria-label="DX news and alert crawl - live propagation information"
      >
      {/* Inject keyframes */}
      <style>{keyframesStyle}</style>

      {/* LIVE badge - pinned left */}
      <div
        className="relative z-10 flex items-center gap-1.5 px-2.5 h-full flex-shrink-0"
        style={{
          background:
            "linear-gradient(to right, rgba(10, 10, 26, 0.95) 80%, transparent)",
        }}
      >
        <span
          className="font-mono font-bold uppercase tracking-wider"
          style={{
            fontSize: "10px",
            letterSpacing: "0.5px",
            background: "rgba(255, 107, 53, 0.9)",
            color: "#000",
            padding: "1px 5px",
            borderRadius: "2px",
            lineHeight: "16px",
          }}
        >
          LIVE
        </span>
        {/* Pulsing red dot */}
        <span
          className="inline-block rounded-full"
          style={{
            width: "6px",
            height: "6px",
            backgroundColor: "#ef4444",
            animation: "dx-ticker-pulse 2s ease-in-out infinite",
          }}
        />
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="ml-0.5 rounded p-0.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/70"
          aria-label="Configure alert and news crawl"
          title="Configure alert & news crawl"
        >
          <span aria-hidden="true">⚙</span>
        </button>
        <style>{`
          @keyframes dx-ticker-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.75); }
          }
        `}</style>
      </div>

      {/* Scrolling content area */}
      <div className="relative flex-1 overflow-hidden h-full flex items-center">
        <div
          ref={contentRef}
          data-testid="dx-ticker-track"
          className="inline-flex items-center font-mono text-[11px] text-gray-300"
          style={{
            animationName: KEYFRAMES_NAME,
            animationDuration: `${animationDuration}s`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            animationPlayState:
              isHovered ||
              hasTickerFocus ||
              selectedDetail ||
              settingsOpen ||
              breakInItem
                ? "paused"
                : "running",
            willChange: "transform",
          }}
        >
          {/* First copy */}
          <span className="inline-flex items-center whitespace-nowrap">
            {renderTickerContent()}
          </span>
          {/* Spacer between copies */}
          <span className="mx-8 text-gray-600 select-none">{SEPARATOR}</span>
          {/* Second copy (duplicate for seamless loop) */}
          <span
            className="pointer-events-none inline-flex items-center whitespace-nowrap"
            aria-hidden="true"
            data-ticker-duplicate="true"
          >
            {renderTickerContent(true)}
          </span>
        </div>

        {breakInItem && (
          <div
            className="absolute inset-0 z-20 flex items-center gap-2 bg-[#160b10]/95 px-3 font-mono text-[11px]"
            role="status"
            aria-live="assertive"
            data-testid="ticker-break-in"
          >
            <span className="shrink-0 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
              Break-in
            </span>
            {breakInItem.detail ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedDetail(breakInItem.detail ?? null);
                  setBreakInItem(null);
                }}
                className={`min-w-0 truncate text-left underline decoration-current/40 underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/70 ${getTickerItemClass(breakInItem)}`}
                aria-label={`${breakInItem.text}. Open break-in details`}
              >
                {breakInItem.text} <span aria-hidden="true">↗</span>
              </button>
            ) : (
              <span className={`min-w-0 truncate ${getTickerItemClass(breakInItem)}`}>
                {breakInItem.text}
              </span>
            )}
            <button
              type="button"
              onClick={() => setBreakInItem(null)}
              className="ml-auto shrink-0 rounded p-1 text-gray-500 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/70"
              aria-label="Dismiss break-in"
            >
              ×
            </button>
          </div>
        )}
      </div>
      </div>

      <Suspense fallback={null}>
        {selectedDetail?.kind === "solar" && (
          <AlertDetailModal
            isOpen
            alert={selectedDetail.alert}
            onClose={() => setSelectedDetail(null)}
          />
        )}
        {selectedDetail?.kind === "weather" && (
          <WeatherAlertModal
            alert={selectedDetail.alert}
            onClose={() => setSelectedDetail(null)}
          />
        )}
        {settingsOpen && (
          <TickerCrawlSettingsDialog
            open
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </Suspense>

      <LightningTickerDetail
        detail={
          selectedDetail?.kind === "lightning" ? selectedDetail : null
        }
        onClose={() => setSelectedDetail(null)}
      />
      <RssTickerDetail
        detail={selectedDetail?.kind === "rss" ? selectedDetail : null}
        onClose={() => setSelectedDetail(null)}
      />
    </>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function getTickerItemClass(item: TickerItem): string {
  if (item.alertLevel === "critical") return "font-semibold text-red-400";
  if (item.alertLevel === "warning") return "font-semibold text-amber-400";
  return item.highlight ? "text-[#ff6b35]" : "text-gray-300";
}

function LightningTickerDetail({
  detail,
  onClose,
}: {
  detail: Extract<TickerDetail, { kind: "lightning" }> | null;
  onClose: () => void;
}) {
  const proximity = detail?.proximity;

  return (
    <AccessibleDialog
      open={Boolean(detail)}
      onClose={onClose}
      title="Lightning & QRN Detail"
      description="Live station-centered electrical activity from the ticker."
      size="md"
    >
      {detail && proximity && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TickerMetric label="Nearest" value={`${proximity.nearestKm} km`} />
            <TickerMetric label="Bearing" value={proximity.bearing} />
            <TickerMetric label="Strikes" value={`${proximity.countWithin}`} />
            <TickerMetric label="Peak" value={`${proximity.maxCurrentKA} kA`} />
          </div>
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
            <p className="font-orbitron text-xs font-semibold uppercase tracking-wider text-amber-300">
              Radio impact
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Nearby lightning can produce QRN and static crashes, with the
              strongest impact usually heard on 160m–40m. Use the bearing and
              distance as situational guidance, not as a safety warning system.
            </p>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Current ticker area: {detail.coverage.label} · lightning within{" "}
            {detail.coverage.lightningKm} km · weather within{" "}
            {detail.coverage.weatherKm} km. Change this under Settings →
            Appearance → News Ticker.
          </p>
        </div>
      )}
    </AccessibleDialog>
  );
}

function RssTickerDetail({
  detail,
  onClose,
}: {
  detail: Extract<TickerDetail, { kind: "rss" }> | null;
  onClose: () => void;
}) {
  const headline = detail?.headline;

  return (
    <AccessibleDialog
      open={Boolean(headline)}
      onClose={onClose}
      title={headline?.item.title ?? "News detail"}
      description={
        headline
          ? `Headline from the configured ${headline.feed.label} feed.`
          : undefined
      }
      size="md"
    >
      {headline && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-gray-500">
            <span>{headline.feed.label}</span>
            {headline.item.publishedAt && (
              <>
                <span aria-hidden="true">·</span>
                <time dateTime={headline.item.publishedAt}>
                  {relativeTime(headline.item.publishedAt, new Date())}
                </time>
              </>
            )}
          </div>
          {headline.item.summary && (
            <p className="whitespace-pre-line text-sm leading-6 text-gray-300">
              {headline.item.summary}
            </p>
          )}
          {headline.item.link && (
            <a
              href={headline.item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex rounded-lg bg-plasma-orange px-3 py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plasma-orange/70"
            >
              Open source
            </a>
          )}
        </div>
      )}
    </AccessibleDialog>
  );
}

function TickerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-orbitron text-base font-semibold text-white">
        {value}
      </p>
    </div>
  );
}

/**
 * Renders ticker text with orange highlights for values (numbers, parenthetical content)
 */
function TickerText({ text }: { text: string }) {
  // Split text to highlight values: numbers, and content in parentheses
  const parts = text.split(/(\d+[\d.]*|(?:\([^)]+\)))/g);

  return (
    <span>
      {parts.map((part, i) => {
        // Highlight numbers and parenthetical content
        if (/^\d/.test(part) || /^\(/.test(part)) {
          return (
            <span key={i} className="text-[#ff6b35]">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export default DXNewsTicker;

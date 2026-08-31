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
 *
 * Coverage approach:
 * - Solar indices, space-weather alerts, and DX activity are always global
 * - The operator chooses nearby, regional, or wide weather/lightning coverage
 * - The historical 500 km lightning / 800 km weather scope remains the default
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
import { getDistance } from "@/lib/utils/path";
import type { LightningStrike } from "@/lib/api/lightning";
import type { WeatherAlert } from "@/lib/api/weather";
import type { SolarAlert } from "@/types/alerts";
import {
  getTickerCoveragePreset,
  type TickerCoveragePreset,
} from "@/lib/map/tickerCoverage";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";

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
  const contentRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Data hooks
  // ---------------------------------------------------------------------------
  const { data: kIndexData } = useKIndex();
  const { data: solarFluxData } = useSolarFlux();
  const { activeAlerts, hasAlerts } = useSolarAlerts({ enabled: true });
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

  // ---------------------------------------------------------------------------
  // Periodic content refresh
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTick((t) => t + 1);
    }, CONTENT_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------------------------------------------
  // Build ticker items
  // ---------------------------------------------------------------------------
  const tickerItems = useMemo((): TickerItem[] => {
    // Force dependency on refreshTick so items regenerate periodically
    void refreshTick;

    const items: TickerItem[] = [];

    // --- Active alerts (highest priority) ---
    if (hasAlerts && activeAlerts.length > 0) {
      for (const alert of activeAlerts.slice(0, 2)) {
        items.push({
          id: `alert-${alert.id}`,
          text: alert.title,
          highlight: true,
          alertLevel:
            alert.priority === "CRITICAL"
              ? "critical"
              : alert.priority === "WARNING"
                ? "warning"
                : "info",
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

      // Nearby weather alerts (thunderstorm-related)
      const STORM_KEYWORDS = [
        "thunderstorm",
        "tornado",
        "lightning",
        "severe",
        "hurricane",
        "tropical",
      ];
      const nearbyAlerts = weatherAlerts.filter((alert) => {
        const dist = getDistance(
          station.lat,
          station.lon,
          alert.lat,
          alert.lon,
        );
        if (dist > tickerCoverage.weatherKm) return false;
        const eventLower = alert.event.toLowerCase();
        return STORM_KEYWORDS.some((kw) => eventLower.includes(kw));
      });

      for (const alert of nearbyAlerts.slice(0, 2)) {
        const dist = Math.round(
          getDistance(station.lat, station.lon, alert.lat, alert.lon),
        );
        const severity =
          alert.severity === "Extreme"
            ? "critical"
            : alert.severity === "Severe"
              ? "warning"
              : "info";
        items.push({
          id: `wx-${alert.id}`,
          text: `\u26A0 ${alert.event} \u2014 ${dist}km away`,
          highlight: true,
          alertLevel: severity,
          detail: { kind: "weather", alert },
        });
      }
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
    hasAlerts,
    spots,
    spotCountByBand,
    refreshTick,
    lightningStrikes,
    weatherAlerts,
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
        aria-label="DX News Ticker - live propagation information"
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
        <style>{`
          @keyframes dx-ticker-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.75); }
          }
        `}</style>
      </div>

      {/* Scrolling content area */}
      <div className="flex-1 overflow-hidden h-full flex items-center">
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
              isHovered || hasTickerFocus || selectedDetail
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
      </Suspense>

      <LightningTickerDetail
        detail={
          selectedDetail?.kind === "lightning" ? selectedDetail : null
        }
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

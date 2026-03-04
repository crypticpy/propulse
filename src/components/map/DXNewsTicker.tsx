/**
 * DXNewsTicker Component
 *
 * A CSS-animated scrolling information bar showing live propagation data.
 * Displays solar indices, band conditions, and DX spot activity in a
 * continuously scrolling ticker with pause-on-hover behavior.
 *
 * Data sources:
 * - Solar flux (SFI) and K-index from useSolarData hooks
 * - Active solar alerts from useSolarAlerts
 * - Band conditions from store-derived calculations
 * - DX spot activity from dxStore
 *
 * Animation approach:
 * - Content is rendered twice (duplicated) in a scrolling container
 * - CSS @keyframes scrolls from translateX(0) to translateX(-50%)
 * - Duration is dynamically calculated based on content width (~90px/sec)
 * - Edge fade via CSS mask-image gradient
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useKIndex, useSolarFlux } from "@/hooks/useSolarData";
import { useSolarAlerts } from "@/hooks/useSolarAlerts";
import { useDXStore } from "@/stores/dxStore";
import { getGeomagneticCondition } from "@/lib/utils/solarConversions";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import { useLightning } from "@/hooks/useLightning";
import { useUserStore } from "@/stores/userStore";
import { getDistance } from "@/lib/utils/path";
import type { LightningStrike } from "@/lib/api/lightning";

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
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Scroll speed in pixels per second */
const SCROLL_SPEED_PX_PER_SEC = 90;

/** How often to regenerate ticker content (ms) */
const CONTENT_REFRESH_INTERVAL_MS = 30_000;

/** Diamond separator character */
const SEPARATOR = "\u25C6";

/** Proximity radius in km */
const LIGHTNING_PROXIMITY_KM = 500;
const WEATHER_PROXIMITY_KM = 800;

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
    if (dist <= LIGHTNING_PROXIMITY_KM) {
      count++;
      if (strike.currentKA > maxKA) maxKA = strike.currentKA;
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
  const [isPaused, setIsPaused] = useState(false);
  const [animationDuration, setAnimationDuration] = useState(20);
  const [refreshTick, setRefreshTick] = useState(0);
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
          text: `\u26A1 Lightning ${lightning.nearestKm}km ${lightning.bearing} | ${lightning.countWithin} strikes within ${LIGHTNING_PROXIMITY_KM}km | Peak: ${lightning.maxCurrentKA}kA`,
          highlight: true,
          alertLevel: severity,
        });

        // Add QRN impact note for close lightning
        if (lightning.nearestKm < 300) {
          items.push({
            id: "qrn",
            text: "\u26A1 QRN likely on 160m-40m | Static crashes expected",
            highlight: true,
            alertLevel: "warning",
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
        if (dist > WEATHER_PROXIMITY_KM) return false;
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
  const renderTickerContent = useCallback(() => {
    return tickerItems.map((item, index) => (
      <span
        key={item.id}
        className="inline-flex items-center whitespace-nowrap"
      >
        {index > 0 && (
          <span className="mx-3 text-gray-600 select-none">{SEPARATOR}</span>
        )}
        {item.alertLevel === "critical" ? (
          <span className="text-red-400 font-semibold">{item.text}</span>
        ) : item.alertLevel === "warning" ? (
          <span className="text-amber-400 font-semibold">{item.text}</span>
        ) : item.highlight ? (
          <span className="text-[#ff6b35]">{item.text}</span>
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
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
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
          className="inline-flex items-center font-mono text-[11px] text-gray-300"
          style={{
            animationName: KEYFRAMES_NAME,
            animationDuration: `${animationDuration}s`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            animationPlayState: isPaused ? "paused" : "running",
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
          <span className="inline-flex items-center whitespace-nowrap">
            {renderTickerContent()}
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

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

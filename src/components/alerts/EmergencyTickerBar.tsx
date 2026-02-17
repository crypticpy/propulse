/**
 * EmergencyTickerBar Component
 *
 * A slim, full-width ticker bar that appears below the Header when WARNING
 * or CRITICAL space weather events are active. Displays scrolling text with
 * affected bands, recommendations, and alert details.
 *
 * Data sources:
 * - alertsStore: Propulse engine alerts (SolarAlert instances)
 * - useSwpcAlerts: Raw SWPC feed with NOAA scale codes
 *
 * Visual behavior:
 * - WARNING: amber glow, amber border
 * - CRITICAL: red glow, red border
 * - Content scrolls horizontally using CSS keyframes (pause on hover)
 * - Dismissible via X button; reappears when new alerts arrive
 *
 * Animation approach matches DXNewsTicker:
 * - Content duplicated for seamless looping
 * - CSS translateX(0) to translateX(-50%)
 * - Edge fade via CSS mask-image gradient
 */

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { useAlertsStore } from "@/stores/alertsStore";
import { useSwpcAlerts } from "@/hooks/useSwpcAlerts";
import { getRadioImpact } from "@/lib/utils/alertImpact";
import { ALERT_ICONS } from "@/constants/alertThresholds";
import type { AlertPriority, AlertType, SolarAlert } from "@/types/alerts";
import type { SwpcAlertParsed } from "@/types/swpcAlerts";
import { StormImpactPanel } from "@/components/alerts/StormImpactPanel";

// Lazy-load detail modals (only needed on click, keeps entry bundle lean)
const SwpcAlertDetailModal = lazy(() =>
  import("@/components/alerts/SwpcAlertDetailModal").then((m) => ({
    default: m.SwpcAlertDetailModal,
  })),
);
const AlertDetailModal = lazy(() =>
  import("@/components/alerts/AlertDetailModal").then((m) => ({
    default: m.AlertDetailModal,
  })),
);

// =============================================================================
// CONSTANTS
// =============================================================================

/** Scroll speed in pixels per second */
const SCROLL_SPEED_PX_PER_SEC = 60;

/** Diamond separator character */
const SEPARATOR = "\u25C6";

/** Keyframes name for the scroll animation */
const KEYFRAMES_NAME = "emergency-ticker-scroll";

/** Keyframes name for the pulse animation */
const PULSE_KEYFRAMES_NAME = "emergency-ticker-pulse";

// =============================================================================
// TYPES
// =============================================================================

type TickerEntrySource =
  | { kind: "store"; alert: SolarAlert }
  | { kind: "swpc"; alert: SwpcAlertParsed };

interface TickerEntry {
  id: string;
  icon: string;
  label: string;
  scaleCode: string;
  priority: AlertPriority;
  affectedBands: string;
  recommendation: string;
  source: TickerEntrySource;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Map SWPC category to AlertType for impact lookup
 */
function swpcCategoryToAlertType(
  category: string,
  scaleCode: string | null,
): AlertType {
  if (scaleCode) {
    const letter = scaleCode[0].toUpperCase();
    if (letter === "G") return "GEOMAGNETIC_STORM";
    if (letter === "R") return "RADIO_BLACKOUT";
    if (letter === "S") return "PROTON_EVENT";
  }
  switch (category) {
    case "storm":
      return "GEOMAGNETIC_STORM";
    case "blackout":
      return "RADIO_BLACKOUT";
    case "radiation":
      return "PROTON_EVENT";
    case "flare":
      return "SOLAR_FLARE";
    default:
      return "GEOMAGNETIC_STORM";
  }
}

/**
 * Map SWPC severity to AlertPriority
 */
function swpcSeverityToPriority(severity: string): AlertPriority {
  switch (severity) {
    case "extreme":
    case "major":
      return "CRITICAL";
    case "moderate":
      return "WARNING";
    default:
      return "INFO";
  }
}

/**
 * Extract NOAA scale number (the digit) from a code like "G2", "R3", etc.
 */
function noaaScaleNumber(code: string | null): number {
  if (!code) return 0;
  const n = Number(code.slice(1));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Get a human-readable label from AlertType
 */
function alertTypeLabel(type: AlertType): string {
  switch (type) {
    case "GEOMAGNETIC_STORM":
      return "GEOMAGNETIC STORM";
    case "RADIO_BLACKOUT":
      return "RADIO BLACKOUT";
    case "SOLAR_FLARE":
      return "SOLAR FLARE";
    case "PROTON_EVENT":
      return "PROTON EVENT";
    case "CME_INCOMING":
      return "CME INCOMING";
    case "DST_STORM":
      return "DST STORM";
    case "IMF_SOUTHWARD":
      return "IMF SOUTHWARD";
    case "AURORA_WARNING":
      return "AURORA WARNING";
    case "BAND_DEGRADATION":
      return "BAND DEGRADATION";
    case "BAND_OPENING":
      return "BAND OPENING";
    case "GREYLINE_APPROACHING":
      return "GREYLINE APPROACHING";
    default:
      return "ALERT";
  }
}

/**
 * Build ticker entries from Propulse engine alerts
 */
function buildEntriesFromStoreAlerts(alerts: SolarAlert[]): TickerEntry[] {
  return alerts.map((alert) => {
    const impact = getRadioImpact(alert.type, alert.priority);
    const icon = ALERT_ICONS[alert.type] ?? "\u26A0\uFE0F";
    const scaleCode = alert.priority === "CRITICAL" ? "3+" : "2";

    return {
      id: `store-${alert.id}`,
      icon,
      label: alertTypeLabel(alert.type),
      scaleCode,
      priority: alert.priority,
      affectedBands:
        impact.affectedBands.length > 0 ? impact.affectedBands.join(", ") : "",
      recommendation: impact.recommendation,
      source: { kind: "store" as const, alert },
    };
  });
}

/**
 * Build ticker entries from SWPC alerts with NOAA scale >= 2
 */
function buildEntriesFromSwpcAlerts(alerts: SwpcAlertParsed[]): TickerEntry[] {
  return alerts
    .filter((a) => noaaScaleNumber(a.noaaScaleCode) >= 2)
    .map((alert) => {
      const alertType = swpcCategoryToAlertType(
        alert.category,
        alert.noaaScaleCode,
      );
      const priority = swpcSeverityToPriority(alert.severity);
      const impact = getRadioImpact(alertType, priority);
      const icon = ALERT_ICONS[alertType] ?? "\u26A0\uFE0F";

      return {
        id: `swpc-${alert.product_id}`,
        icon,
        label: alertTypeLabel(alertType),
        scaleCode: alert.noaaScaleCode ?? "",
        priority,
        affectedBands:
          impact.affectedBands.length > 0
            ? impact.affectedBands.join(", ")
            : "",
        recommendation: impact.recommendation,
        source: { kind: "swpc" as const, alert },
      };
    });
}

/**
 * Deduplicate entries by type — prefer Propulse store entries over SWPC
 */
function deduplicateEntries(entries: TickerEntry[]): TickerEntry[] {
  const seen = new Set<string>();
  const result: TickerEntry[] = [];
  for (const entry of entries) {
    if (!seen.has(entry.label)) {
      seen.add(entry.label);
      result.push(entry);
    }
  }
  return result;
}

/**
 * Determine overall ticker severity from entries
 */
function getOverallPriority(entries: TickerEntry[]): AlertPriority {
  if (entries.some((e) => e.priority === "CRITICAL")) return "CRITICAL";
  if (entries.some((e) => e.priority === "WARNING")) return "WARNING";
  return "INFO";
}

/**
 * Build a fingerprint for the current set of alerts so we can detect
 * when new alerts appear (and re-show the ticker after dismissal).
 */
function buildAlertFingerprint(entries: TickerEntry[]): string {
  return entries
    .map((e) => e.id)
    .sort()
    .join("|");
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EmergencyTickerBar() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [isPaused, setIsPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TickerEntry | null>(null);
  const [animationDuration, setAnimationDuration] = useState(20);
  const [dismissedFingerprint, setDismissedFingerprint] = useState<
    string | null
  >(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Data sources
  // ---------------------------------------------------------------------------
  const storeAlerts = useAlertsStore((s) => s.alerts);
  const { data: swpcAlerts } = useSwpcAlerts();

  // ---------------------------------------------------------------------------
  // Build ticker entries
  // ---------------------------------------------------------------------------
  const tickerEntries = useMemo(() => {
    // Filter store alerts to WARNING/CRITICAL active
    const activeStoreAlerts = storeAlerts.filter(
      (a) =>
        a.status === "ACTIVE" &&
        (a.priority === "WARNING" || a.priority === "CRITICAL"),
    );

    const storeEntries = buildEntriesFromStoreAlerts(activeStoreAlerts);
    const swpcEntries = buildEntriesFromSwpcAlerts(swpcAlerts);

    // Merge: store alerts first, then SWPC, deduplicated by label
    return deduplicateEntries([...storeEntries, ...swpcEntries]);
  }, [storeAlerts, swpcAlerts]);

  const alertFingerprint = useMemo(
    () => buildAlertFingerprint(tickerEntries),
    [tickerEntries],
  );

  // Reset dismissal when new alerts appear
  useEffect(() => {
    if (
      dismissedFingerprint !== null &&
      alertFingerprint !== dismissedFingerprint
    ) {
      setDismissedFingerprint(null);
    }
  }, [alertFingerprint, dismissedFingerprint]);

  const overallPriority = useMemo(
    () => getOverallPriority(tickerEntries),
    [tickerEntries],
  );

  // Find highest-priority active Propulse alert for the detail panel
  const highestAlert = useMemo<SolarAlert | null>(() => {
    const priorityOrder: AlertPriority[] = ["CRITICAL", "WARNING", "INFO"];
    const active = storeAlerts
      .filter((a) => a.status === "ACTIVE")
      .sort(
        (a, b) =>
          priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority),
      );
    return active[0] ?? null;
  }, [storeAlerts]);

  // Toggle expanded detail panel
  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // ---------------------------------------------------------------------------
  // Animation duration from content width
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
  }, [tickerEntries, recalcDuration]);

  useEffect(() => {
    const observer = new ResizeObserver(recalcDuration);
    if (contentRef.current) {
      observer.observe(contentRef.current);
    }
    return () => observer.disconnect();
  }, [recalcDuration]);

  // ---------------------------------------------------------------------------
  // Dismiss handler
  // ---------------------------------------------------------------------------
  const handleDismiss = useCallback(() => {
    setDismissedFingerprint(alertFingerprint);
    setExpanded(false);
  }, [alertFingerprint]);

  // ---------------------------------------------------------------------------
  // Render nothing when there are no alerts or ticker is dismissed
  // ---------------------------------------------------------------------------
  if (tickerEntries.length === 0) return null;
  if (dismissedFingerprint === alertFingerprint) return null;

  // ---------------------------------------------------------------------------
  // Style based on severity
  // ---------------------------------------------------------------------------
  const isCritical = overallPriority === "CRITICAL";
  const borderColor = isCritical
    ? "border-alert-red/30"
    : "border-caution-amber/30";
  const bgColor = isCritical ? "bg-alert-red/10" : "bg-caution-amber/10";
  const glowColor = isCritical
    ? "rgba(239, 68, 68, 0.15)"
    : "rgba(245, 158, 11, 0.1)";
  const accentColor = isCritical ? "text-alert-red" : "text-caution-amber";
  const badgeBg = isCritical ? "bg-alert-red" : "bg-caution-amber";
  const dotColor = isCritical ? "#ef4444" : "#f59e0b";

  // ---------------------------------------------------------------------------
  // Build the scrolling text (one copy)
  // ---------------------------------------------------------------------------
  const renderTickerContent = () =>
    tickerEntries.map((entry, index) => (
      <span
        key={entry.id}
        className="inline-flex items-center whitespace-nowrap cursor-pointer hover:brightness-125 transition-all"
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedEntry(entry);
        }}
      >
        {index > 0 && (
          <span className="mx-3 text-gray-600 select-none">{SEPARATOR}</span>
        )}
        <span
          className={`font-semibold ${accentColor} underline decoration-dotted underline-offset-2`}
        >
          {entry.icon} {entry.label}
          {entry.scaleCode ? ` (${entry.scaleCode})` : ""} &mdash;{" "}
          {entry.priority}
        </span>
        {entry.affectedBands && (
          <span className="text-gray-300 ml-2">
            | Affected: {entry.affectedBands}
          </span>
        )}
        <span className="text-gray-300 ml-2">| {entry.recommendation}</span>
      </span>
    ));

  // ---------------------------------------------------------------------------
  // Build the full-text content for screen readers (no scrolling)
  // ---------------------------------------------------------------------------
  const srText = tickerEntries
    .map((entry) => {
      let text = `${entry.label}`;
      if (entry.scaleCode) text += ` (${entry.scaleCode})`;
      text += ` - ${entry.priority}`;
      if (entry.affectedBands) text += `. Affected: ${entry.affectedBands}`;
      text += `. ${entry.recommendation}`;
      return text;
    })
    .join(". ");

  // ---------------------------------------------------------------------------
  // Inline keyframes
  // ---------------------------------------------------------------------------
  const keyframesStyle = `
    @keyframes ${KEYFRAMES_NAME} {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    @keyframes ${PULSE_KEYFRAMES_NAME} {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.75); }
    }
  `;

  return (
    <>
      <div
        className={`relative flex items-center h-[40px] overflow-hidden select-none ${bgColor} border-b ${borderColor}`}
        style={{
          boxShadow: `inset 0 0 20px ${glowColor}`,
        }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        role="alert"
        aria-live="assertive"
      >
        {/* Inject keyframes */}
        <style>{keyframesStyle}</style>

        {/* Screen reader text (hidden visually) */}
        <span className="sr-only">{srText}</span>

        {/* LIVE badge - pinned left */}
        <div
          className="relative z-10 flex items-center gap-1.5 px-3 h-full flex-shrink-0"
          style={{
            background: `linear-gradient(to right, ${isCritical ? "rgba(30, 10, 10, 0.95)" : "rgba(30, 20, 10, 0.95)"} 80%, transparent)`,
          }}
          aria-hidden="true"
        >
          <span
            className={`font-mono font-bold uppercase tracking-wider ${badgeBg} text-void-black`}
            style={{
              fontSize: "10px",
              letterSpacing: "0.5px",
              padding: "2px 6px",
              borderRadius: "2px",
              lineHeight: "16px",
            }}
          >
            LIVE
          </span>
          {/* Pulsing dot */}
          <span
            className="inline-block rounded-full"
            style={{
              width: "6px",
              height: "6px",
              backgroundColor: dotColor,
              animation: `${PULSE_KEYFRAMES_NAME} 2s ease-in-out infinite`,
            }}
          />
        </div>

        {/* Scrolling content area — click to toggle detail panel */}
        <div
          className="flex-1 overflow-hidden h-full flex items-center cursor-pointer"
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0%, black 2%, black 92%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0%, black 2%, black 92%, transparent 100%)",
          }}
          aria-hidden="true"
          onClick={handleToggleExpand}
        >
          <div
            ref={contentRef}
            className="inline-flex items-center font-mono text-sm"
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
            {/* Spacer */}
            <span className="mx-8 text-gray-600 select-none">{SEPARATOR}</span>
            {/* Second copy (seamless loop) */}
            <span className="inline-flex items-center whitespace-nowrap">
              {renderTickerContent()}
            </span>
          </div>
        </div>

        {/* Expand/collapse chevron */}
        <button
          type="button"
          className={`relative z-10 flex items-center justify-center w-8 h-8 flex-shrink-0 rounded hover:bg-white/10 transition-colors ${accentColor}`}
          onClick={handleToggleExpand}
          aria-label={
            expanded ? "Collapse detail panel" : "Expand detail panel"
          }
          title={expanded ? "Collapse" : "Expand"}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {/* Dismiss button - pinned right */}
        <button
          type="button"
          className={`relative z-10 flex items-center justify-center w-8 h-8 flex-shrink-0 mr-1 rounded hover:bg-white/10 transition-colors ${accentColor}`}
          onClick={handleDismiss}
          aria-label="Dismiss emergency ticker"
          title="Dismiss"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Expandable detail panel */}
      {expanded && highestAlert && (
        <div
          className={`${bgColor} border-b ${borderColor} px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200`}
          style={{
            boxShadow: `inset 0 0 12px ${glowColor}`,
          }}
        >
          <StormImpactPanel alert={highestAlert} />
        </div>
      )}

      {/* Alert detail modals — opened when user clicks a ticker entry */}
      {selectedEntry && (
        <Suspense fallback={null}>
          {selectedEntry.source.kind === "swpc" && (
            <SwpcAlertDetailModal
              isOpen
              onClose={() => setSelectedEntry(null)}
              alert={selectedEntry.source.alert}
            />
          )}
          {selectedEntry.source.kind === "store" && (
            <AlertDetailModal
              isOpen
              onClose={() => setSelectedEntry(null)}
              alert={selectedEntry.source.alert}
            />
          )}
        </Suspense>
      )}
    </>
  );
}

export default EmergencyTickerBar;

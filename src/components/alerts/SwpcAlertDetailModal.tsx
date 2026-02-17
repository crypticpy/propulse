/**
 * SwpcAlertDetailModal - Detail view for a single SWPC alert message.
 *
 * Displays full alert text, NOAA scale badge, severity, category,
 * radio impact guidance, and timestamp information inside a centered modal.
 */

import { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { BAND_DEGRADATION_MAP, ALERT_ICONS } from "@/constants/alertThresholds";
import { useAlertsStore } from "@/stores/alertsStore";
import { StormImpactPanel } from "@/components/alerts/StormImpactPanel";
import type { AlertType } from "@/types/alerts";
import type {
  SwpcAlertParsed,
  SwpcAlertSeverity,
  SwpcAlertCategory,
} from "@/types/swpcAlerts";

// =============================================================================
// TYPES
// =============================================================================

export interface SwpcAlertDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  alert: SwpcAlertParsed | null;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SEVERITY_COLORS: Record<
  SwpcAlertSeverity,
  { border: string; bg: string; text: string; badge: string }
> = {
  minor: {
    border: "border-signal-green/30",
    bg: "bg-signal-green/10",
    text: "text-signal-green",
    badge: "bg-signal-green/20 text-signal-green border-signal-green/40",
  },
  moderate: {
    border: "border-caution-amber/30",
    bg: "bg-caution-amber/10",
    text: "text-caution-amber",
    badge: "bg-caution-amber/20 text-caution-amber border-caution-amber/40",
  },
  major: {
    border: "border-plasma-orange/30",
    bg: "bg-plasma-orange/10",
    text: "text-plasma-orange",
    badge: "bg-plasma-orange/20 text-plasma-orange border-plasma-orange/40",
  },
  extreme: {
    border: "border-alert-red/30",
    bg: "bg-alert-red/10",
    text: "text-alert-red",
    badge: "bg-alert-red/20 text-alert-red border-alert-red/40",
  },
};

const CATEGORY_LABELS: Record<SwpcAlertCategory, string> = {
  storm: "Geomagnetic Storm",
  flare: "Solar Flare",
  blackout: "Radio Blackout",
  radiation: "Solar Radiation",
  other: "Space Weather",
};

const CATEGORY_ICONS: Record<SwpcAlertCategory, string> = {
  storm: ALERT_ICONS.GEOMAGNETIC_STORM,
  flare: ALERT_ICONS.SOLAR_FLARE,
  blackout: ALERT_ICONS.RADIO_BLACKOUT,
  radiation: ALERT_ICONS.PROTON_EVENT,
  other: ALERT_ICONS.BAND_DEGRADATION,
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format a Date as relative time (e.g. "3 hours ago") with absolute fallback.
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60)
    return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24)
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
}

/**
 * Get radio impact info based on a NOAA scale code.
 * Returns affected bands and recommended actions.
 */
function getRadioImpact(code: string | null): {
  affectedBands: string[];
  description: string;
  recommendation: string;
} {
  if (!code) {
    return {
      affectedBands: [],
      description: "No specific NOAA scale impact identified.",
      recommendation: "Monitor conditions and check for updates.",
    };
  }

  const letter = code[0].toUpperCase();
  const level = Number(code.slice(1));

  if (letter === "G") {
    // Geomagnetic storm -> map Kp via BAND_DEGRADATION_MAP
    // G1=Kp5, G2=Kp6, G3=Kp7, G4=Kp8, G5=Kp9
    const kp = level + 4;
    const degradation = BAND_DEGRADATION_MAP.filter(
      (d) => kp >= d.kpLevel,
    ).sort((a, b) => b.kpLevel - a.kpLevel)[0];

    return {
      affectedBands: degradation?.bands ?? [],
      description:
        degradation?.description ?? "Geomagnetic disturbance detected.",
      recommendation:
        level >= 3
          ? "Avoid high-band DX. Low bands may be enhanced at mid-latitudes. Polar paths severely degraded."
          : "Higher HF bands may experience fading. Low bands likely unaffected.",
    };
  }

  if (letter === "R") {
    // Radio blackout scale
    const bands: string[] = [];
    let desc = "";
    let rec = "";

    if (level >= 4) {
      bands.push(
        "160m",
        "80m",
        "60m",
        "40m",
        "30m",
        "20m",
        "17m",
        "15m",
        "12m",
        "10m",
      );
      desc = "Complete HF blackout on the sunlit side of Earth.";
      rec =
        "All HF communication unreliable on dayside paths. Wait for event to subside.";
    } else if (level >= 3) {
      bands.push("40m", "30m", "20m", "17m", "15m", "12m", "10m");
      desc = "Wide-area HF blackout on the sunlit side.";
      rec = "Avoid dayside HF paths. Night paths and low bands may still work.";
    } else if (level >= 2) {
      bands.push("20m", "17m", "15m", "12m", "10m");
      desc = "Limited HF blackout on the sunlit side.";
      rec =
        "Higher HF bands degraded on dayside. Lower bands and night paths are less affected.";
    } else {
      bands.push("15m", "12m", "10m");
      desc = "Minor degradation of HF signals on the sunlit side.";
      rec = "Slight fading on higher HF bands. Most operations unaffected.";
    }

    return { affectedBands: bands, description: desc, recommendation: rec };
  }

  if (letter === "S") {
    // Solar radiation storm
    const bands =
      level >= 3
        ? ["All HF on polar paths"]
        : level >= 2
          ? ["10m", "12m", "15m", "17m", "20m (polar)"]
          : ["10m", "12m (polar)"];
    return {
      affectedBands: bands,
      description:
        level >= 3
          ? "Severe polar cap absorption. All HF on polar paths disrupted."
          : "Elevated radiation affecting polar HF propagation.",
      recommendation:
        level >= 3
          ? "Avoid trans-polar paths entirely. Mid-latitude paths may still work."
          : "Polar and high-latitude paths degraded. Try lower-latitude paths.",
    };
  }

  return {
    affectedBands: [],
    description: "Consult NOAA SWPC for detailed impact assessment.",
    recommendation: "Monitor conditions and check for updates.",
  };
}

/**
 * Map SWPC category/scale to a Propulse AlertType for matching
 */
function swpcCategoryToAlertType(
  category: SwpcAlertCategory,
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

// =============================================================================
// COMPONENT
// =============================================================================

export function SwpcAlertDetailModal({
  isOpen,
  onClose,
  alert,
}: SwpcAlertDetailModalProps) {
  const impact = useMemo(
    () => (alert ? getRadioImpact(alert.noaaScaleCode) : null),
    [alert],
  );

  // Try to find a matching Propulse engine alert for personalized impact analysis
  const activeAlerts = useAlertsStore((s) => s.alerts);
  const matchingAlert = useMemo(() => {
    if (!alert) return null;
    const targetType = swpcCategoryToAlertType(
      alert.category,
      alert.noaaScaleCode,
    );
    return (
      activeAlerts.find(
        (a) => a.status === "ACTIVE" && a.type === targetType,
      ) ?? null
    );
  }, [alert, activeAlerts]);

  if (!alert) return null;

  const colors = SEVERITY_COLORS[alert.severity];
  const categoryLabel = CATEGORY_LABELS[alert.category];
  const categoryIcon = CATEGORY_ICONS[alert.category];

  const absoluteUtc =
    alert.parsedDate.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const relative = formatRelativeTime(alert.parsedDate);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="SWPC Alert Detail"
      subtitle={categoryLabel}
      size="lg"
    >
      <div className="space-y-6">
        {/* Header row: scale badge + category + severity */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Category icon */}
          <span className="text-2xl" aria-hidden="true">
            {categoryIcon}
          </span>

          {/* NOAA scale badge */}
          {alert.noaaScaleCode && (
            <span
              className={`inline-flex items-center px-3 py-1 rounded-lg border font-mono text-sm font-bold ${colors.badge}`}
            >
              {alert.noaaScaleCode}
            </span>
          )}

          {/* Severity label */}
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}
          >
            {alert.severity}
          </span>

          {/* Category tag */}
          <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded-md border border-white/10">
            {categoryLabel}
          </span>
        </div>

        {/* Summary line */}
        <div className={`rounded-xl ${colors.bg} border ${colors.border} p-4`}>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-1">
            Summary
          </h3>
          <p className={`text-sm font-medium ${colors.text}`}>
            {alert.summaryLine}
          </p>
        </div>

        {/* Radio Impact */}
        {impact && (impact.affectedBands.length > 0 || alert.noaaScaleCode) && (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Radio Impact
            </h3>

            <p className="text-sm text-gray-300 mb-3">{impact.description}</p>

            {impact.affectedBands.length > 0 && (
              <div className="mb-3">
                <span className="text-xs text-gray-500 block mb-1.5">
                  Affected bands:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {impact.affectedBands.map((band) => (
                    <span
                      key={band}
                      className={`px-2 py-0.5 text-xs font-mono rounded ${colors.bg} ${colors.text} border ${colors.border}`}
                    >
                      {band}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-white/10">
              <span className="text-xs text-gray-500 block mb-1">
                Recommended action:
              </span>
              <p className="text-sm text-gray-300">{impact.recommendation}</p>
            </div>
          </div>
        )}

        {/* Personalized storm impact analysis (when matching Propulse alert exists) */}
        {matchingAlert && <StormImpactPanel alert={matchingAlert} />}

        {/* Full message */}
        <div className="rounded-xl bg-void-black/50 border border-white/10 p-4">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
            Full Message
          </h3>
          <pre className="whitespace-pre-wrap font-mono text-xs text-white/70 leading-relaxed max-h-80 overflow-y-auto">
            {alert.message}
          </pre>
        </div>

        {/* Timestamp */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-white/10">
          <span>
            Issued:{" "}
            <span className="text-gray-400 font-mono">{absoluteUtc}</span>
          </span>
          <span className="text-gray-400">{relative}</span>
        </div>

        {/* Official source links */}
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
            Official Sources
          </h3>
          <div className="space-y-2">
            <a
              href="https://www.swpc.noaa.gov/products/alerts-watches-and-warnings"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-cosmic-cyan hover:text-cosmic-cyan/80 transition-colors group"
            >
              <svg
                className="w-4 h-4 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              NOAA SWPC Alerts, Watches &amp; Warnings
            </a>
            <a
              href="https://www.swpc.noaa.gov/noaa-scales-explanation"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-cosmic-cyan hover:text-cosmic-cyan/80 transition-colors group"
            >
              <svg
                className="w-4 h-4 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              NOAA Space Weather Scales
            </a>
            <a
              href="https://www.swpc.noaa.gov/products/3-day-forecast"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-cosmic-cyan hover:text-cosmic-cyan/80 transition-colors group"
            >
              <svg
                className="w-4 h-4 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              NOAA 3-Day Space Weather Forecast
            </a>
          </div>
        </div>

        {/* Product ID */}
        <div className="text-xs text-gray-600">
          Product ID: <span className="font-mono">{alert.product_id}</span>
        </div>
      </div>
    </DetailModal>
  );
}

export default SwpcAlertDetailModal;

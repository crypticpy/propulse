/**
 * AlertDetailModal — Detail view for a Propulse engine SolarAlert.
 *
 * Shows alert info, radio impact analysis via StormImpactPanel,
 * and links to authoritative NOAA/NASA sources.
 */

import { useMemo } from "react";
import { DetailModal } from "@/components/ui/DetailModal";
import { ALERT_ICONS } from "@/constants/alertThresholds";
import { getRadioImpact } from "@/lib/utils/alertImpact";
import { StormImpactPanel } from "@/components/alerts/StormImpactPanel";
import type { SolarAlert, AlertType, AlertPriority } from "@/types/alerts";

// ─── Source URLs ────────────────────────────────────────────────────────────

interface SourceLink {
  label: string;
  url: string;
}

const SOURCE_LINKS: Record<string, SourceLink[]> = {
  GEOMAGNETIC_STORM: [
    {
      label: "NOAA Planetary K-index",
      url: "https://www.swpc.noaa.gov/products/planetary-k-index",
    },
    {
      label: "NOAA G-Scale Explanation",
      url: "https://www.swpc.noaa.gov/noaa-scales-explanation",
    },
    {
      label: "NOAA 3-Day Forecast",
      url: "https://www.swpc.noaa.gov/products/3-day-forecast",
    },
  ],
  RADIO_BLACKOUT: [
    {
      label: "NOAA D-Region Absorption",
      url: "https://www.swpc.noaa.gov/products/d-region-absorption-predictions",
    },
    {
      label: "NOAA GOES X-ray Flux",
      url: "https://www.swpc.noaa.gov/products/goes-x-ray-flux",
    },
    {
      label: "NOAA R-Scale Explanation",
      url: "https://www.swpc.noaa.gov/noaa-scales-explanation",
    },
  ],
  SOLAR_FLARE: [
    {
      label: "NOAA GOES X-ray Flux",
      url: "https://www.swpc.noaa.gov/products/goes-x-ray-flux",
    },
    {
      label: "NOAA Solar Flare Alerts",
      url: "https://www.swpc.noaa.gov/products/alerts-watches-and-warnings",
    },
  ],
  PROTON_EVENT: [
    {
      label: "NOAA GOES Proton Flux",
      url: "https://www.swpc.noaa.gov/products/goes-proton-flux",
    },
    {
      label: "NOAA S-Scale Explanation",
      url: "https://www.swpc.noaa.gov/noaa-scales-explanation",
    },
  ],
  CME_INCOMING: [
    {
      label: "NASA DONKI CME Analysis",
      url: "https://kauai.ccmc.gsfc.nasa.gov/DONKI/search/",
    },
    {
      label: "NOAA CME Scoreboard",
      url: "https://www.swpc.noaa.gov/products/wsa-enlil-solar-wind-prediction",
    },
  ],
  DST_STORM: [
    {
      label: "Kyoto Dst Index",
      url: "https://wdc.kugi.kyoto-u.ac.jp/dst_realtime/",
    },
    {
      label: "NOAA Geomagnetic Storms",
      url: "https://www.swpc.noaa.gov/phenomena/geomagnetic-storms",
    },
  ],
  IMF_SOUTHWARD: [
    {
      label: "NOAA Real-Time Solar Wind",
      url: "https://www.swpc.noaa.gov/products/real-time-solar-wind",
    },
  ],
  AURORA_WARNING: [
    {
      label: "NOAA Aurora Forecast",
      url: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
    },
  ],
  BAND_OPENING: [
    {
      label: "NOAA HF Propagation",
      url: "https://www.swpc.noaa.gov/communities/radio-communications",
    },
  ],
  GREYLINE_APPROACHING: [],
  BAND_DEGRADATION: [],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<
  AlertPriority,
  { text: string; classes: string }
> = {
  INFO: {
    text: "Info",
    classes: "bg-cosmic-cyan/20 text-cosmic-cyan border-cosmic-cyan/40",
  },
  WARNING: {
    text: "Warning",
    classes: "bg-caution-amber/20 text-caution-amber border-caution-amber/40",
  },
  CRITICAL: {
    text: "Critical",
    classes: "bg-alert-red/20 text-alert-red border-alert-red/40",
  },
};

const TYPE_LABELS: Partial<Record<AlertType, string>> = {
  GEOMAGNETIC_STORM: "Geomagnetic Storm",
  RADIO_BLACKOUT: "Radio Blackout",
  SOLAR_FLARE: "Solar Flare",
  PROTON_EVENT: "Solar Radiation Storm",
  CME_INCOMING: "CME Incoming",
  DST_STORM: "Dst Storm",
  IMF_SOUTHWARD: "IMF Southward",
  AURORA_WARNING: "Aurora Warning",
  BAND_OPENING: "Band Opening",
  GREYLINE_APPROACHING: "Greyline Approaching",
  BAND_DEGRADATION: "Band Degradation",
};

function formatTimestamp(iso: string): { absolute: string; relative: string } {
  const d = new Date(iso);
  const absolute = d.toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  let relative: string;
  if (diffMins < 1) relative = "Just now";
  else if (diffMins < 60)
    relative = `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  else {
    const h = Math.floor(diffMins / 60);
    if (h < 24) relative = `${h} hour${h !== 1 ? "s" : ""} ago`;
    else {
      const days = Math.floor(h / 24);
      relative = `${days} day${days !== 1 ? "s" : ""} ago`;
    }
  }
  return { absolute, relative };
}

// ─── Component ──────────────────────────────────────────────────────────────

export interface AlertDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  alert: SolarAlert | null;
}

export function AlertDetailModal({
  isOpen,
  onClose,
  alert,
}: AlertDetailModalProps) {
  const impact = useMemo(
    () => (alert ? getRadioImpact(alert.type, alert.priority) : null),
    [alert],
  );

  if (!alert) return null;

  const icon = ALERT_ICONS[alert.type] ?? "\u26A0\uFE0F";
  const priorityMeta = PRIORITY_LABELS[alert.priority];
  const typeLabel = TYPE_LABELS[alert.type] ?? alert.type;
  const sources = SOURCE_LINKS[alert.type] ?? [];
  const ts = formatTimestamp(alert.triggeredAt);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Space Weather Alert"
      subtitle={typeLabel}
      size="lg"
    >
      <div className="space-y-6">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            {icon}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider border ${priorityMeta.classes}`}
          >
            {priorityMeta.text}
          </span>
          <span className="text-sm font-semibold text-white">{typeLabel}</span>
        </div>

        {/* Alert description */}
        <div
          className={`rounded-xl border p-4 ${
            alert.priority === "CRITICAL"
              ? "bg-alert-red/10 border-alert-red/30"
              : alert.priority === "WARNING"
                ? "bg-caution-amber/10 border-caution-amber/30"
                : "bg-cosmic-cyan/10 border-cosmic-cyan/30"
          }`}
        >
          <h3 className="text-sm font-bold text-white mb-1">{alert.title}</h3>
          <p className="text-sm text-gray-300">{alert.message}</p>
          {alert.currentValue !== undefined && (
            <p className="text-xs text-gray-400 mt-2 font-mono">
              Current value: {alert.currentValue}
            </p>
          )}
        </div>

        {/* Radio impact summary */}
        {impact && impact.affectedBands.length > 0 && (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Radio Impact
            </h3>
            <div className="mb-3">
              <span className="text-xs text-gray-500 block mb-1.5">
                Affected bands:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {impact.affectedBands.map((band) => (
                  <span
                    key={band}
                    className={`px-2 py-0.5 text-xs font-mono rounded border ${
                      alert.priority === "CRITICAL"
                        ? "bg-alert-red/10 text-alert-red border-alert-red/30"
                        : "bg-caution-amber/10 text-caution-amber border-caution-amber/30"
                    }`}
                  >
                    {band}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-sm text-gray-300">{impact.recommendation}</p>
            <p className="text-xs text-gray-500 mt-2">
              Estimated duration: {impact.estimatedDuration}
            </p>
          </div>
        )}

        {/* Personalized storm impact */}
        <StormImpactPanel alert={alert} />

        {/* Source links */}
        {sources.length > 0 && (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              Official Sources
            </h3>
            <div className="space-y-2">
              {sources.map((src) => (
                <a
                  key={src.url}
                  href={src.url}
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
                  {src.label}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-white/10">
          <span>
            Triggered:{" "}
            <span className="text-gray-400 font-mono">{ts.absolute}</span>
          </span>
          <span className="text-gray-400">{ts.relative}</span>
        </div>
      </div>
    </DetailModal>
  );
}

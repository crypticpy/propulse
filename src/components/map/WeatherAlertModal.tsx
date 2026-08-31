/**
 * WeatherAlertModal Component
 *
 * A centered modal showing full weather alert details. Opened from the
 * WeatherAlertFlyout's "View Full Alert" button. Includes ham radio
 * impact information for weather events that affect HF propagation.
 *
 * Uses glassmorphism styling consistent with other modals in the app.
 * Dismisses on backdrop click, X button, or Escape key.
 */

import type { WeatherAlert } from "@/lib/api/weather";
import { AccessibleDialog } from "@/components/ui/AccessibleDialog";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WeatherAlertModalProps {
  /** The weather alert to display (null = hidden) */
  alert: WeatherAlert | null;
  /** Callback to close the modal */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get weather-appropriate emoji based on the event type.
 */
function getWeatherEmoji(event: string): string {
  const e = event.toLowerCase();
  if (e.includes("tornado")) return "\uD83C\uDF2A\uFE0F";
  if (e.includes("hurricane") || e.includes("tropical")) return "\uD83C\uDF00";
  if (e.includes("thunderstorm") || e.includes("lightning"))
    return "\u26C8\uFE0F";
  if (e.includes("flood") || e.includes("flash")) return "\uD83C\uDF0A";
  if (
    e.includes("winter") ||
    e.includes("blizzard") ||
    e.includes("ice") ||
    e.includes("snow") ||
    e.includes("freeze") ||
    e.includes("frost")
  )
    return "\u2744\uFE0F";
  if (e.includes("wind") || e.includes("gale")) return "\uD83D\uDCA8";
  if (e.includes("heat") || e.includes("excessive")) return "\uD83D\uDD25";
  if (e.includes("fog")) return "\uD83C\uDF2B\uFE0F";
  if (e.includes("rain") || e.includes("shower")) return "\uD83C\uDF27\uFE0F";
  if (e.includes("fire")) return "\uD83D\uDD25";
  return "\u26A0\uFE0F";
}

/**
 * Return the severity color.
 */
function severityColor(severity: WeatherAlert["severity"]): string {
  switch (severity) {
    case "Extreme":
      return "#ff0040";
    case "Severe":
      return "#ff6600";
    case "Moderate":
      return "#ffaa00";
    default:
      return "#ffdd44";
  }
}

/**
 * Return the severity badge background color (semi-transparent).
 */
function severityBgColor(severity: WeatherAlert["severity"]): string {
  switch (severity) {
    case "Extreme":
      return "rgba(255, 0, 64, 0.15)";
    case "Severe":
      return "rgba(255, 102, 0, 0.15)";
    case "Moderate":
      return "rgba(255, 170, 0, 0.15)";
    default:
      return "rgba(255, 221, 68, 0.15)";
  }
}

/**
 * Determine if the weather event may cause HF radio interference.
 * Returns a description of the expected impact, or null if no significant impact.
 */
function getRadioImpact(event: string): string | null {
  const e = event.toLowerCase();

  if (
    e.includes("thunderstorm") ||
    e.includes("lightning") ||
    e.includes("tornado")
  ) {
    return "Expected QRN (atmospheric noise) impact on HF bands, especially 160m-40m. Static crashes may degrade reception. Consider switching to higher bands or digital modes with error correction.";
  }

  if (e.includes("hurricane") || e.includes("tropical")) {
    return "Significant QRN expected across all HF bands due to intense electrical activity. Extended disruption to 160m-40m likely. VHF/UHF may also be affected by heavy precipitation.";
  }

  if (e.includes("wind") || e.includes("gale")) {
    return "High winds may cause antenna damage or increased noise from power line arcing. Check antenna systems and consider reducing power or disconnecting feedlines.";
  }

  if (
    e.includes("winter") ||
    e.includes("blizzard") ||
    e.includes("ice") ||
    e.includes("snow")
  ) {
    return "Ice accumulation may affect antenna elements and feedlines. Static precipitation (P-static) can increase noise levels. Monitor for reduced antenna performance.";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeatherAlertModal({ alert, onClose }: WeatherAlertModalProps) {
  const color = alert ? severityColor(alert.severity) : "#ffdd44";
  const bgColor = alert
    ? severityBgColor(alert.severity)
    : "rgba(255, 221, 68, 0.15)";
  const emoji = alert ? getWeatherEmoji(alert.event) : "\u26A0\uFE0F";
  const radioImpact = alert ? getRadioImpact(alert.event) : null;

  // AccessibleDialog centralizes the modal interaction contract: it moves
  // focus inside on open, traps Tab, makes background content inert, handles
  // Escape/backdrop dismissal, and restores focus to the originating control.
  return (
    <AccessibleDialog
      open={Boolean(alert)}
      onClose={onClose}
      title={alert?.event ?? "Weather alert details"}
      description={
        alert
          ? `${alert.severity} weather alert${
              radioImpact ? " and expected radio impact" : ""
            }.`
          : undefined
      }
      size="md"
    >
      {alert && (
        <div
          className="space-y-4 border-t-[3px] pt-4"
          style={{ borderTopColor: color }}
        >
          {/* Severity and event type remain visually prominent beneath the
              shared dialog header without duplicating its close control. */}
          <div className="flex items-center gap-3">
            <span className="text-2xl flex-shrink-0" aria-hidden="true">
              {emoji}
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{
                color,
                backgroundColor: bgColor,
                border: `1px solid ${color}44`,
              }}
            >
              {alert.severity}
            </span>
          </div>

          {/* Headline */}
          {alert.headline && (
            <p className="text-base leading-relaxed text-white">
              {alert.headline}
            </p>
          )}

          {/* Area */}
          {alert.areaDesc && (
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 flex-shrink-0 text-gray-400"
                aria-hidden="true"
              >
                {"\uD83D\uDCCD"}
              </span>
              <p className="text-sm leading-relaxed text-gray-400">
                {alert.areaDesc}
              </p>
            </div>
          )}

          {/* Radio impact section */}
          {radioImpact && (
            <section className="border-t border-zinc-700 pt-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm" aria-hidden="true">
                  {"\uD83D\uDCE1"}
                </span>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Impact on Radio
                </h3>
              </div>
              <p className="rounded-lg border border-cyan-500/10 bg-cyan-500/5 px-3 py-2 text-sm leading-relaxed text-gray-300">
                {radioImpact}
              </p>
            </section>
          )}

          {/* A visible footer action supplements the shared header close
              control for mouse and touch users scanning long alert text. */}
          <div className="flex justify-end border-t border-zinc-700 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 transition-colors duration-150 hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AccessibleDialog>
  );
}

WeatherAlertModal.displayName = "WeatherAlertModal";

export default WeatherAlertModal;

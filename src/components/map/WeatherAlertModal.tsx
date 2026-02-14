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

import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { WeatherAlert } from "@/lib/api/weather";

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
  const modalRef = useRef<HTMLDivElement>(null);

  // Escape key to dismiss
  useEffect(() => {
    if (!alert) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [alert, onClose]);

  // Backdrop click to dismiss
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  if (!alert) {
    return null;
  }

  const color = severityColor(alert.severity);
  const bgColor = severityBgColor(alert.severity);
  const emoji = getWeatherEmoji(alert.event);
  const radioImpact = getRadioImpact(alert.event);

  const modalContent = (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Weather alert details: ${alert.event}`}
    >
      <div
        ref={modalRef}
        className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden"
        style={{
          maxWidth: 480,
          maxHeight: "80vh",
          width: "90vw",
          borderTopColor: color,
          borderTopWidth: "3px",
        }}
      >
        {/* Scrollable content area */}
        <div className="overflow-y-auto" style={{ maxHeight: "80vh" }}>
          {/* Header */}
          <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="text-2xl flex-shrink-0">{emoji}</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-white font-bold text-lg leading-tight">
                  {alert.event}
                </h2>
                <div className="mt-1">
                  <span
                    className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={{
                      color: color,
                      backgroundColor: bgColor,
                      border: `1px solid ${color}44`,
                    }}
                  >
                    {alert.severity}
                  </span>
                </div>
              </div>
            </div>
            {/* Close button */}
            <button
              onClick={onClose}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors duration-150"
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          {/* Divider */}
          <div className="mx-5 border-t border-zinc-700" />

          {/* Headline */}
          {alert.headline && (
            <div className="px-5 pt-3 pb-2">
              <p className="text-base text-white leading-relaxed">
                {alert.headline}
              </p>
            </div>
          )}

          {/* Area */}
          {alert.areaDesc && (
            <div className="px-5 pb-3">
              <div className="flex items-start gap-2">
                <span className="text-gray-400 flex-shrink-0 mt-0.5">
                  {"\uD83D\uDCCD"}
                </span>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {alert.areaDesc}
                </p>
              </div>
            </div>
          )}

          {/* Radio impact section */}
          {radioImpact && (
            <>
              <div className="mx-5 border-t border-zinc-700" />
              <div className="px-5 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">{"\uD83D\uDCE1"}</span>
                  <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                    Impact on Radio
                  </span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-3 py-2">
                  {radioImpact}
                </p>
              </div>
            </>
          )}

          {/* Footer with close button */}
          <div className="px-5 py-3 border-t border-zinc-700 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 transition-colors duration-150"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

WeatherAlertModal.displayName = "WeatherAlertModal";

export default WeatherAlertModal;

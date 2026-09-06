/**
 * SpotAlertToast — In-app toast notification for DX spot alerts.
 *
 * Named SpotAlertToast to avoid conflict with the existing solar AlertToast.
 * Renders as a portal in document.body at bottom-right.
 *
 * Features:
 * - Color-coded by priority (red = new DXCC, orange = rare, blue = standard)
 * - Auto-dismiss after 8 seconds
 * - Stacking: up to 3 visible, older fade out
 * - Explicit tune button stages frequency and mode when the rig is ready
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { AlertMatch } from "@/lib/alerts/alertEngine";
import { TuneButton } from "@/components/radio/TuneButton";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Auto-dismiss duration in milliseconds */
const AUTO_DISMISS_MS = 8000;

/** Maximum visible toasts at once */
const MAX_VISIBLE_TOASTS = 3;

/** Exit animation duration */
const EXIT_ANIMATION_MS = 300;

// ─── Types ──────────────────────────────────────────────────────────────────

type AlertPriorityLevel = "critical" | "rare" | "standard";

export interface SpotAlertToastContainerProps {
  /** Alert matches to display */
  alerts: AlertMatch[];
  /** Callback when an alert is dismissed */
  onDismiss: (index: number) => void;
}

export interface SpotAlertToastItemProps {
  /** The alert match to display */
  match: AlertMatch;
  /** Stack index (0 = topmost) */
  index: number;
  /** Callback when dismissed */
  onDismiss: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Determine alert priority level based on matched fields.
 * - critical: new DXCC entity or entity pattern match
 * - rare: callsign pattern match (user explicitly watching)
 * - standard: band/mode/SNR-only matches
 */
function getAlertPriority(match: AlertMatch): AlertPriorityLevel {
  const fields = match.matchedFields;
  if (fields.includes("entityPattern") || fields.includes("continents")) {
    return "critical";
  }
  if (fields.includes("callsignPattern")) {
    return "rare";
  }
  return "standard";
}

/** Color scheme per priority */
const PRIORITY_COLORS: Record<
  AlertPriorityLevel,
  { border: string; bg: string; accent: string; ring: string }
> = {
  critical: {
    border: "border-alert-red",
    bg: "bg-alert-red/10",
    accent: "text-alert-red",
    ring: "ring-alert-red/30",
  },
  rare: {
    border: "border-plasma-orange",
    bg: "bg-plasma-orange/10",
    accent: "text-plasma-orange",
    ring: "ring-plasma-orange/30",
  },
  standard: {
    border: "border-nebula-blue",
    bg: "bg-nebula-blue/10",
    accent: "text-nebula-blue",
    ring: "ring-nebula-blue/30",
  },
};

// ─── Single Toast Item ──────────────────────────────────────────────────────

const SpotAlertToastItem: React.FC<SpotAlertToastItemProps> = ({
  match,
  index,
  onDismiss,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [isEntered, setIsEntered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const priority = getAlertPriority(match);
  const colors = PRIORITY_COLORS[priority];
  const { spot, rule } = match;

  // Entry animation
  useEffect(() => {
    const timer = setTimeout(() => setIsEntered(true), index * 80);
    return () => clearTimeout(timer);
  }, [index]);

  // Auto-dismiss timer
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onDismiss, EXIT_ANIMATION_MS);
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  // Pause timer on hover
  const handleMouseEnter = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Resume timer on mouse leave
  const handleMouseLeave = useCallback(() => {
    timerRef.current = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onDismiss, EXIT_ANIMATION_MS);
    }, AUTO_DISMISS_MS);
  }, [onDismiss]);

  // Manual dismiss
  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsExiting(true);
      setTimeout(onDismiss, EXIT_ANIMATION_MS);
    },
    [onDismiss],
  );

  const freq = spot.frequency.toFixed(1);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live="polite"
      className={`
        w-80
        ${colors.bg} backdrop-blur-md
        border ${colors.border} border-l-4 rounded-lg
        shadow-lg shadow-black/40
        ring-1 ${colors.ring}
        transform transition-all duration-300 ease-out
        ${
          isExiting
            ? "translate-x-full opacity-0"
            : isEntered
              ? "translate-x-0 opacity-100"
              : "translate-x-full opacity-0"
        }
        hover:scale-[1.02] hover:shadow-xl
      `}
      style={{ marginBottom: 8 }}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          {/* Callsign + frequency */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-mono font-bold ${colors.accent}`}>
                {spot.callsign}
              </span>
              {priority === "critical" && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-alert-red/20 text-alert-red animate-pulse">
                  NEW DXCC
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-mono text-gray-200">
                {freq} kHz
              </span>
              <span className="text-xs text-gray-500">|</span>
              <span className="text-xs font-mono text-gray-300">
                {spot.band}
              </span>
              <span className="text-xs text-gray-500">|</span>
              <span className="text-xs font-mono text-gray-300">
                {spot.mode}
              </span>
              {spot.snr !== undefined && (
                <>
                  <span className="text-xs text-gray-500">|</span>
                  <span className="text-xs font-mono text-gray-300">
                    SNR {spot.snr}
                  </span>
                </>
              )}
            </div>

            <p className="text-[11px] text-gray-400 mt-1 truncate">
              Rule: {rule.name}
            </p>
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
            aria-label="Dismiss spot alert"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div className="mt-1.5">
          <TuneButton frequencyKHz={spot.frequency} mode={spot.mode} />
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="h-0.5 bg-gray-800 rounded-b-lg overflow-hidden">
        <div
          className={`h-full ${
            priority === "critical"
              ? "bg-alert-red"
              : priority === "rare"
                ? "bg-plasma-orange"
                : "bg-nebula-blue"
          }`}
          style={{
            width: "100%",
            animation: `spot-toast-progress ${AUTO_DISMISS_MS}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
};

// ─── Toast Container ────────────────────────────────────────────────────────

export const SpotAlertToastContainer: React.FC<
  SpotAlertToastContainerProps
> = ({ alerts, onDismiss }) => {
  // Only show the most recent MAX_VISIBLE_TOASTS
  const visibleAlerts = alerts.slice(0, MAX_VISIBLE_TOASTS);

  if (visibleAlerts.length === 0) return null;

  const container = (
    <div
      className="fixed bottom-4 right-4 z-[9998] flex flex-col-reverse"
      aria-label="Spot alert notifications"
    >
      {visibleAlerts.map((match, i) => (
        <SpotAlertToastItem
          key={`${match.spot.callsign}-${match.matchedAt}-${i}`}
          match={match}
          index={i}
          onDismiss={() => onDismiss(i)}
        />
      ))}
    </div>
  );

  return createPortal(container, document.body);
};

SpotAlertToastContainer.displayName = "SpotAlertToastContainer";

export default SpotAlertToastContainer;

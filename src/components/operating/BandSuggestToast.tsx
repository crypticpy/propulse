/**
 * BandSuggestToast — toast notification for detected band openings
 *
 * Subscribes to the shared BandOpeningDetector singleton and displays a
 * bottom-center toast whenever a band opening is detected on a band other
 * than the user's currently active band. Allows one-tap switching.
 *
 * - Max 1 toast at a time (new openings replace old)
 * - Auto-dismiss after 8 seconds
 * - Animate slide-up + fade in/out
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useOperatingStore } from "@/stores/operatingStore";
import { getBandOpeningDetector } from "@/lib/services/bandOpeningService";
import {
  formatBandOpeningMessage,
  type BandOpening,
} from "@/lib/services/bandOpeningDetector";
import { BAND_COLORS } from "@/lib/utils/spotColors";
import type { BandId } from "@/types/user";

// All valid BandId values for runtime type-guard
const VALID_BANDS: ReadonlySet<string> = new Set<string>([
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
  "6m",
  "2m",
  "70cm",
]);

/** Auto-dismiss delay in ms */
const AUTO_DISMISS_MS = 8_000;
/** Fade-out animation duration in ms */
const FADE_OUT_MS = 300;

interface ToastData {
  band: string;
  message: string;
}

export function BandSuggestToast() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const activeBand = useOperatingStore((s) => s.activeBand);

  // Dismiss handler — starts fade-out then clears state
  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(() => setToast(null), FADE_OUT_MS);
  }, []);

  // Show a toast for a given band opening
  const showToast = useCallback(
    (band: string, message: string) => {
      // Don't suggest the band the user is already on
      if (band === useOperatingStore.getState().activeBand) return;

      clearTimeout(timerRef.current);
      setToast({ band, message });
      setVisible(true);

      timerRef.current = setTimeout(() => {
        setVisible(false);
        setTimeout(() => setToast(null), FADE_OUT_MS);
      }, AUTO_DISMISS_MS);
    },
    [
      /* stable — reads store imperatively */
    ],
  );

  // Switch to the suggested band
  const handleSwitch = useCallback(() => {
    if (!toast) return;
    // Only call setManualBand if the band string is a valid BandId
    if (VALID_BANDS.has(toast.band)) {
      useOperatingStore.getState().setManualBand(toast.band as BandId);
    }
    dismiss();
  }, [toast, dismiss]);

  // Subscribe to the BandOpeningDetector singleton
  useEffect(() => {
    const detector = getBandOpeningDetector();

    const unsubscribe = detector.subscribe((opening: BandOpening) => {
      const message = formatBandOpeningMessage(opening);
      showToast(opening.band, message);
    });

    return () => {
      unsubscribe();
      clearTimeout(timerRef.current);
    };
  }, [showToast]);

  // If the active band changes to match the toast band, auto-dismiss
  useEffect(() => {
    if (toast && toast.band === activeBand) {
      dismiss();
    }
  }, [activeBand, toast, dismiss]);

  if (!toast) return null;

  const bandColor = BAND_COLORS[toast.band] ?? BAND_COLORS.default;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3 bg-void-black/95 border border-white/10 rounded-xl shadow-2xl backdrop-blur-md max-w-sm">
        {/* Band color indicator bar */}
        <div
          className="w-2 h-8 rounded-full flex-shrink-0"
          style={{ backgroundColor: bandColor }}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white">
            <span style={{ color: bandColor }} className="font-bold font-mono">
              {toast.band}
            </span>{" "}
            just opened
          </div>
          <div className="text-[10px] text-gray-400 truncate">
            {toast.message}
          </div>
        </div>

        {/* Switch button */}
        <button
          onClick={handleSwitch}
          className="px-3 py-1.5 rounded-lg bg-signal-green/20 text-signal-green text-xs font-medium hover:bg-signal-green/30 transition-colors flex-shrink-0"
        >
          Switch
        </button>

        {/* Dismiss button */}
        <button
          onClick={dismiss}
          className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
          aria-label="Dismiss"
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
    </div>
  );
}

/**
 * QSOSuccessToast — Brief confirmation toast after logging a QSO.
 *
 * Auto-dismisses after 3 seconds. Uses createPortal for overlay rendering.
 * Shows callsign logged and running total count.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";

export interface QSOSuccessToastProps {
  visible: boolean;
  callsign: string;
  totalCount?: number;
  onDismiss: () => void;
}

export function QSOSuccessToast({
  visible,
  callsign,
  totalCount,
  onDismiss,
}: QSOSuccessToastProps) {
  // Auto-dismiss after 3 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="
        fixed bottom-6 left-1/2 -translate-x-1/2 z-[500]
        flex items-center gap-2.5 px-4 py-3
        bg-signal-green/20 border border-signal-green/30 rounded-xl
        backdrop-blur-md shadow-lg
        animate-in slide-in-from-bottom-4 fade-in duration-200
      "
      role="status"
      aria-live="polite"
      aria-label={`QSO logged: ${callsign}`}
    >
      {/* Check icon */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        className="text-signal-green shrink-0"
        aria-hidden="true"
      >
        <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5.5 9L8 11.5L12.5 6.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="text-sm">
        <span className="text-signal-green font-medium">Logged </span>
        <span className="text-white font-mono font-bold">{callsign}</span>
        {totalCount != null && totalCount > 0 && (
          <span className="text-gray-400 ml-2">({totalCount} total)</span>
        )}
      </div>

      {/* Dismiss */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="
          ml-2 w-5 h-5 flex items-center justify-center
          rounded text-gray-400 hover:text-white
          transition-colors
        "
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 1L9 9M1 9L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>,
    document.body,
  );
}

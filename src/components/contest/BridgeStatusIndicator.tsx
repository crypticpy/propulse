/**
 * BridgeStatusIndicator - Compact bridge connection status indicator
 *
 * Shows connection state with a colored dot and optional tooltip/popover
 * with connection details. Designed to be compact for contest toolbar use.
 */

import { useState, useRef, useEffect } from "react";
import type { BridgeConnectionState } from "@/types/bridge";

export interface BridgeStatusIndicatorProps {
  /** Current connection state */
  state: BridgeConnectionState;
  /** Connection error message if any */
  error?: string | null;
  /** Number of reconnection attempts */
  reconnectCount?: number;
  /** WebSocket URL being connected to */
  url?: string;
  /** Additional CSS classes */
  className?: string;
  /** Show label text next to indicator */
  showLabel?: boolean;
  /** Callback when indicator is clicked */
  onClick?: () => void;
}

/**
 * Get status color classes based on connection state
 */
function getStatusColors(state: BridgeConnectionState): {
  dot: string;
  text: string;
  bg: string;
  border: string;
} {
  switch (state) {
    case "connected":
      return {
        dot: "bg-signal-green",
        text: "text-signal-green",
        bg: "bg-signal-green/10",
        border: "border-signal-green/30",
      };
    case "connecting":
      return {
        dot: "bg-plasma-orange",
        text: "text-plasma-orange",
        bg: "bg-plasma-orange/10",
        border: "border-plasma-orange/30",
      };
    case "disconnected":
      return {
        dot: "bg-gray-500",
        text: "text-gray-500",
        bg: "bg-gray-500/10",
        border: "border-gray-500/30",
      };
    case "error":
      return {
        dot: "bg-alert-red",
        text: "text-alert-red",
        bg: "bg-alert-red/10",
        border: "border-alert-red/30",
      };
  }
}

/**
 * Get human-readable status label
 */
function getStatusLabel(state: BridgeConnectionState): string {
  switch (state) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting...";
    case "disconnected":
      return "Offline";
    case "error":
      return "Error";
  }
}

/**
 * Compact bridge connection status indicator
 *
 * @example
 * ```tsx
 * const { state, error, reconnectCount } = useBridge();
 *
 * <BridgeStatusIndicator
 *   state={state}
 *   error={error}
 *   reconnectCount={reconnectCount}
 * />
 * ```
 */
export function BridgeStatusIndicator({
  state,
  error,
  reconnectCount = 0,
  url = "ws://127.0.0.1:9867",
  className = "",
  showLabel = false,
  onClick,
}: BridgeStatusIndicatorProps) {
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const colors = getStatusColors(state);
  const label = getStatusLabel(state);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        triggerRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setShowPopover(false);
      }
    }

    if (showPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showPopover]);

  // Close popover on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowPopover(false);
      }
    }

    if (showPopover) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [showPopover]);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setShowPopover(!showPopover);
    }
  };

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        onClick={handleClick}
        className={`
          inline-flex items-center gap-1.5 px-2 py-1 rounded
          border transition-colors cursor-pointer
          ${colors.bg} ${colors.border}
          hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-white/20
        `}
        title={`Bridge: ${label}`}
        aria-label={`Bridge connection status: ${label}`}
        aria-expanded={showPopover}
        type="button"
      >
        {/* Status dot */}
        <span
          className={`
            w-2 h-2 rounded-full
            ${colors.dot}
            ${state === "connecting" ? "animate-pulse" : ""}
            ${state === "connected" ? "shadow-[0_0_6px_currentColor]" : ""}
          `}
          aria-hidden="true"
        />

        {/* Optional label */}
        {showLabel && (
          <span className={`text-xs font-medium ${colors.text}`}>{label}</span>
        )}
      </button>

      {/* Popover with connection details */}
      {showPopover && (
        <div
          ref={popoverRef}
          className={`
            absolute top-full left-0 mt-1 z-50
            min-w-[200px] p-3 rounded-lg
            bg-deep-space/95 backdrop-blur-md
            border border-white/10 shadow-lg
          `}
          role="dialog"
          aria-label="Bridge connection details"
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
            <span
              className={`w-2.5 h-2.5 rounded-full ${colors.dot}`}
              aria-hidden="true"
            />
            <span className={`font-medium ${colors.text}`}>{label}</span>
          </div>

          {/* Details */}
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Bridge URL</span>
              <span className="text-gray-300 font-mono text-[10px]">
                {url.replace("ws://", "")}
              </span>
            </div>

            {state === "connecting" && reconnectCount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Reconnect attempt</span>
                <span className="text-plasma-orange font-mono">
                  {reconnectCount}
                </span>
              </div>
            )}

            {error && (
              <div className="mt-2 p-2 rounded bg-alert-red/10 border border-alert-red/30">
                <span className="text-alert-red text-[10px]">{error}</span>
              </div>
            )}

            {state === "disconnected" && (
              <div className="mt-2 text-gray-500 text-[10px]">
                Bridge is offline. The app will continue to work without rig
                control.
              </div>
            )}

            {state === "connected" && (
              <div className="mt-2 text-signal-green/70 text-[10px]">
                Rig control active
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BridgeStatusIndicator;

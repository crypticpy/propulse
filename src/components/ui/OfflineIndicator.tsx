import { useState, useEffect, useRef } from "react";

interface OfflineIndicatorProps {
  /** Additional CSS classes. When provided, replaces the default fixed positioning. */
  className?: string;
  /** Number of QSOs waiting to sync (optional, shown when > 0) */
  pendingSyncCount?: number;
}

/**
 * OfflineIndicator - Thin banner shown when the browser loses network connectivity.
 *
 * Listens to `online`/`offline` window events and displays an alert-red banner
 * with offline duration and pending sync count.
 * Auto-hides when connectivity returns (brief green "Reconnected" flash).
 *
 * Pass `className` to override the default fixed-position styling (e.g., for
 * flow-positioned usage inside MobileLayout).
 */
export function OfflineIndicator({
  className,
  pendingSyncCount,
}: OfflineIndicatorProps) {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [showReconnected, setShowReconnected] = useState(false);
  const [offlineDuration, setOfflineDuration] = useState(0);
  const offlineSinceRef = useRef<number | null>(
    typeof navigator !== "undefined" && !navigator.onLine ? Date.now() : null,
  );
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Track offline duration with a 1-second interval
  useEffect(() => {
    if (isOffline) {
      if (!offlineSinceRef.current) {
        offlineSinceRef.current = Date.now();
      }
      setOfflineDuration(0);
      timerRef.current = setInterval(() => {
        if (offlineSinceRef.current) {
          setOfflineDuration(
            Math.floor((Date.now() - offlineSinceRef.current) / 1000),
          );
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      offlineSinceRef.current = null;
      setOfflineDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOffline]);

  useEffect(() => {
    const handleOffline = () => {
      setShowReconnected(false);
      setIsOffline(true);
    };
    const handleOnline = () => {
      setIsOffline(false);
      // Flash "Reconnected" briefly
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  // Reconnected flash
  if (showReconnected && !isOffline) {
    const reconnectedClasses = className
      ? className
      : "fixed top-0 left-0 right-0 z-50 bg-signal-green/90 text-void-black text-xs py-1 text-center font-medium";
    return (
      <div className={reconnectedClasses} role="status">
        {className ? "Online" : "Reconnected \u2014 syncing changes..."}
      </div>
    );
  }

  if (!isOffline) {
    return null;
  }

  // Format duration
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h ${remainMins}m`;
  };

  const defaultClasses =
    "fixed top-0 left-0 right-0 z-50 bg-alert-red/20 text-alert-red text-xs py-1.5 text-center font-medium border-b border-alert-red/30 backdrop-blur-sm";

  const hasPending = pendingSyncCount != null && pendingSyncCount > 0;

  return (
    <div className={className ?? defaultClasses} role="alert">
      {className ? (
        "Offline"
      ) : (
        <span className="inline-flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M3.707 2.293a1 1 0 00-1.414 1.414l6.921 6.922c.05.062.105.118.168.167l6.91 6.911a1 1 0 001.415-1.414l-.675-.675A9.971 9.971 0 0020 10h-2a7.972 7.972 0 01-1.607 4.808l-1.449-1.45A5.972 5.972 0 0016 10h-2c0 .99-.29 1.911-.778 2.687l-1.473-1.473A3.97 3.97 0 0012 10H10c0 .414-.064.812-.181 1.186L3.707 2.293z"
              clipRule="evenodd"
            />
            <path d="M10 2a8 8 0 00-4 14.9l1.5-1.5A6 6 0 014 10h2a4 4 0 011.5-3.12L6.1 5.47A6 6 0 014 10" />
          </svg>
          <span>Offline</span>
          {offlineDuration > 0 && (
            <span className="opacity-70">
              ({formatDuration(offlineDuration)})
            </span>
          )}
          {hasPending && (
            <span className="rounded-full bg-alert-red/30 px-1.5 py-0 text-[10px]">
              {pendingSyncCount} pending
            </span>
          )}
        </span>
      )}
    </div>
  );
}

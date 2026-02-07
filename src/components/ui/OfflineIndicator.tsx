import { useState, useEffect } from "react";

interface OfflineIndicatorProps {
  /** Additional CSS classes. When provided, replaces the default fixed positioning. */
  className?: string;
}

/**
 * OfflineIndicator - Thin banner shown when the browser loses network connectivity.
 *
 * Listens to `online`/`offline` window events and displays an amber banner.
 * Auto-hides when connectivity returns.
 *
 * Pass `className` to override the default fixed-position styling (e.g., for
 * flow-positioned usage inside MobileLayout).
 */
export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  const defaultClasses =
    "fixed top-0 left-0 right-0 z-50 bg-caution-amber/90 text-void-black text-xs py-1 text-center font-medium";

  return (
    <div className={className ?? defaultClasses} role="alert">
      {className
        ? "Offline"
        : "You are offline \u2014 some features may be unavailable"}
    </div>
  );
}

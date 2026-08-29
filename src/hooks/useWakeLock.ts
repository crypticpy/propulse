import { useEffect } from "react";

/**
 * useWakeLock - keep the screen awake while `enabled` is true.
 *
 * Uses the Screen Wake Lock API (universal in evergreen browsers since 2025).
 * The lock is silently released by the browser whenever the tab is hidden,
 * so it is re-acquired on visibilitychange. No-ops where unsupported.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (disposed) {
          void sentinel.release();
          sentinel = null;
        }
      } catch {
        // Denied (low battery, permissions policy) — nothing to do.
        sentinel = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release();
      sentinel = null;
    };
  }, [enabled]);
}

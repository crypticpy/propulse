import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * PWAUpdatePrompt - Shows a toast when a new service worker is available.
 *
 * Uses `registerType: 'prompt'` so the user explicitly opts in to reload.
 */
export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Check for updates every 60 minutes
      if (registration) {
        setInterval(
          () => {
            registration.update();
          },
          60 * 60 * 1000,
        );
      }
    },
    onRegisterError(error) {
      console.error("SW registration error:", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 rounded-lg border border-white/10 bg-void-black/95 px-4 py-3 shadow-lg backdrop-blur-sm">
      <span className="text-sm text-gray-200">A new version is available</span>

      <button
        onClick={() => updateServiceWorker(true)}
        className="rounded-md bg-signal-green/90 px-3 py-1 text-xs font-semibold text-void-black transition-colors hover:bg-signal-green"
      >
        Reload
      </button>

      <button
        onClick={() => setNeedRefresh(false)}
        className="rounded-md border border-white/10 px-3 py-1 text-xs text-gray-400 transition-colors hover:text-gray-200"
      >
        Dismiss
      </button>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";

/**
 * BeforeInstallPromptEvent - Browser event fired when the app is installable.
 * Not yet in standard TS DOM typings.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

/**
 * PWAInstallPrompt - Dismissible install banner when the app is installable.
 *
 * - Captures the beforeinstallprompt event
 * - Session-only dismiss (no localStorage nag)
 * - Auto-hides after successful installation
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => setDeferredPrompt(null);

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (!deferredPrompt || dismissed) return null;

  return (
    <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px)+8px)] left-3 right-3 z-[9998] flex items-center gap-3 rounded-xl border border-plasma-orange/30 bg-deep-space/90 px-4 py-3 shadow-lg shadow-plasma-orange/10 backdrop-blur-md">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-plasma-orange/15">
        <svg
          className="h-5 w-5 text-plasma-orange"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100">Install Propulse</p>
        <p className="text-xs text-gray-400 truncate">
          Add to home screen for quick access
        </p>
      </div>
      <button
        onClick={handleInstall}
        className="flex-shrink-0 rounded-lg bg-plasma-orange/90 px-3.5 py-1.5 text-xs font-semibold text-void-black transition-colors hover:bg-plasma-orange"
      >
        Install
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 p-1 text-gray-500 transition-colors hover:text-gray-300"
        aria-label="Dismiss install prompt"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18 18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

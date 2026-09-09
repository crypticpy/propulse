const RECOVERY_STORAGE_KEY = "propulse:stale-chunk-recovery-at";
const RECOVERY_QUERY_PARAM = "_pwa_recover";
const RECOVERY_WINDOW_MS = 60_000;

function readLastRecovery(): number {
  try {
    return Number(window.sessionStorage.getItem(RECOVERY_STORAGE_KEY) ?? 0);
  } catch {
    return 0;
  }
}

function markRecovery(now: number): void {
  try {
    window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(now));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

async function clearStaleAppShell(): Promise<void> {
  const cleanup: Promise<unknown>[] = [];

  if ("serviceWorker" in navigator) {
    cleanup.push(
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.allSettled(registrations.map((registration) => registration.unregister())),
        ),
    );
  }

  if ("caches" in window) {
    cleanup.push(
      window.caches
        .keys()
        .then((names) => Promise.allSettled(names.map((name) => window.caches.delete(name)))),
    );
  }

  await Promise.allSettled(cleanup);
}

function removeRecoveryQueryParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(RECOVERY_QUERY_PARAM)) return;

  url.searchParams.delete(RECOVERY_QUERY_PARAM);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function installStaleChunkRecovery(): void {
  removeRecoveryQueryParam();

  // Deliberately does not call event.preventDefault(). Vite's preload helper
  // re-throws the load failure only while the default is not prevented:
  //
  //   window.dispatchEvent(e);
  //   if (!e.defaultPrevented) throw err;
  //
  // Preventing it makes the failed dynamic import *resolve with `undefined`*
  // instead of rejecting, so the app's standard lazy idiom —
  // `import("…").then((m) => ({ default: m.Thing }))` — reads a property off
  // undefined and reports "Cannot read properties of undefined (reading
  // 'Thing')" from whichever chunk happened to fail. Letting it reject keeps
  // the real error, which React.lazy and the error boundary already handle.
  window.addEventListener("vite:preloadError", () => {
    const now = Date.now();
    if (now - readLastRecovery() < RECOVERY_WINDOW_MS) {
      console.error(
        "A deployed application chunk is still unavailable after recovery. Reload suppressed.",
      );
      return;
    }

    markRecovery(now);

    void clearStaleAppShell().finally(() => {
      const url = new URL(window.location.href);
      url.searchParams.set(RECOVERY_QUERY_PARAM, String(now));
      window.location.replace(url.toString());
    });
  });
}

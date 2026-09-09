const RECOVERY_STORAGE_KEY = "propulse:stale-chunk-recovery-at";
const RECOVERY_QUERY_PARAM = "_pwa_recover";
const RECOVERY_WINDOW_MS = 60_000;
const MAX_RECOVERY_ATTEMPTS = 2;

interface RecoveryRecord {
  at: number;
  attempts: number;
}

function readRecoveryRecord(): RecoveryRecord {
  try {
    const raw = window.sessionStorage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return { at: 0, attempts: 0 };
    const parsed = JSON.parse(raw) as Partial<RecoveryRecord>;
    return { at: Number(parsed.at) || 0, attempts: Number(parsed.attempts) || 0 };
  } catch {
    return { at: 0, attempts: 0 };
  }
}

function writeRecoveryRecord(record: RecoveryRecord): void {
  try {
    window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify(record));
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

/**
 * The shared recovery action: drop the stale service worker + HTTP caches,
 * then navigate. Used by the automatic `vite:preloadError` handler below and
 * by the ErrorBoundary's manual "Reload" button, so a user click gets the
 * same cache-clearing behavior as the automatic path instead of re-hitting
 * the same stale shell with a bare `location.reload()`.
 */
export function recoverFromStaleChunk(): void {
  void clearStaleAppShell().finally(() => {
    const url = new URL(window.location.href);
    url.searchParams.set(RECOVERY_QUERY_PARAM, String(Date.now()));
    window.location.replace(url.toString());
  });
}

export function installStaleChunkRecovery(): () => void {
  // Deliberately does NOT clear the attempt counter when the app boots after a
  // recovery navigation. Booting only proves the app *shell* loaded; the lazy
  // chunk that failed is fetched later, so treating boot as success resets the
  // counter before a second attempt can ever be counted and the cap below can
  // never trip. The rolling `RECOVERY_WINDOW_MS` is the reset: 60 s without a
  // preload error means recovery worked.
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
  const handlePreloadError = () => {
    const now = Date.now();
    const record = readRecoveryRecord();
    const withinWindow = now - record.at < RECOVERY_WINDOW_MS;

    if (withinWindow && record.attempts >= MAX_RECOVERY_ATTEMPTS) {
      console.error(
        "A deployed application chunk is still unavailable after recovery. Reload suppressed.",
      );
      return;
    }

    writeRecoveryRecord({ at: now, attempts: withinWindow ? record.attempts + 1 : 1 });
    recoverFromStaleChunk();
  };

  window.addEventListener("vite:preloadError", handlePreloadError);
  return () => window.removeEventListener("vite:preloadError", handlePreloadError);
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installStaleChunkRecovery } from "./staleChunkRecovery";

const STORAGE_KEY = "propulse:stale-chunk-recovery-at";

/**
 * Mirrors Vite's build-time preload helper: the failure is only re-thrown while
 * the event's default has not been prevented.
 */
function dispatchPreloadError(): { defaultPrevented: boolean } {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return { defaultPrevented: event.defaultPrevented };
}

// The recovery navigation runs after clearStaleAppShell's cache/service-worker
// cleanup promise settles, so tests that assert on `location.replace` need to
// let that microtask queue drain first.
async function flushRecovery(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("installStaleChunkRecovery", () => {
  let uninstall: (() => void) | undefined;
  let locationReplace: ReturnType<typeof vi.fn>;
  const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location");

  // jsdom's `location.replace` is a non-configurable own property, so it can't
  // be spied on directly (`Cannot redefine property: replace`). Swap the whole
  // `window.location` accessor for a stub instead; `href` stays mutable so
  // `removeRecoveryQueryParam`/`recoverFromStaleChunk`'s `new URL(...)` calls
  // keep working.
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});

    locationReplace = vi.fn();
    let href = window.location.href;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        get href() {
          return href;
        },
        set href(value: string) {
          href = value;
        },
        replace: locationReplace,
      },
    });
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    if (originalLocationDescriptor) {
      Object.defineProperty(window, "location", originalLocationDescriptor);
    }
    vi.restoreAllMocks();
  });

  it("leaves the preload failure throwable so the import rejects instead of resolving undefined", async () => {
    uninstall = installStaleChunkRecovery();

    // Preventing the default would make Vite's helper skip `throw err`, and the
    // dynamic import would fulfil with `undefined` — every lazy component in the
    // app then fails as "Cannot read properties of undefined".
    expect(dispatchPreloadError().defaultPrevented).toBe(false);
    await flushRecovery();
  });

  it("still leaves it throwable when recovery is suppressed inside the retry window", async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ at: Date.now(), attempts: 2 }),
    );
    uninstall = installStaleChunkRecovery();

    expect(dispatchPreloadError().defaultPrevented).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "A deployed application chunk is still unavailable after recovery. Reload suppressed.",
    );
    await flushRecovery();
  });

  it("allows up to two recovery attempts inside the window before suppressing further ones", async () => {
    uninstall = installStaleChunkRecovery();

    dispatchPreloadError();
    await flushRecovery();
    expect(locationReplace).toHaveBeenCalledTimes(1);

    dispatchPreloadError();
    await flushRecovery();
    expect(locationReplace).toHaveBeenCalledTimes(2);
  });

  it("does not navigate once the attempt cap inside the window is reached", async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ at: Date.now(), attempts: 2 }),
    );
    uninstall = installStaleChunkRecovery();

    dispatchPreloadError();
    await flushRecovery();

    expect(locationReplace).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "A deployed application chunk is still unavailable after recovery. Reload suppressed.",
    );
  });

  it("stops listening once the installer's teardown is called", () => {
    uninstall = installStaleChunkRecovery();
    uninstall();
    uninstall = undefined;

    dispatchPreloadError();

    expect(locationReplace).not.toHaveBeenCalled();
  });

  it("clears the attempt counter once the app boots after a recovery navigation", async () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ at: Date.now(), attempts: 2 }),
    );

    const url = new URL(window.location.href);
    url.searchParams.set("_pwa_recover", "123");
    window.location.href = url.toString();

    uninstall = installStaleChunkRecovery();

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    // With the counter cleared, a fresh failure should be allowed to navigate
    // again instead of staying suppressed from the prior window.
    dispatchPreloadError();
    await flushRecovery();
    expect(locationReplace).toHaveBeenCalledTimes(1);
  });
});

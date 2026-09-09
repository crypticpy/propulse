import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installStaleChunkRecovery } from "./staleChunkRecovery";

/**
 * Mirrors Vite's build-time preload helper: the failure is only re-thrown while
 * the event's default has not been prevented.
 */
function dispatchPreloadError(): { defaultPrevented: boolean } {
  const event = new Event("vite:preloadError", { cancelable: true });
  window.dispatchEvent(event);
  return { defaultPrevented: event.defaultPrevented };
}

describe("installStaleChunkRecovery", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves the preload failure throwable so the import rejects instead of resolving undefined", () => {
    installStaleChunkRecovery();

    // Preventing the default would make Vite's helper skip `throw err`, and the
    // dynamic import would fulfil with `undefined` — every lazy component in the
    // app then fails as "Cannot read properties of undefined".
    expect(dispatchPreloadError().defaultPrevented).toBe(false);
  });

  it("still leaves it throwable when recovery is suppressed inside the retry window", () => {
    window.sessionStorage.setItem("propulse:stale-chunk-recovery-at", String(Date.now()));
    installStaleChunkRecovery();

    expect(dispatchPreloadError().defaultPrevented).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "A deployed application chunk is still unavailable after recovery. Reload suppressed.",
    );
  });
});

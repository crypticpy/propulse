import "fake-indexeddb/auto";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Node 26 exposes an experimental `localStorage` global whose value is
 * undefined unless the process receives `--localstorage-file`. That property
 * shadows jsdom's working implementation inside Vitest workers, causing every
 * persisted-store test to fail before application code runs. Install the small
 * standards-shaped memory store tests need; production still uses the real
 * browser Storage implementation.
 */
function createTestStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(String(key)),
    setItem: (key, value) => values.set(String(key), String(value)),
  };
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: createTestStorage(),
});

/**
 * jsdom does not implement `Element.scrollIntoView`. Builder tests that
 * expand a chain fire AllChainsView's 100ms scroll timer after the case
 * finishes; the missing method becomes an unhandled exception and fails
 * pre-push even when every assertion passed.
 */
if (
  typeof Element !== "undefined" &&
  typeof Element.prototype.scrollIntoView !== "function"
) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

/**
 * jsdom does not implement the `CSS` namespace object, so `CSS.escape` is
 * missing. user-event's native radio-group arrow-key walk calls it to build a
 * `input[type="radio"][name="…"]` selector, and throws without it — which makes
 * every keyboard test against a native radio group unrunnable. React's `useId`
 * produces names containing `:`, so a real escape is needed, not identity.
 */
const cssNamespace = (globalThis as { CSS?: { escape?: unknown } }).CSS;
if (typeof cssNamespace?.escape !== "function") {
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: {
      escape: (value: string) => {
        const escaped = String(value).replace(
          /[^a-zA-Z0-9_\u00a0-\uffff-]/g,
          (character) => `\\${character}`,
        );
        return /^\d/.test(escaped)
          ? `\\3${escaped[0]} ${escaped.slice(1)}`
          : escaped;
      },
    },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

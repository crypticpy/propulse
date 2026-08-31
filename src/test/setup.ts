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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

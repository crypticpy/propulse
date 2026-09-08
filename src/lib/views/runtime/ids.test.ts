import { afterEach, describe, expect, it } from "vitest";
import { getAnonymousInstallId, ownerNamespace, resetAnonymousInstallIdForTests } from "./ids";

const INSTALL_KEY = "propulse-view-install-id";

function memoryStorage(initial?: Record<string, string>): Storage {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(String(key));
    },
    setItem: (key, value) => {
      values.set(String(key), String(value));
    },
  };
}

function throwingStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    clear: () => {
      throw new Error("storage denied");
    },
    getItem: () => {
      throw new Error("storage denied");
    },
    key: () => {
      throw new Error("storage denied");
    },
    removeItem: () => {
      throw new Error("storage denied");
    },
    setItem: () => {
      throw new Error("storage denied");
    },
  };
}

afterEach(() => {
  resetAnonymousInstallIdForTests();
  localStorage.removeItem(INSTALL_KEY);
});

describe("getAnonymousInstallId", () => {
  it("keeps a process-stable fallback when storage is absent", () => {
    const first = getAnonymousInstallId(null);
    const second = getAnonymousInstallId(null);
    expect(first).toBe(second);
    expect(ownerNamespace(null, null)).toBe(`anon:${first}`);
  });

  it("survives throwing reads and writes with one fallback id", () => {
    const first = getAnonymousInstallId(throwingStorage());
    const second = getAnonymousInstallId(throwingStorage());
    expect(first).toBe(second);
    expect(getAnonymousInstallId(null)).toBe(first);
  });

  it("reuses a persisted install id and isolates a second storage instance", () => {
    const stored = memoryStorage({ [INSTALL_KEY]: "install-alpha" });
    expect(getAnonymousInstallId(stored)).toBe("install-alpha");
    resetAnonymousInstallIdForTests();
    const other = memoryStorage();
    const created = getAnonymousInstallId(other);
    expect(created).not.toBe("install-alpha");
    expect(getAnonymousInstallId(other)).toBe(created);
  });
});

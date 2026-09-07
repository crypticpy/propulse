import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureProTileCacheOwner } from "./cacheUtils";

const OWNER_KEY = "propulse-tiles-pro-owner";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ensureProTileCacheOwner", () => {
  it("does nothing on an anonymous load with no prior owner", () => {
    const deleteMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: deleteMock });

    ensureProTileCacheOwner(null);

    expect(deleteMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it("purges the pro tile cache and records the owner on first sign-in", async () => {
    const deleteMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: deleteMock });

    ensureProTileCacheOwner("user-a");
    await Promise.resolve();

    expect(deleteMock).toHaveBeenCalledWith("tiles-pro");
    expect(localStorage.getItem(OWNER_KEY)).toBe("user-a");
  });

  it("does not purge again for the same owner (token refresh, re-renders)", () => {
    localStorage.setItem(OWNER_KEY, "user-a");
    const deleteMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: deleteMock });

    ensureProTileCacheOwner("user-a");

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("purges and re-owns when a different account signs in on the same browser", async () => {
    localStorage.setItem(OWNER_KEY, "user-a");
    const deleteMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: deleteMock });

    ensureProTileCacheOwner("user-b");
    await Promise.resolve();

    expect(deleteMock).toHaveBeenCalledWith("tiles-pro");
    expect(localStorage.getItem(OWNER_KEY)).toBe("user-b");
  });

  it("purges and clears the owner key on sign-out", async () => {
    localStorage.setItem(OWNER_KEY, "user-a");
    const deleteMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: deleteMock });

    ensureProTileCacheOwner(null);
    await Promise.resolve();

    expect(deleteMock).toHaveBeenCalledWith("tiles-pro");
    expect(localStorage.getItem(OWNER_KEY)).toBeNull();
  });

  it("never throws when the Cache API rejects", () => {
    vi.stubGlobal("caches", {
      delete: vi.fn().mockRejectedValue(new Error("nope")),
    });

    expect(() => ensureProTileCacheOwner("user-a")).not.toThrow();
  });

  it("never throws when the Cache API is unavailable", () => {
    vi.stubGlobal("caches", undefined);

    expect(() => ensureProTileCacheOwner("user-a")).not.toThrow();
  });
});

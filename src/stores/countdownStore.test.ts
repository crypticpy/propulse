import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

import { useCountdownStore } from "./countdownStore";

const originalState = useCountdownStore.getState();

describe("countdownStore", () => {
  beforeEach(() => {
    useCountdownStore.setState(originalState, true);
  });

  it("starts with no countdowns", () => {
    expect(useCountdownStore.getState().items).toHaveLength(0);
  });

  it("addCountdown assigns an id and createdAt, and appends the item", () => {
    const target = new Date(Date.now() + 60_000).toISOString();
    const created = useCountdownStore.getState().addCountdown("Field Day", target);

    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Field Day");
    expect(created.targetUtc).toBe(target);
    expect(created.createdAt).toBeTruthy();

    const items = useCountdownStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(created);
  });

  it("removeCountdown removes only the matching item", () => {
    const a = useCountdownStore
      .getState()
      .addCountdown("A", new Date(Date.now() + 60_000).toISOString());
    const b = useCountdownStore
      .getState()
      .addCountdown("B", new Date(Date.now() + 120_000).toISOString());

    useCountdownStore.getState().removeCountdown(a.id);

    const items = useCountdownStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(b.id);
  });

  it("pruneExpired keeps countdowns that ended less than 24h ago", () => {
    const recentlyEnded = new Date(Date.now() - 60_000).toISOString();
    useCountdownStore.getState().addCountdown("Recently ended", recentlyEnded);

    useCountdownStore.getState().pruneExpired();

    expect(useCountdownStore.getState().items).toHaveLength(1);
  });

  it("pruneExpired removes countdowns that ended more than 24h ago", () => {
    const longAgo = new Date(
      Date.now() - 25 * 60 * 60 * 1_000,
    ).toISOString();
    useCountdownStore.getState().addCountdown("Long over", longAgo);
    useCountdownStore
      .getState()
      .addCountdown("Still upcoming", new Date(Date.now() + 60_000).toISOString());

    useCountdownStore.getState().pruneExpired();

    const items = useCountdownStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Still upcoming");
  });
});

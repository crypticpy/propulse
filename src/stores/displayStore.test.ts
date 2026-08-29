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

import { useDisplayStore } from "./displayStore";

const originalState = useDisplayStore.getState();

describe("displayStore", () => {
  beforeEach(() => {
    useDisplayStore.setState(originalState, true);
    localStorage.clear();
  });

  it("starts with no identity and sync inactive", () => {
    const state = useDisplayStore.getState();
    expect(state.displayId).toBeNull();
    expect(state.deviceToken).toBeNull();
    expect(state.pairedName).toBeNull();
    expect(state.syncActive).toBe(false);
  });

  it("setIdentity stores displayId and deviceToken", () => {
    useDisplayStore.getState().setIdentity("display-1", "token-abc");

    const state = useDisplayStore.getState();
    expect(state.displayId).toBe("display-1");
    expect(state.deviceToken).toBe("token-abc");
  });

  it("setPairedName updates the paired name", () => {
    useDisplayStore.getState().setPairedName("Shack wall");
    expect(useDisplayStore.getState().pairedName).toBe("Shack wall");

    useDisplayStore.getState().setPairedName(null);
    expect(useDisplayStore.getState().pairedName).toBeNull();
  });

  it("setSyncActive toggles the sync flag", () => {
    useDisplayStore.getState().setSyncActive(true);
    expect(useDisplayStore.getState().syncActive).toBe(true);

    useDisplayStore.getState().setSyncActive(false);
    expect(useDisplayStore.getState().syncActive).toBe(false);
  });

  it("clearIdentity resets identity, name, and sync flag together", () => {
    useDisplayStore.getState().setIdentity("display-1", "token-abc");
    useDisplayStore.getState().setPairedName("Shack wall");
    useDisplayStore.getState().setSyncActive(true);

    useDisplayStore.getState().clearIdentity();

    const state = useDisplayStore.getState();
    expect(state.displayId).toBeNull();
    expect(state.deviceToken).toBeNull();
    expect(state.pairedName).toBeNull();
    expect(state.syncActive).toBe(false);
  });

  it("persists identity across store instances via localStorage", () => {
    useDisplayStore.getState().setIdentity("display-42", "token-xyz");
    useDisplayStore.getState().setSyncActive(true);

    const raw = localStorage.getItem("propulse-display-device");
    expect(raw).toBeTruthy();

    const persisted = JSON.parse(raw as string);
    expect(persisted.state.displayId).toBe("display-42");
    expect(persisted.state.deviceToken).toBe("token-xyz");
    expect(persisted.state.syncActive).toBe(true);
  });
});

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useRigBridgeSync } from "./useRigBridgeSync";

const mocks = vi.hoisted(() => ({
  bridge: {
    connected: false,
    state: "disconnected",
    lastMessage: null,
    send: vi.fn(),
    sendRequest: vi.fn(),
  },
  useBridge: vi.fn(),
}));
vi.mock("@/hooks/useBridge", () => ({ useBridge: mocks.useBridge }));

describe("useRigBridgeSync transport mirror", () => {
  beforeEach(() => {
    useSettingsStore.setState({ bridgeEnabled: true, catBackend: "disabled" });
    useRigStore.setState({ bridgeConnected: false, connected: false });
    mocks.bridge.connected = false;
    mocks.useBridge.mockImplementation(() => ({ ...mocks.bridge }));
  });

  it("mirrors useBridge.connected into rigStore.bridgeConnected on connect and disconnect", () => {
    const { rerender } = renderHook(() => useRigBridgeSync());
    expect(useRigStore.getState().bridgeConnected).toBe(false);

    mocks.bridge.connected = true;
    act(() => rerender());
    expect(useRigStore.getState().bridgeConnected).toBe(true);

    mocks.bridge.connected = false;
    act(() => rerender());
    expect(useRigStore.getState().bridgeConnected).toBe(false);
  });
});

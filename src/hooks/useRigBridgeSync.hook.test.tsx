import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWSJTXStore } from "@/stores/wsjtxStore";
import type { BridgeConnectionOptions } from "@/types/bridge";
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

    const options = mocks.useBridge.mock.calls.at(-1)![0] as BridgeConnectionOptions;
    act(() => options.onMessage?.({ type: "wsjtx.status", payload: { frequency: 7_074_000, mode: "FT8", txEnabled: false, decoding: true, rxDF: 1200, txDF: 1200 } }));
    expect(useWSJTXStore.getState().connected).toBe(true);
    mocks.bridge.connected = false;
    act(() => rerender());
    expect(useWSJTXStore.getState().connected).toBe(false);
    expect(useWSJTXStore.getState().status).toBeNull();
    expect(useRigStore.getState().bridgeConnected).toBe(false);
  });
});

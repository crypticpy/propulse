import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import type { BridgeMessage } from "@/types/bridge";
import { parseRigUpdatePayload, useRigBridgeSync } from "./useRigBridgeSync";

describe("parseRigUpdatePayload", () => {
  it("passes through connected and status fields when present", () => {
    expect(
      parseRigUpdatePayload({
        connected: true,
        frequency: 14_074_000,
        mode: "USB",
        band: "20m",
        ptt: true,
      }),
    ).toEqual({
      connected: true,
      status: { frequency: 14_074_000, mode: "USB", band: "20m", ptt: true },
    });
  });

  it("propagates the rig's observed ptt state independent of connected/frequency", () => {
    expect(parseRigUpdatePayload({ ptt: true })).toEqual({
      connected: undefined,
      status: { ptt: true },
    });
    expect(parseRigUpdatePayload({ ptt: false })).toEqual({
      connected: undefined,
      status: { ptt: false },
    });
  });

  it("leaves connected undefined and status empty when the payload carries neither", () => {
    expect(parseRigUpdatePayload({})).toEqual({
      connected: undefined,
      status: {},
    });
  });

  it("ignores fields with the wrong type", () => {
    expect(
      parseRigUpdatePayload({
        // @ts-expect-error - exercising runtime guard against malformed payloads
        frequency: "14074000",
        // @ts-expect-error - exercising runtime guard against malformed payloads
        ptt: "true",
      }),
    ).toEqual({ connected: undefined, status: {} });
  });
});


const transport = vi.hoisted(() => ({
  connected: true,
  lastMessage: null as BridgeMessage | null,
  send: vi.fn(),
  sendRequest: vi.fn(),
}));
vi.mock("@/hooks/useBridge", () => ({ useBridge: () => transport }));
const originalRig = useRigStore.getState();
const originalSettings = useSettingsStore.getState();
beforeEach(() => {
  transport.connected = true;
  transport.lastMessage = null;
  transport.send.mockReset();
  transport.sendRequest.mockReset();
  let sequence = 0;
  transport.sendRequest.mockImplementation(() => `request-${++sequence}`);
  useSettingsStore.setState({ bridgeEnabled: true, catBackend: "hamlib" });
  useRigStore.setState({ pendingFrequency: null, pendingMode: null, connected: false });
});
afterEach(() => {
  useRigStore.setState(originalRig);
  useSettingsStore.setState(originalSettings);
});

it("keeps configured CAT visible when the bridge is off", () => {
  transport.connected = false;
  useSettingsStore.setState({ bridgeEnabled: false });
  renderHook(() => useRigBridgeSync());
  expect(useRigStore.getState().catEnabled).toBe(true);
  expect(useRigStore.getState().bridgeConnected).toBe(false);
  expect(transport.sendRequest).not.toHaveBeenCalled();
});

it("sends one combined tune and waits for acknowledgement before the next target", () => {
  const { rerender } = renderHook(() => useRigBridgeSync());
  act(() => useRigStore.setState({ connected: true, pendingFrequency: 7_074_000, pendingMode: "USB" }));
  expect(transport.sendRequest).toHaveBeenLastCalledWith("rig.set", { frequency: 7_074_000, mode: "USB" });
  const before = transport.sendRequest.mock.calls.length;
  act(() => useRigStore.setState({ pendingFrequency: 14_074_000, pendingMode: "USB" }));
  expect(transport.sendRequest.mock.calls).toHaveLength(before);
  transport.lastMessage = { id: "request-2", type: "rig.set.ack", payload: { success: true } };
  rerender();
  expect(transport.sendRequest).toHaveBeenLastCalledWith("rig.set", { frequency: 14_074_000, mode: "USB" });
  transport.lastMessage = { id: "request-3", type: "rig.set.ack", payload: { success: true } };
  rerender();
  expect(useRigStore.getState().pendingFrequency).toBeNull();
  expect(useRigStore.getState().pendingMode).toBeNull();
  expect(transport.sendRequest.mock.calls).toHaveLength(before + 1);
});

it.each(["icom-serial", "icom-network", "hamlib"] as const)("normalizes reverse CW for %s after auto detection", (backend) => {
  useSettingsStore.setState({ catBackend: "auto" });
  const { rerender } = renderHook(() => useRigBridgeSync());
  transport.lastMessage = { id: "request-1", type: "rig.connect.ack", payload: { connected: true, backend } };
  rerender();
  act(() => useRigStore.setState({ pendingFrequency: 7_025_000, pendingMode: "CWR" }));
  expect(transport.sendRequest).toHaveBeenLastCalledWith("rig.set", { frequency: 7_025_000, mode: backend === "hamlib" ? "CWR" : "CW-R" });
});

it("discards staged commands when the transport disconnects", () => {
  const { rerender } = renderHook(() => useRigBridgeSync());
  act(() => useRigStore.setState({ connected: true, pendingFrequency: 7_025_000, pendingMode: "CW" }));
  transport.connected = false;
  rerender();
  expect(useRigStore.getState().pendingFrequency).toBeNull();
  expect(useRigStore.getState().pendingMode).toBeNull();
});

it("sends a frequency-only request without inventing a mode", () => {
  renderHook(() => useRigBridgeSync());
  act(() => useRigStore.setState({ connected: true, pendingFrequency: 435_123_456, pendingMode: null }));
  expect(transport.sendRequest).toHaveBeenLastCalledWith("rig.set", { frequency: 435_123_456 });
});

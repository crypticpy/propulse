import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDXStore } from "@/stores/dxStore";
import { useSharedBridgeSourceOwnership } from "./useDXCluster";

describe("DX cluster shared-source ownership", () => {
  beforeEach(() => {
    useDXStore.setState({ spotSource: "bridge" });
  });

  it("ignores a disabled or never-connected observer beside a live owner", async () => {
    const owner = renderHook(() =>
      useSharedBridgeSourceOwnership(true, true),
    );
    const disabled = renderHook(() =>
      useSharedBridgeSourceOwnership(false, false),
    );
    const connecting = renderHook(() =>
      useSharedBridgeSourceOwnership(true, false),
    );

    await act(async () => Promise.resolve());
    expect(useDXStore.getState().spotSource).toBe("bridge");

    disabled.unmount();
    connecting.unmount();
    owner.unmount();
    await act(async () => Promise.resolve());
  });

  it("demotes only after the final connected observer releases ownership", async () => {
    const first = renderHook(
      ({ connected }) =>
        useSharedBridgeSourceOwnership(true, connected),
      { initialProps: { connected: true } },
    );
    const second = renderHook(
      ({ connected }) =>
        useSharedBridgeSourceOwnership(true, connected),
      { initialProps: { connected: true } },
    );

    first.rerender({ connected: false });
    await act(async () => Promise.resolve());
    expect(useDXStore.getState().spotSource).toBe("bridge");

    second.rerender({ connected: false });
    await act(async () => Promise.resolve());
    expect(useDXStore.getState().spotSource).toBe("rest");

    first.unmount();
    second.unmount();
  });
});

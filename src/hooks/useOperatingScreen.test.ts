import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATING_PROTOCOL_VERSION } from "@/lib/workspace/operatingChannel";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { DEFAULT_WORKSPACE_ID, useWorkspaceStore } from "@/stores/workspaceStore";
import { useOperatingScreen } from "./useOperatingScreen";

const mocks = vi.hoisted(() => ({ queueTune: vi.fn() }));
vi.mock("@/lib/radio/tune", () => ({ queueTune: mocks.queueTune }));

const previousWorkspace = useWorkspaceStore.getState();

beforeEach(() => {
  localStorage.clear();
  useOperatingStateStore.setState({ followScreens: true });
  useOperatingStateStore.getState().reset();
  useWorkspaceStore.setState(previousWorkspace, true);
  mocks.queueTune.mockClear();
});

afterEach(() => {
  useWorkspaceStore.setState(previousWorkspace, true);
});

function foreignTuneMessage(workspaceId: string, frequencyKHz: number, mode: string | null) {
  return {
    v: OPERATING_PROTOCOL_VERSION,
    senderId: "foreign-device",
    sentAt: Date.now(),
    kind: "command" as const,
    command: { type: "tune" as const, workspaceId, frequencyKHz, mode },
  };
}

describe("useOperatingScreen", () => {
  it("applies an inbound tune command addressed to this workstation's workspace id", () => {
    renderHook(() => useOperatingScreen());

    act(() => {
      useOperatingStateStore.getState().applyMessage(
        foreignTuneMessage(DEFAULT_WORKSPACE_ID, 14195, "USB"),
      );
    });

    expect(mocks.queueTune).toHaveBeenCalledWith(14195, "USB");
  });

  it("ignores an inbound tune command addressed to a different workspace", () => {
    renderHook(() => useOperatingScreen());

    act(() => {
      useOperatingStateStore.getState().applyMessage(
        foreignTuneMessage("phone-canvas", 7074, null),
      );
    });

    expect(mocks.queueTune).not.toHaveBeenCalled();
  });
});

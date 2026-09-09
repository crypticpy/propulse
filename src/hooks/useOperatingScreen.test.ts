import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATING_PROTOCOL_VERSION } from "@/lib/workspace/operatingChannel";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { DEFAULT_WORKSPACE_ID, useWorkspaceStore } from "@/stores/workspaceStore";
import { useOperatingScreen } from "./useOperatingScreen";

const mocks = vi.hoisted(() => ({
  queueTune: vi.fn(),
  tuneDisabledReason: vi.fn(),
}));
vi.mock("@/lib/radio/tune", () => ({
  queueTune: mocks.queueTune,
  tuneDisabledReason: mocks.tuneDisabledReason,
}));

const previousWorkspace = useWorkspaceStore.getState();

beforeEach(() => {
  localStorage.clear();
  useOperatingStateStore.setState({ followScreens: true });
  useOperatingStateStore.getState().reset();
  useWorkspaceStore.setState(previousWorkspace, true);
  mocks.queueTune.mockClear();
  mocks.queueTune.mockReturnValue(true);
  mocks.tuneDisabledReason.mockClear();
  mocks.tuneDisabledReason.mockReturnValue("RIG WAITING");
});

afterEach(() => {
  useWorkspaceStore.setState(previousWorkspace, true);
});

function foreignTuneMessage(
  deviceId: string,
  workspaceId: string,
  frequencyKHz: number,
  mode: string | null,
) {
  return {
    v: OPERATING_PROTOCOL_VERSION,
    senderId: "foreign-device",
    sentAt: Date.now(),
    kind: "command" as const,
    command: { type: "tune" as const, deviceId, workspaceId, frequencyKHz, mode },
  };
}

describe("useOperatingScreen", () => {
  it("applies an inbound tune command addressed to this workstation's own device and workspace id", () => {
    renderHook(() => useOperatingScreen());
    const ownDeviceId = useOperatingStateStore.getState().deviceId;

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(foreignTuneMessage(ownDeviceId, DEFAULT_WORKSPACE_ID, 14195, "USB"));
    });

    expect(mocks.queueTune).toHaveBeenCalledWith(14195, "USB");
  });

  it("ignores an inbound tune command addressed to a different workspace, even with a matching device id", () => {
    renderHook(() => useOperatingScreen());
    const ownDeviceId = useOperatingStateStore.getState().deviceId;

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(foreignTuneMessage(ownDeviceId, "phone-canvas", 7074, null));
    });

    expect(mocks.queueTune).not.toHaveBeenCalled();
  });

  it("ignores an inbound tune command addressed to a different device, even with a matching workspace id", () => {
    renderHook(() => useOperatingScreen());

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(foreignTuneMessage("some-other-device", DEFAULT_WORKSPACE_ID, 14195, "USB"));
    });

    expect(mocks.queueTune).not.toHaveBeenCalled();
  });

  it("posts a tuneResult with ok: true after a successful inbound tune", () => {
    renderHook(() => useOperatingScreen());
    const ownDeviceId = useOperatingStateStore.getState().deviceId;

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(foreignTuneMessage(ownDeviceId, DEFAULT_WORKSPACE_ID, 14195, "USB"));
    });

    expect(useOperatingStateStore.getState().lastCommand?.command).toEqual({
      type: "tuneResult",
      deviceId: ownDeviceId,
      workspaceId: DEFAULT_WORKSPACE_ID,
      ok: true,
      reason: null,
    });
  });

  it("reports a tuneResult with a reason when queueTune fails", () => {
    mocks.queueTune.mockReturnValue(false);
    renderHook(() => useOperatingScreen());
    const ownDeviceId = useOperatingStateStore.getState().deviceId;

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(foreignTuneMessage(ownDeviceId, DEFAULT_WORKSPACE_ID, 14195, "USB"));
    });

    expect(useOperatingStateStore.getState().lastCommand?.command).toEqual({
      type: "tuneResult",
      deviceId: ownDeviceId,
      workspaceId: DEFAULT_WORKSPACE_ID,
      ok: false,
      reason: "RIG WAITING",
    });
  });

  it("refuses an inbound tune on a wall canvas and reports why, mirroring the phone's own canCommand filter", () => {
    useWorkspaceStore.getState().setCanvasTypeOverride("wall");
    renderHook(() => useOperatingScreen());
    const ownDeviceId = useOperatingStateStore.getState().deviceId;

    act(() => {
      useOperatingStateStore
        .getState()
        .applyMessage(foreignTuneMessage(ownDeviceId, DEFAULT_WORKSPACE_ID, 14195, "USB"));
    });

    expect(mocks.queueTune).not.toHaveBeenCalled();
    expect(useOperatingStateStore.getState().lastCommand?.command).toEqual({
      type: "tuneResult",
      deviceId: ownDeviceId,
      workspaceId: DEFAULT_WORKSPACE_ID,
      ok: false,
      reason: "This screen cannot act on commands.",
    });
  });
});

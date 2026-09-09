import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { OPERATING_PROTOCOL_VERSION } from "@/lib/workspace/operatingChannel";
import type { CanvasType } from "@/lib/workspace/types";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { PhoneStateStrip } from "./PhoneStateStrip";

/**
 * Announces a foreign device's registration the way `applyMessage` would
 * after a real `register` broadcast — never `registerWorkspace` (that always
 * keys off *this* store's own `deviceId`, which is exactly the registration
 * #721's own-device filter must exclude).
 */
function registerForeignScreen(input: {
  deviceId: string;
  workspaceId: string;
  canvasType: CanvasType;
  label: string;
  canCommand: boolean;
}) {
  act(() => {
    useOperatingStateStore.getState().applyMessage({
      v: OPERATING_PROTOCOL_VERSION,
      senderId: input.deviceId,
      sentAt: Date.now(),
      kind: "register",
      registration: {
        deviceId: input.deviceId,
        workspaceId: input.workspaceId,
        canvasType: input.canvasType,
        label: input.label,
        capabilities: { canTune: false, canCommand: input.canCommand },
        lastSeen: Date.now(),
      },
    });
  });
}

beforeEach(() => {
  localStorage.clear();
  useOperatingStateStore.setState({ followScreens: true });
  useOperatingStateStore.getState().reset();
});

describe("PhoneStateStrip screens control", () => {
  it("never offers a wall as a flip target", () => {
    registerForeignScreen({
      deviceId: "wall-1",
      workspaceId: "wall-workspace",
      canvasType: "wall",
      label: "Shack wall",
      canCommand: false,
    });
    render(<PhoneStateStrip />);

    expect(screen.queryByText("SHACK WALL")).toBeNull();
    expect(screen.queryByRole("button", { name: /Flip Shack wall/ })).toBeNull();
    expect(screen.getByText("No other screen to flip yet.")).toBeTruthy();
  });

  it("flips the intended screen and never the wall sharing the roster", () => {
    registerForeignScreen({
      deviceId: "wall-1",
      workspaceId: "wall-workspace",
      canvasType: "wall",
      label: "Shack wall",
      canCommand: false,
    });
    registerForeignScreen({
      deviceId: "workstation-1",
      workspaceId: "workstation-default",
      canvasType: "workstation",
      label: "My workstation",
      canCommand: true,
    });
    render(<PhoneStateStrip />);

    fireEvent.click(screen.getByRole("button", { name: /to the next page/ }));

    expect(useOperatingStateStore.getState().lastCommand?.command).toEqual({
      type: "flipPage",
      workspaceId: "workstation-default",
      pageIndex: 1,
    });

    fireEvent.click(screen.getByRole("button", { name: /to the next page/ }));
    expect(useOperatingStateStore.getState().lastCommand?.command).toEqual({
      type: "flipPage",
      workspaceId: "workstation-default",
      pageIndex: 2,
    });
  });

  it("does not offer this phone's own registration as a flip target", () => {
    useOperatingStateStore.getState().registerWorkspace({
      workspaceId: "phone-canvas",
      canvasType: "phone",
      label: "Phone",
      capabilities: { canTune: false, canCommand: true },
    });
    render(<PhoneStateStrip />);

    expect(screen.getByText("No other screen to flip yet.")).toBeTruthy();
  });

  it("cycles between several live screens and flips only the selected one", () => {
    registerForeignScreen({
      deviceId: "tablet-1",
      workspaceId: "tablet-canvas",
      canvasType: "tablet",
      label: "Bench tablet",
      canCommand: true,
    });
    registerForeignScreen({
      deviceId: "workstation-1",
      workspaceId: "workstation-default",
      canvasType: "workstation",
      label: "Main workstation",
      canCommand: true,
    });
    render(<PhoneStateStrip />);

    // Alphabetical by workspaceId: "tablet-canvas" sorts before
    // "workstation-default", so the bench tablet is the initial pick.
    const picker = screen.getByRole("button", { name: /Screen to flip/ });
    expect(picker.textContent).toBe("BENCH TABLET");

    fireEvent.click(picker);
    expect(screen.getByRole("button", { name: /Screen to flip/ }).textContent).toBe(
      "MAIN WORKSTATION",
    );

    fireEvent.click(screen.getByRole("button", { name: /to the next page/ }));
    expect(useOperatingStateStore.getState().lastCommand?.command).toEqual({
      type: "flipPage",
      workspaceId: "workstation-default",
      pageIndex: 1,
    });
  });

  it("reports the shared kill switch as the reason when follow screens is off", () => {
    registerForeignScreen({
      deviceId: "workstation-1",
      workspaceId: "workstation-default",
      canvasType: "workstation",
      label: "My workstation",
      canCommand: true,
    });
    useOperatingStateStore.setState({ followScreens: false });
    render(<PhoneStateStrip />);

    expect(screen.getByText("Follow screens is off on this phone.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /to the next page/ })).toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { HamClockWallCursorChip } from "./HamClockWallCursorChip";

beforeEach(() => {
  localStorage.clear();
  useOperatingStateStore.getState().reset();
});

describe("HamClockWallCursorChip", () => {
  it("renders nothing when the cursor has never been shared", () => {
    const { container } = render(<HamClockWallCursorChip />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the shared target, band and the screen that wrote it", () => {
    useOperatingStateStore.setState((state) => ({
      cursor: {
        ...state.cursor,
        target: { callsign: "K1ABC", grid: "EM10", lat: null, lon: null, spotId: null },
        band: "20m",
      },
      stamps: { ...state.stamps, target: { at: Date.now(), by: "phone-device" } },
      registrations: {
        "phone-device::phone-canvas": {
          deviceId: "phone-device",
          workspaceId: "phone-canvas",
          canvasType: "phone",
          label: "Phone",
          capabilities: { canTune: true, canCommand: true },
          lastSeen: Date.now(),
        },
      },
    }));

    render(<HamClockWallCursorChip />);
    const chip = screen.getByRole("status", { name: "Shared operating cursor" });
    expect(chip.textContent).toContain("K1ABC");
    expect(chip.textContent).toContain("20M");
    expect(chip.textContent).toContain("PHONE");
  });

  it("omits the source when the writing screen has dropped off the roster", () => {
    useOperatingStateStore.setState((state) => ({
      cursor: {
        ...state.cursor,
        target: { callsign: "K1ABC", grid: "EM10", lat: null, lon: null, spotId: null },
      },
      stamps: { ...state.stamps, target: { at: Date.now(), by: "gone-device" } },
      registrations: {},
    }));

    render(<HamClockWallCursorChip />);
    const chip = screen.getByRole("status", { name: "Shared operating cursor" });
    expect(chip.textContent).toContain("K1ABC");
    expect(chip.textContent).not.toContain("FROM");
  });
});

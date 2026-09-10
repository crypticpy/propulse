import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useOperatingStateStore } from "@/stores/operatingStateStore";
import { HamClockWallCursorChip } from "./HamClockWallCursorChip";

beforeEach(() => {
  localStorage.clear();
  useOperatingStateStore.getState().reset();
});

describe("HamClockWallCursorChip", () => {
  it("mounts the region (empty) even when the cursor has never been shared", () => {
    render(<HamClockWallCursorChip />);
    // The region must already be in the tree — with no content — before any
    // cursor is ever set, or a later update has nothing already-watched to
    // mutate into and announce.
    const chip = screen.getByRole("status", { name: "Shared operating cursor" });
    expect(chip.textContent).toBe("");
  });

  it("shows the shared target, band and the screen that wrote it, as a mutation of the same region", () => {
    const { container } = render(<HamClockWallCursorChip />);
    const chipBefore = screen.getByRole("status", { name: "Shared operating cursor" });

    act(() => {
      useOperatingStateStore.setState((state) => ({
        cursor: {
          ...state.cursor,
          target: { callsign: "K1ABC", grid: "EM10", lat: null, lon: null, spotId: null },
          band: "20m",
        },
        stamps: { ...state.stamps, target: {
          at: Date.now(),
          by: "phone-device",
          appliedAt: Date.now(),
          appliedSeq: 1,
        } },
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
    });

    const chip = screen.getByRole("status", { name: "Shared operating cursor" });
    // Same DOM node as before the update — the mutation an assistive
    // technology already watching the region would announce.
    expect(chip).toBe(chipBefore);
    expect(container.contains(chip)).toBe(true);
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
      stamps: { ...state.stamps, target: {
        at: Date.now(),
        by: "gone-device",
        appliedAt: Date.now(),
        appliedSeq: 1,
      } },
      registrations: {},
    }));

    render(<HamClockWallCursorChip />);
    const chip = screen.getByRole("status", { name: "Shared operating cursor" });
    expect(chip.textContent).toContain("K1ABC");
    expect(chip.textContent).not.toContain("FROM");
  });
});

import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { OPERATING_PROTOCOL_VERSION } from "@/lib/workspace/operatingChannel";
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

  it("names the original writer after another screen relays the cursor", () => {
    // A `hello` reply relays someone else's write. The chip must keep naming
    // the screen the operator actually used, not whichever peer answered
    // (#859 round 5) — the same attribution the merge rule depends on.
    const at = Date.now();
    act(() => {
      useOperatingStateStore.setState({
        registrations: {
          "aaa-phone::phone-canvas": {
            deviceId: "aaa-phone",
            workspaceId: "phone-canvas",
            canvasType: "phone",
            label: "Phone",
            capabilities: { canTune: true, canCommand: true },
            lastSeen: at,
          },
          "zzz-peer::desk-canvas": {
            deviceId: "zzz-peer",
            workspaceId: "desk-canvas",
            canvasType: "workstation",
            label: "Desk",
            capabilities: { canTune: true, canCommand: true },
            lastSeen: at,
          },
        },
      });
      // First hand from the phone.
      useOperatingStateStore.getState().applyMessage({
        v: OPERATING_PROTOCOL_VERSION,
        senderId: "aaa-phone",
        sentAt: at,
        kind: "state",
        patch: {
          target: {
            value: { callsign: "K1ABC", grid: "EM10", lat: null, lon: null, spotId: null },
            at,
          },
        },
      });
      // Then relayed by the peer whose id sorts above the phone's.
      useOperatingStateStore.getState().applyMessage({
        v: OPERATING_PROTOCOL_VERSION,
        senderId: "zzz-peer",
        sentAt: at,
        kind: "state",
        patch: {
          target: {
            value: { callsign: "K1ABC", grid: "EM10", lat: null, lon: null, spotId: null },
            at,
            by: "aaa-phone",
          },
        },
      });
    });

    render(<HamClockWallCursorChip />);
    const chip = screen.getByRole("status", { name: "Shared operating cursor" });
    expect(chip.textContent).toContain("PHONE");
    expect(chip.textContent).not.toContain("WORKSTATION");
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

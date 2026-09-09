import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { useRigStore } from "@/stores/rigStore";
import * as rigStoreModule from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { SpotRow } from "./SpotRow";
import type { SpotRowProps } from "./types";

const spot: DXSpot = {
  id: "spot-1",
  spotter: "W1AW",
  dx: "VK9OK",
  frequency: 14074,
  mode: "FT8",
  comment: "CQ DX",
  time: new Date("2026-09-08T12:00:00Z"),
  band: "20m",
};

const workedStatus: SpotRowProps["workedStatus"] = {
  isWorked: false,
  workedOnBand: false,
  workedBands: [],
  isATNO: false,
};

function renderRow(overrides: Partial<SpotRowProps> = {}) {
  const props: SpotRowProps = {
    spot,
    index: 0,
    isSelected: false,
    isHovered: false,
    workedStatus,
    isAlertMatch: false,
    isNeeded: false,
    distanceKm: 1200,
    onSelect: vi.fn(),
    onHover: vi.fn(),
    onSetTarget: vi.fn(),
    onWork: vi.fn(),
    onWatchCallsign: vi.fn(),
    onHideSpot: vi.fn(),
    ...overrides,
  };
  return render(<SpotRow {...props} />);
}

const previous = {
  rig: useRigStore.getState(),
  settings: useSettingsStore.getState(),
};

beforeEach(() => {
  useSettingsStore.setState({ bridgeEnabled: true });
  useRigStore.setState({
    catEnabled: true,
    bridgeConnected: true,
    connected: true,
    pendingFrequency: null,
    pendingMode: null,
  });
});

afterEach(() => {
  useRigStore.setState(previous.rig);
  useSettingsStore.setState(previous.settings);
});

describe("SpotRow trailing toolbar", () => {
  it("places the chip tune control before outlined quick actions", () => {
    renderRow();
    const toolbar = screen.getByRole("button", { name: /Tune 14.074 MHz FT8/ })
      .parentElement;
    expect(toolbar).toBeTruthy();
    const buttons = toolbar!.querySelectorAll("button");
    expect(buttons[0]?.textContent).toContain("TUNE 14.074");
    expect(buttons[1]?.getAttribute("aria-label")).toBe("Set as map target");
    expect(buttons[2]?.getAttribute("aria-label")).toBe("Work VK9OK");
    expect(buttons[3]?.getAttribute("aria-label")).toBe("Watch this callsign");
    expect(buttons[4]?.getAttribute("aria-label")).toBe("Hide this spot");
  });

  it("uses bordered 32px icon buttons for quick actions", () => {
    renderRow();
    const target = screen.getByRole("button", { name: "Set as map target" });
    expect(target.className).toContain("h-8");
    expect(target.className).toContain("border-su-line/50");
    expect(target.className).toContain("hover:border-su-info");
  });

  it("does not render a full-width tune row below the grid", () => {
    const { container } = renderRow();
    expect(container.querySelector(".col-span-full")).toBeNull();
  });

  it("stages a tune command from the chip without selecting the row", () => {
    const onSelect = vi.fn();
    renderRow({ onSelect });
    fireEvent.click(
      screen.getByRole("button", { name: "Tune 14.074 MHz FT8" }),
    );
    expect(useRigStore.getState().pendingFrequency).toBe(14_074_000);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("stays visible and interactive without hover on coarse-pointer / no-hover devices", () => {
    renderRow();
    const toolbar = screen.getByRole("button", { name: /Tune 14.074 MHz FT8/ })
      .parentElement;
    expect(toolbar).toBeTruthy();
    // Hidden by default and inert (no pointer events) until revealed...
    expect(toolbar!.className).toContain("opacity-0");
    expect(toolbar!.className).toContain("pointer-events-none");
    // ...hover/focus-within reveal (fine-pointer default) stays intact...
    expect(toolbar!.className).toContain("group-hover:opacity-100");
    expect(toolbar!.className).toContain("group-hover:pointer-events-auto");
    expect(toolbar!.className).toContain("focus-within:opacity-100");
    expect(toolbar!.className).toContain("focus-within:pointer-events-auto");
    // ...and a true no-hover device (touch, no mouse/trackpad attached)
    // forces it permanently visible and clickable, since jsdom can't
    // evaluate the media query itself. Deliberately NOT any-pointer:coarse
    // here: that would also pin the toolbar open on hybrid devices (a touch
    // laptop, an iPad with a trackpad) for anyone driving the mouse,
    // permanently covering the Info/Spotter columns.
    expect(toolbar!.className).toContain("[@media(hover:none)]:opacity-100");
    expect(toolbar!.className).toContain(
      "[@media(hover:none)]:pointer-events-auto",
    );
    expect(toolbar!.className).not.toContain("any-pointer");
  });

  it("reveals the toolbar for the keyboard-focused row, including across a prop update (memo comparator)", () => {
    // Word-boundary match: the base class list already contains
    // group-hover:opacity-100 / group-hover:pointer-events-auto, so a plain
    // `.toContain("opacity-100")` passes even when isFocused is false. Only
    // the un-prefixed token proves the focused-state branch actually fired.
    const hasToken = (className: string, token: string) =>
      new RegExp(`(^|\\s)${token}(\\s|$)`).test(className);

    const { rerender } = renderRow({ isFocused: false });
    const getToolbar = () =>
      screen.getByRole("button", { name: /Tune 14.074 MHz FT8/ })
        .parentElement!;

    expect(hasToken(getToolbar().className, "opacity-100")).toBe(false);
    expect(hasToken(getToolbar().className, "pointer-events-auto")).toBe(
      false,
    );

    // Rerender through the same <SpotRow> element so the change goes
    // through spotRowPropsAreEqual (the memo comparator) rather than a
    // fresh mount — a fresh mount can't detect a comparator bug that skips
    // a prop update.
    const props: SpotRowProps = {
      spot,
      index: 0,
      isSelected: false,
      isHovered: false,
      workedStatus,
      isAlertMatch: false,
      isNeeded: false,
      distanceKm: 1200,
      onSelect: vi.fn(),
      onHover: vi.fn(),
      onSetTarget: vi.fn(),
      onWork: vi.fn(),
      onWatchCallsign: vi.fn(),
      onHideSpot: vi.fn(),
      isFocused: true,
    };
    rerender(<SpotRow {...props} />);

    expect(hasToken(getToolbar().className, "opacity-100")).toBe(true);
    expect(hasToken(getToolbar().className, "pointer-events-auto")).toBe(
      true,
    );
  });

  it("does not mount the tune chip when CAT control is disabled, avoiding extra per-row store subscriptions", () => {
    useRigStore.setState({ catEnabled: false });
    renderRow();
    expect(
      screen.queryByRole("button", { name: /Tune 14.074 MHz/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Set as map target" }),
    ).toBeTruthy();
  });

  it("fades the band-colour border alpha with spot age instead of leaving it static", () => {
    const freshSpot: DXSpot = { ...spot, time: new Date() };
    const { unmount } = renderRow({ spot: freshSpot });
    const freshRow = screen.getByRole("row");
    // Fresh spot: full alpha, band hex "#66ff99" for 20m -> "#66ff99ff".
    expect(freshRow.style.borderLeft).toContain("102, 255, 153");
    unmount();

    const oldSpot: DXSpot = {
      ...spot,
      time: new Date(Date.now() - 20 * 60 * 1000), // 20 min old -> "old" category, opacity 0.4
    };
    renderRow({ spot: oldSpot });
    const oldRow = screen.getByRole("row");
    // Same band hue, but the alpha channel should reflect the 0.4 age opacity
    // (round(0.4 * 255) = 102 = 0x66) rather than matching the fresh row.
    expect(oldRow.style.borderLeft).toContain("rgba(102, 255, 153,");
    expect(oldRow.style.borderLeft).not.toBe(freshRow.style.borderLeft);
    // Regression guard: the fade must live in the border colour, not as
    // opacity on the row wrapper (that was the #683 regression — wrapper
    // opacity cascades to descendants and washes out the revealed toolbar).
    expect(oldRow.style.opacity).toBe("");
  });

  it("keeps an old, focused row's toolbar fully opaque while its border still fades (the combination that broke last time)", () => {
    const oldSpot: DXSpot = {
      ...spot,
      time: new Date(Date.now() - 20 * 60 * 1000),
    };
    renderRow({ spot: oldSpot, isFocused: true });

    const row = screen.getByRole("row");
    // Border still carries the age fade.
    expect(row.style.borderLeft).toContain("rgba(102, 255, 153,");
    // The row wrapper itself is never given an opacity — otherwise it would
    // cascade onto the focused toolbar below and wash out its labels.
    expect(row.style.opacity).toBe("");

    const toolbar = screen.getByRole("button", { name: /Tune 14.074 MHz FT8/ })
      .parentElement!;
    expect(toolbar.className).toContain("opacity-100");
    expect(toolbar.className).not.toContain("opacity-0");
  });

  it("applies a transition to the per-cell age fade so it animates instead of snapping", () => {
    const oldSpot: DXSpot = {
      ...spot,
      time: new Date(Date.now() - 20 * 60 * 1000),
    };
    renderRow({ spot: oldSpot });

    const timeCell = document.querySelector('[title$="m ago"]') as HTMLElement;
    expect(timeCell).toBeTruthy();
    expect(timeCell.style.opacity).toBe("0.4");
    expect(timeCell.style.transition).toContain("opacity");
  });

  it("actually reduces useRigStore subscriptions when CAT control is disabled", () => {
    // The chip-absence assertion above also passes if the catEnabled gate at
    // SpotRow.tsx were reverted, because TuneButton itself early-returns
    // null when !catEnabled — that only proves the chip doesn't render, not
    // that SpotRow avoided mounting it. This test counts useRigStore hook
    // calls directly: TuneButton's 3 selectors (catEnabled, bridgeConnected,
    // connected) only fire if TuneButton mounts at all.
    const spy = vi.spyOn(rigStoreModule, "useRigStore");

    useRigStore.setState({ catEnabled: false });
    renderRow();
    const callsWhenDisabled = spy.mock.calls.length;
    spy.mockClear();

    useRigStore.setState({ catEnabled: true });
    renderRow();
    const callsWhenEnabled = spy.mock.calls.length;

    spy.mockRestore();

    expect(callsWhenDisabled).toBeLessThan(callsWhenEnabled);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DXSpot } from "@/types/dxcluster";
import { useRigStore } from "@/stores/rigStore";
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

  it("stays visible without hover on coarse-pointer / no-hover devices", () => {
    renderRow();
    const toolbar = screen.getByRole("button", { name: /Tune 14.074 MHz FT8/ })
      .parentElement;
    expect(toolbar).toBeTruthy();
    // Hover/focus-only reveal (fine-pointer default) stays intact...
    expect(toolbar!.className).toContain("opacity-0");
    expect(toolbar!.className).toContain("group-hover:opacity-100");
    expect(toolbar!.className).toContain("focus-within:opacity-100");
    // ...but a coarse pointer or no-hover device forces it permanently
    // visible, since jsdom can't evaluate the media query itself.
    expect(toolbar!.className).toContain("[@media(hover:none)]:opacity-100");
    expect(toolbar!.className).toContain(
      "[@media(pointer:coarse)]:opacity-100",
    );
  });
});

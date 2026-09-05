import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockWallHeader } from "./HamClockWallHeader";

/** True when `a` appears before `b` in document order. */
function isBefore(a: Element, b: Element): boolean {
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("HamClockWallHeader", () => {
  it("shows DESK in the header without opening a menu, and orders mode, density, projection and the settings trigger consistently (B1/HW-22)", () => {
    useHamClockDisplayStore.getState().setDensity("wall");
    render(<HamClockWallHeader />);

    // DESK is directly visible — no CONTROLS click needed. This mirrors the
    // desk-side acceptance check for WALL in HamClockView.test.tsx.
    const desk = screen.getByRole("button", { name: "DESK" });
    expect(desk).toBeTruthy();

    const mode = screen.getByRole("group", { name: "HamClock mode" });
    const density = screen.getByRole("group", { name: "HamClock density" });
    const projection = screen.getByRole("group", { name: "Map projection" });
    const settingsTrigger = screen.getByRole("button", { name: "CONTROLS" });

    expect(isBefore(mode, density)).toBe(true);
    expect(isBefore(density, projection)).toBe(true);
    expect(isBefore(projection, settingsTrigger)).toBe(true);
  });
});

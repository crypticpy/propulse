import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HamClockDisplaySettings } from "./HamClockDisplaySettings";

describe("HamClockDisplaySettings", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  it("opens on click and no longer offers a Density control — it moved to the header (B1/HW-22)", () => {
    render(<HamClockDisplaySettings />);
    fireEvent.click(screen.getByRole("button", { name: "Display" }));

    expect(
      screen.getByRole("region", { name: "HamClock display settings" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Density")).toBeNull();
    expect(screen.getByLabelText("Units")).toBeTruthy();
  });
});

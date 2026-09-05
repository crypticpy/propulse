import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { HamClockDensitySwitch } from "./HamClockDensitySwitch";

describe("HamClockDensitySwitch", () => {
  it("announces the active density and switches to the other one on click", () => {
    useHamClockDisplayStore.getState().setDensity("wall");
    render(<HamClockDensitySwitch />);

    expect(
      screen.getByRole("button", { name: "WALL" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "DESK" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "DESK" }));
    expect(useHamClockDisplayStore.getState().density).toBe("desk");
  });
});

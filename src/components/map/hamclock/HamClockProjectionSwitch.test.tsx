import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HamClockProjectionSwitch } from "./HamClockProjectionSwitch";

describe("HamClockProjectionSwitch", () => {
  it("announces the active projection and selects another renderer", () => {
    const onChange = vi.fn();
    render(<HamClockProjectionSwitch value="flat" onChange={onChange} />);

    expect(
      screen.getByRole("button", { name: "Flat map" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Azimuthal map" }));
    expect(onChange).toHaveBeenCalledWith("azimuthal");
  });
});

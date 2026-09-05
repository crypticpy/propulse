import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { HamClockThemePicker } from "./HamClockThemePicker";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";

beforeEach(() => {
  sessionStorage.clear();
  useHamClockDisplayStore.getState().resetDisplay();
  document.head
    .querySelectorAll("[data-hamclock-font]")
    .forEach((link) => link.remove());
});

describe("HamClockThemePicker", () => {
  it("previews every theme with its own tokens and selects the one clicked", () => {
    render(<HamClockThemePicker />);

    const pulse = screen.getByRole("button", { name: /^Pulse theme/ });
    const brass = screen.getByRole("button", { name: /^Brass theme/ });
    expect(pulse.getAttribute("aria-pressed")).toBe("true");
    expect(brass.getAttribute("aria-pressed")).toBe("false");
    // Each preview paints from the theme it offers, not the active one.
    expect(
      brass.querySelector('[data-hamclock-theme="brass"]'),
    ).not.toBeNull();

    fireEvent.click(brass);

    expect(useHamClockDisplayStore.getState().theme).toBe("brass");
    expect(brass.getAttribute("aria-pressed")).toBe("true");
    expect(pulse.getAttribute("aria-pressed")).toBe("false");
    // Choosing a serif theme is what pays for its web font.
    expect(
      document.head.querySelectorAll('[data-hamclock-font="brass"]'),
    ).toHaveLength(1);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useHamClockDisplayStore } from "@/stores/hamclockDisplayStore";
import { ThemeTab } from "./ThemeTab";

beforeEach(() => {
  useHamClockDisplayStore.getState().resetDisplay();
  document.head
    .querySelectorAll("[data-hamclock-font]")
    .forEach((link) => link.remove());
});

// Order matches `HAMCLOCK_THEMES`: pulse, classic, brass.
describe("ThemeTab", () => {
  it("is a HamClockSegmented radiogroup named Theme with a live preview per option", () => {
    render(<ThemeTab />);

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);

    // Pulse is the default and its own tokens paint its preview.
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    expect(radios[0].textContent).toContain("PULSE");
    expect(
      radios[2].querySelector('[data-hamclock-theme="brass"]'),
    ).not.toBeNull();
  });

  it("selects the theme clicked and warms its web font", () => {
    render(<ThemeTab />);
    const brass = screen.getAllByRole("radio")[2];

    fireEvent.click(brass);

    expect(useHamClockDisplayStore.getState().theme).toBe("brass");
    expect(brass.getAttribute("aria-checked")).toBe("true");
    expect(
      document.head.querySelectorAll('[data-hamclock-font="brass"]'),
    ).toHaveLength(1);
  });

  it("moves the selection with the arrow keys, same as any HamClockSegmented", () => {
    render(<ThemeTab />);
    const radios = screen.getAllByRole("radio");

    fireEvent.keyDown(radios[0], { key: "ArrowRight" });

    expect(useHamClockDisplayStore.getState().theme).toBe("classic");
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(radios[1].getAttribute("tabindex")).toBe("0");
  });
});

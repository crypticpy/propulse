import { beforeEach, describe, expect, it } from "vitest";
import {
  HAMCLOCK_THEME_FONT_HREF,
  ensureHamClockThemeFont,
} from "./themeFonts";

function fontLinks(): HTMLLinkElement[] {
  return [...document.head.querySelectorAll<HTMLLinkElement>("[data-hamclock-font]")];
}

beforeEach(() => {
  fontLinks().forEach((link) => link.remove());
});

describe("ensureHamClockThemeFont", () => {
  it("loads nothing for the default theme", () => {
    expect(ensureHamClockThemeFont("pulse")).toBeNull();
    expect(fontLinks()).toHaveLength(0);
  });

  it("injects one stylesheet link per theme and never duplicates it", () => {
    const first = ensureHamClockThemeFont("classic");
    const second = ensureHamClockThemeFont("classic");

    expect(first).toBe(second);
    expect(fontLinks()).toHaveLength(1);
    expect(first?.rel).toBe("stylesheet");
    expect(first?.getAttribute("href")).toBe(
      HAMCLOCK_THEME_FONT_HREF.classic,
    );

    ensureHamClockThemeFont("brass");
    ensureHamClockThemeFont("brass");
    ensureHamClockThemeFont("classic");
    expect(fontLinks().map((link) => link.dataset.hamclockFont)).toEqual([
      "classic",
      "brass",
    ]);
  });
});

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { solarImageUrl } from "@/lib/solar/mediaProducts";
import { SunspotModal } from "./SunspotModal";

describe("SunspotModal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances the SDO image URL while the modal remains open", () => {
    vi.useFakeTimers();
    const initial = new Date("2026-07-15T12:10:00.000Z");
    vi.setSystemTime(initial);

    render(
      <SunspotModal isOpen onClose={vi.fn()} currentValue={120} />,
    );
    const image = screen.getByRole("img");
    expect(image.getAttribute("src")).toBe(
      solarImageUrl("sunspot-hmi", initial.getTime()),
    );

    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
    });

    expect(screen.getByRole("img").getAttribute("src")).toBe(
      solarImageUrl("sunspot-hmi", initial.getTime() + 6 * 60_000),
    );
  });
});

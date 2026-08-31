import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { solarImageUrl } from "@/lib/solar/mediaProducts";
import { SunspotModal } from "./SunspotModal";

describe("SunspotModal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("promotes a new SDO image only after its cadence probe loads", () => {
    vi.useFakeTimers();
    const initial = new Date("2026-07-15T12:10:00.000Z");
    vi.setSystemTime(initial);

    render(
      <SunspotModal isOpen onClose={vi.fn()} currentValue={120} />,
    );
    const image = screen.getByRole("img");
    const firstUrl = solarImageUrl("sunspot-hmi", initial.getTime());
    expect(image.getAttribute("src")).toBe(firstUrl);
    fireEvent.load(image);

    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
    });

    const probe = document.querySelector<HTMLImageElement>(
      "img[data-solar-image-probe]",
    );
    const replacementUrl = solarImageUrl(
      "sunspot-hmi",
      initial.getTime() + 6 * 60_000,
    );
    expect(probe?.getAttribute("src")).toBe(replacementUrl);
    expect(screen.getByRole("img").getAttribute("src")).toBe(firstUrl);

    fireEvent.error(probe!);
    expect(screen.getByRole("img").getAttribute("src")).toBe(firstUrl);
    expect(screen.queryByText(/illustration \(current image unavailable\)/i)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
    });
    const laterProbe = document.querySelector<HTMLImageElement>(
      "img[data-solar-image-probe]",
    );
    const laterUrl = solarImageUrl(
      "sunspot-hmi",
      initial.getTime() + 12 * 60_000,
    );
    expect(laterProbe?.getAttribute("src")).toBe(laterUrl);
    fireEvent.load(laterProbe!);
    expect(screen.getByRole("img").getAttribute("src")).toBe(laterUrl);
  });
});

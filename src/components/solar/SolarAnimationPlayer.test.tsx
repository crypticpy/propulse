import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { solarImageUrl } from "@/lib/solar/mediaProducts";
import { SolarAnimationPlayer } from "./SolarAnimationPlayer";

describe("SolarAnimationPlayer", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refreshes its mounted fallback and manifest at the image cadence", () => {
    vi.useFakeTimers();
    const initial = new Date("2026-07-15T12:10:00.000Z");
    vi.setSystemTime(initial);
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SolarAnimationPlayer
        animationId="drap-global"
        thumbnailProductId="drap-global"
        alt="Solar animation"
      />,
    );
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      solarImageUrl("drap-global", initial.getTime()),
    );

    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
    });

    expect(screen.getByRole("img").getAttribute("src")).toBe(
      solarImageUrl("drap-global", initial.getTime() + 6 * 60_000),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

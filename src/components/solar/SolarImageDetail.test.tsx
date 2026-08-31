import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { solarImageUrl } from "@/lib/solar/mediaProducts";
import { SolarImageDetail } from "./SolarImageDetail";

describe("SolarImageDetail", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps a cadence-stable URL and offers recovery when the full image fails", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<SolarImageDetail productId="drap-global" />);

    const image = screen.getByRole("img");
    expect(image.getAttribute("src")).toBe(solarImageUrl("drap-global", now));
    fireEvent.error(image);
    expect(screen.getByRole("alert").textContent).toContain("temporarily unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
    const retriedImage = screen.getByRole("img");
    expect(retriedImage.getAttribute("src")).toBe(
      solarImageUrl("drap-global", now, 1),
    );
    fireEvent.load(retriedImage);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears a transient metadata error after a cadence refresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:10:00.000Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            observedAt: null,
            checkedAt: "2026-07-15T12:16:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<SolarImageDetail productId="sunspot-hmi" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByText(/observation timestamp is temporarily unavailable/i),
    ).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(6 * 60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText(/provider did not publish an observation timestamp/i),
    ).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retains a usable detail image when the next cadence probe fails", () => {
    vi.useFakeTimers();
    const initial = new Date("2026-07-15T12:10:00.000Z");
    vi.setSystemTime(initial);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = render(
      <SolarImageDetail productId="sunspot-hmi" />,
    );
    const image = screen.getByRole("img");
    const firstUrl = image.getAttribute("src");
    fireEvent.load(image);

    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
    });

    const probe = container.querySelector<HTMLImageElement>(
      "img[data-solar-image-probe]",
    );
    expect(probe?.getAttribute("src")).toBe(
      solarImageUrl("sunspot-hmi", initial.getTime() + 6 * 60_000),
    );
    fireEvent.error(probe!);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("img").getAttribute("src")).toBe(firstUrl);
    expect(screen.getByRole("img").className).toContain("opacity-100");
  });
});

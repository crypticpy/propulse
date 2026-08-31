import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { solarImageUrl } from "@/lib/solar/mediaProducts";
import { SolarAnimationPlayer } from "./SolarAnimationPlayer";

describe("SolarAnimationPlayer", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps its mounted fallback until the next cadence image loads", () => {
    vi.useFakeTimers();
    const initial = new Date("2026-07-15T12:10:00.000Z");
    vi.setSystemTime(initial);
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <SolarAnimationPlayer
        animationId="drap-global"
        thumbnailProductId="drap-global"
        alt="Solar animation"
      />,
    );
    const firstUrl = solarImageUrl("drap-global", initial.getTime());
    expect(screen.getByRole("img").getAttribute("src")).toBe(firstUrl);
    fireEvent.load(screen.getByRole("img"));
    const firstManifestUrl = fetchMock.mock.calls[0]?.[0];
    expect(String(firstManifestUrl)).toContain("&refresh=");

    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
    });

    const probe = container.querySelector<HTMLImageElement>(
      "img[data-solar-image-probe]",
    );
    const replacementUrl = solarImageUrl(
      "drap-global",
      initial.getTime() + 6 * 60_000,
    );
    expect(probe?.getAttribute("src")).toBe(replacementUrl);
    expect(screen.getByRole("img").getAttribute("src")).toBe(firstUrl);
    fireEvent.error(probe!);
    expect(screen.getByRole("img").getAttribute("src")).toBe(firstUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).not.toBe(firstManifestUrl);
  });

  it("keeps active playback and usable frames through a failed cadence refresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:10:00.000Z"));
    const frames = [
      { url: "/solar-frame-1.png", time_tag: "2026-07-15T12:00:00Z" },
      { url: "/solar-frame-2.png", time_tag: "2026-07-15T12:05:00Z" },
    ];
    const fetchMock = vi
      .fn<(_input: RequestInfo | URL, _init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ frames }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new Error("temporary manifest failure"));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SolarAnimationPlayer
        animationId="drap-global"
        thumbnailProductId="drap-global"
        alt="Solar animation"
      />,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "/solar-frame-2.png",
    );
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(6 * 60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toMatch(
      /^\/solar-frame-[12]\.png$/,
    );
    expect(screen.queryByText("temporary manifest failure")).toBeNull();
  });
});

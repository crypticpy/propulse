import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { solarImageUrl } from "@/lib/solar/mediaProducts";
import { SolarImageCard } from "./SolarImageCard";

describe("SolarImageCard", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses a cadence-stable URL and advances it for explicit recovery", async () => {
    const now = new Date("2026-07-15T12:10:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(new Response(
          JSON.stringify({
            observedAt: "2026-07-15T12:00:00.000Z",
            checkedAt: "2026-07-15T12:01:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )),
      ),
    );
    const onOpen = vi.fn();
    const { container } = render(
      <SolarImageCard productId="sunspot-hmi" onOpen={onOpen} />,
    );

    const first = screen.getByAltText(/full solar disk/i);
    expect(first.getAttribute("src")).toBe(solarImageUrl("sunspot-hmi", now));
    fireEvent.error(first);
    expect(screen.getAllByText("Image temporarily unavailable")).toHaveLength(1);
    expect(container.querySelectorAll("img")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
    const retried = screen.getByAltText(/full solar disk/i);
    expect(retried.getAttribute("src")).toBe(
      solarImageUrl("sunspot-hmi", now, 1),
    );
    fireEvent.load(retried);

    await waitFor(() => {
      expect(screen.queryByText("Image temporarily unavailable")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByText("Stale")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Enlarge" }));
    expect(onOpen).toHaveBeenCalledWith("sunspot-hmi", false);
  });

  it("keeps the decoded image while probing later provider cache windows", () => {
    vi.useFakeTimers();
    const initial = new Date("2026-07-15T12:10:00.000Z");
    vi.setSystemTime(initial);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            observedAt: initial.toISOString(),
            checkedAt: initial.toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const { container } = render(
      <SolarImageCard productId="sunspot-hmi" onOpen={vi.fn()} />,
    );
    const image = screen.getByAltText(/full solar disk/i);
    const firstUrl = image.getAttribute("src");
    fireEvent.load(image);

    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
    });

    const failedProbe = container.querySelector<HTMLImageElement>(
      "img[data-solar-image-probe]",
    );
    expect(failedProbe?.getAttribute("src")).toBe(
      solarImageUrl("sunspot-hmi", initial.getTime() + 6 * 60_000),
    );
    expect(screen.getByAltText(/full solar disk/i).getAttribute("src")).toBe(
      firstUrl,
    );

    fireEvent.error(failedProbe!);
    expect(screen.queryByText("Image temporarily unavailable")).toBeNull();
    expect(screen.getByAltText(/full solar disk/i).getAttribute("src")).toBe(
      firstUrl,
    );

    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
    });
    const successfulProbe = container.querySelector<HTMLImageElement>(
      "img[data-solar-image-probe]",
    );
    const replacementUrl = solarImageUrl(
      "sunspot-hmi",
      initial.getTime() + 12 * 60_000,
    );
    expect(successfulProbe?.getAttribute("src")).toBe(replacementUrl);
    fireEvent.load(successfulProbe!);
    expect(screen.getByAltText(/full solar disk/i).getAttribute("src")).toBe(
      replacementUrl,
    );
  });

  it("keeps visible image age paired with the decoded cache window", async () => {
    vi.useFakeTimers();
    const initial = new Date("2026-07-15T12:10:00.000Z");
    vi.setSystemTime(initial);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            observedAt: "2026-07-15T12:00:00.000Z",
            checkedAt: initial.toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            observedAt: "2026-07-15T12:16:00.000Z",
            checkedAt: "2026-07-15T12:16:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <SolarImageCard productId="sunspot-hmi" onOpen={vi.fn()} />,
    );
    fireEvent.load(screen.getByAltText(/full solar disk/i));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Stale")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(6 * 60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    const probe = container.querySelector<HTMLImageElement>(
      "img[data-solar-image-probe]",
    );
    expect(probe).toBeTruthy();

    // Fresh metadata belongs to the candidate probe, not the stale image that
    // remains visible. A failed decode must leave both old artifacts paired.
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.queryByText("Current")).toBeNull();
    fireEvent.error(probe!);
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.queryByText("Current")).toBeNull();
  });

  it("hides a hard-expired scientific image from decision use", async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-07-15T12:00:00.000Z").getTime(),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            observedAt: "2026-07-15T10:00:00.000Z",
            checkedAt: "2026-07-15T12:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<SolarImageCard productId="drap-global" onOpen={vi.fn()} />);
    const image = screen.getByAltText(/global D-RAP/i);
    fireEvent.load(image);

    await waitFor(() => {
      expect(screen.getByText("Image is too old to use")).not.toBeNull();
    });
    expect(screen.getByText("unavailable")).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: "Enlarge" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(image.className).toContain("opacity-0");
  });

  it("does not claim an image is current when age metadata fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("unavailable", {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<SolarImageCard productId="synoptic-map" onOpen={vi.fn()} />);
    fireEvent.load(screen.getByAltText(/synoptic map/i));

    await waitFor(() => {
      expect(screen.getByText("Age unknown")).not.toBeNull();
    });
    expect(screen.queryByText("Current")).toBeNull();
    expect(screen.getByText(/timestamp temporarily unavailable/i)).not.toBeNull();
  });
});

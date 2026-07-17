import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolarImageCard } from "./SolarImageCard";

describe("SolarImageCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses a stable URL and recovers declaratively after a transient failure", async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-07-15T12:10:00.000Z").getTime(),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            observedAt: "2026-07-15T12:00:00.000Z",
            checkedAt: "2026-07-15T12:01:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const onOpen = vi.fn();
    const { container } = render(
      <SolarImageCard productId="sunspot-hmi" onOpen={onOpen} />,
    );

    const first = screen.getByAltText(/full solar disk/i);
    expect(first.getAttribute("src")).toBe("/api/solar/image?product=sunspot-hmi");
    fireEvent.error(first);
    expect(screen.getAllByText("Image temporarily unavailable")).toHaveLength(1);
    expect(container.querySelectorAll("img")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
    const retried = screen.getByAltText(/full solar disk/i);
    expect(retried.getAttribute("src")).toBe("/api/solar/image?product=sunspot-hmi");
    fireEvent.load(retried);

    await waitFor(() => {
      expect(screen.queryByText("Image temporarily unavailable")).toBeNull();
    });
    expect(screen.getByText("Stale")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enlarge" }));
    expect(onOpen).toHaveBeenCalledWith("sunspot-hmi", false);
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

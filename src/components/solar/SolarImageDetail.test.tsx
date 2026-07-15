import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolarImageDetail } from "./SolarImageDetail";

describe("SolarImageDetail", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps a stable URL and offers recovery when the full image fails", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<SolarImageDetail productId="drap-global" />);

    const image = screen.getByRole("img");
    expect(image.getAttribute("src")).toBe("/api/solar/image?product=drap-global");
    fireEvent.error(image);
    expect(screen.getByRole("alert").textContent).toContain("temporarily unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Retry now" }));
    const retriedImage = screen.getByRole("img");
    expect(retriedImage.getAttribute("src")).toBe("/api/solar/image?product=drap-global");
    fireEvent.load(retriedImage);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BandScope } from "@/components/dx/BandScope";

vi.mock("@/stores/wsjtxStore", () => ({
  useWSJTXStore: (selector: (s: unknown) => unknown) =>
    selector({
      decodes: [],
      status: null,
      connected: true,
    }),
}));

describe("BandScope", () => {
  it("renders a flex-column root with a flexible canvas container", () => {
    const { container } = render(<BandScope className="h-[200px]" />);

    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.className).toContain("flex");
    expect(root?.className).toContain("flex-col");
    expect(root?.className).toContain("overflow-hidden");

    // Canvas container must be the flexible child so it absorbs whatever
    // height the host gives, instead of a fixed h-[200px] block that
    // clips at any smaller mount height.
    const canvas = container.querySelector("canvas");
    const canvasContainer = canvas?.parentElement;
    expect(canvasContainer).not.toBeNull();
    expect(canvasContainer?.className).toContain("flex-1");
    expect(canvasContainer?.className).toContain("min-h-");
    expect(canvasContainer?.className).not.toContain("h-[200px]");
  });

  it("positive control: paints the SNR legend so it is never clipped out", () => {
    render(<BandScope className="h-[200px]" />);

    expect(screen.getByText(">0dB")).toBeTruthy();
    expect(screen.getByText("-10dB")).toBeTruthy();
    expect(screen.getByText("<-20")).toBeTruthy();
  });
});

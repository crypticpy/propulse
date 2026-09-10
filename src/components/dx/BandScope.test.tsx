import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BandScope } from "@/components/dx/BandScope";
import { findHoveredDecodeAtCssPoint } from "@/components/dx/bandScopeHitTest";
import type { WSJTXDecode } from "@/stores/wsjtxStore";

const mockStore = {
  decodes: [] as WSJTXDecode[],
  status: null as { frequency: number; mode: string } | null,
  connected: true,
};

vi.mock("@/stores/wsjtxStore", () => ({
  useWSJTXStore: (selector: (s: typeof mockStore) => unknown) =>
    selector(mockStore),
}));

describe("BandScope", () => {
  beforeEach(() => {
    mockStore.decodes = [];
    mockStore.status = null;
    mockStore.connected = true;
  });

  it("renders a flex-column root with a flexible canvas container", () => {
    const { container } = render(<BandScope className="h-[200px]" />);

    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root?.className).toContain("flex");
    expect(root?.className).toContain("flex-col");
    expect(root?.className).toContain("overflow-hidden");

    const canvas = container.querySelector("canvas");
    const canvasContainer = canvas?.parentElement;
    expect(canvasContainer).not.toBeNull();
    expect(canvasContainer?.className).toContain("flex-1");
    expect(canvasContainer?.className).toContain("min-h-[60px]");
    expect(canvasContainer?.className).not.toContain("h-[200px]");
  });

  it("positive control: renders the SNR legend row (presence, not painting; jsdom has no layout)", () => {
    render(<BandScope className="h-[200px]" />);

    expect(screen.getByText(">0dB")).toBeTruthy();
    expect(screen.getByText("-10dB")).toBeTruthy();
    expect(screen.getByText("<-20")).toBeTruthy();
  });
});

describe("findHoveredDecodeAtCssPoint", () => {
  const CSS_WIDTH = 400;
  const CSS_HEIGHT = 200;
  const now = 1_700_000_000_000;

  const decode: WSJTXDecode = {
    isNew: false,
    time: 0,
    snr: -3,
    deltaTime: 0,
    deltaFrequency: 1550,
    mode: "FT8",
    message: "K1ABC FN42",
    lowConfidence: false,
    callsign: "K1ABC",
    receivedAt: now,
  };

  it("finds a decode under a CSS coordinate at devicePixelRatio 2", () => {
    const cssX = 200;
    const cssY = 10;

    expect(
      findHoveredDecodeAtCssPoint(
        cssX,
        cssY,
        [decode],
        CSS_WIDTH,
        CSS_HEIGHT,
        now,
      )?.callsign,
    ).toBe("K1ABC");

    // Pre-fix bug: using the device bitmap width (800) doubles the x position.
    const deviceBitmapWidth = CSS_WIDTH * 2;
    const wrongX =
      ((decode.deltaFrequency - 100) / (3000 - 100)) * deviceBitmapWidth;
    expect(Math.hypot(cssX - wrongX, cssY)).toBeGreaterThan(20);
  });
});

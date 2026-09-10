import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CSSProperties, ReactNode } from "react";
import { SpotLabel } from "./SpotLabel";
import { GLOBE_DOM_LAYER_ORDER } from "@/lib/map/globeRenderOrder";
import { stationContrast } from "@/lib/themes/stationTokens";

vi.mock("@react-three/drei", () => ({
  Html: ({
    children,
    style,
    zIndexRange,
  }: {
    children: ReactNode;
    style?: CSSProperties;
    zIndexRange?: unknown;
  }) => (
    <div
      data-testid="html-overlay"
      data-zindexrange={JSON.stringify(zIndexRange)}
      style={style}
    >
      {children}
    </div>
  ),
}));

describe("SpotLabel selection", () => {
  it.each([3573, 5357, 14074])(
    "keeps hover and selection active at %s kHz regardless of band color",
    (frequency) => {
      const onHover = vi.fn();
      const onSelect = vi.fn();
      render(
        <SpotLabel
          lat={35.5}
          lon={-97.5}
          callsign="K5ABC"
          frequency={frequency}
          onHover={onHover}
          onSelect={onSelect}
        />,
      );
      const label = screen.getByRole("button", {
        name: "Select K5ABC as target",
      });

      fireEvent.mouseEnter(label);
      fireEvent.click(label);

      expect(onHover).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledOnce();
    },
  );

  it("selects the tag with accessible button semantics", () => {
    const onSelect = vi.fn();
    render(
      <SpotLabel lat={-22.5} lon={-43} callsign="PY2ABC" onSelect={onSelect} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select PY2ABC as target" }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it.each(["Enter", " "])("selects from the %j key", (key) => {
    const onSelect = vi.fn();
    render(<SpotLabel lat={0} lon={0} callsign="5N0CALL" onSelect={onSelect} />);
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Select 5N0CALL as target" }),
      { key },
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not let pointer or double-click events reach the map surface", () => {
    const onParentPointerDown = vi.fn();
    const onParentDoubleClick = vi.fn();
    const onSelect = vi.fn();
    render(
      <div onPointerDown={onParentPointerDown} onDoubleClick={onParentDoubleClick}>
        <SpotLabel lat={35.5} lon={139} callsign="JA1XYZ" onSelect={onSelect} />
      </div>,
    );
    const button = screen.getByRole("button", { name: "Select JA1XYZ as target" });
    fireEvent.pointerDown(button);
    fireEvent.doubleClick(button);
    expect(onParentPointerDown).not.toHaveBeenCalled();
    expect(onParentDoubleClick).not.toHaveBeenCalled();
  });

  it("releases hover ownership when a hovered label is dynamically removed", () => {
    const onHoverEnd = vi.fn();
    const { unmount } = render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        onHover={vi.fn()}
        onHoverEnd={onHoverEnd}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.mouseEnter(
      screen.getByRole("button", { name: "Select K5ABC as target" }),
    );

    unmount();

    expect(onHoverEnd).toHaveBeenCalledOnce();
  });

  it("does not release hover ownership when an untouched label is removed", () => {
    const onHoverEnd = vi.fn();
    const { unmount } = render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        onHoverEnd={onHoverEnd}
        onSelect={vi.fn()}
      />,
    );

    unmount();

    expect(onHoverEnd).not.toHaveBeenCalled();
  });
});

describe("SpotLabel DOM z-band assignment (#851)", () => {
  it("puts a passive (non-selected, non-hovered) tag in the passive-spot-label band", () => {
    render(<SpotLabel lat={35.5} lon={-97.5} callsign="K5ABC" />);
    const overlay = screen.getByTestId("html-overlay");
    expect(overlay.dataset.zindexrange).toBe(
      JSON.stringify(GLOBE_DOM_LAYER_ORDER.passiveSpotLabel),
    );
  });

  it("puts a selected tag in the pin band, not its own dedicated band", () => {
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        selected
        onSelect={vi.fn()}
      />,
    );
    const overlay = screen.getByTestId("html-overlay");
    expect(overlay.dataset.zindexrange).toBe(
      JSON.stringify(GLOBE_DOM_LAYER_ORDER.pinLabel),
    );
  });
});

describe("SpotLabel visible-face opacity floor (#851)", () => {
  function colorAlpha(rgba: string): number {
    // jsdom (like browsers) normalizes fully-opaque colors to `rgb(r, g, b)`
    // with no alpha channel at all, so a naive "last number" regex silently
    // reads the blue channel as alpha for opacity=1. Split on the channel
    // count instead: 4 channels means the last one is alpha.
    const channels = rgba
      .replace(/rgba?\(|\)/g, "")
      .split(",")
      .map((part) => Number(part.trim()));
    return channels.length === 4 ? channels[3] : 1;
  }

  it("floors combined opacity at 0.82 for opacity=0.4, occlusionOpacity=0.3", () => {
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={0.4}
        occlusionOpacity={0.3}
        onSelect={vi.fn()}
      />,
    );
    // 0.4 * 0.3 = 0.12 combined -- above the 0.05 hide threshold (still on
    // the visible face) but far below a legible text alpha without a floor.
    const button = screen.getByRole("button", { name: "Select K5ABC as target" });
    expect(colorAlpha(button.style.color)).toBeCloseTo(0.82, 5);
  });

  it("does not clamp opacity down when the natural combined value is already above the floor (positive control)", () => {
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={1}
        onSelect={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "Select K5ABC as target" });
    expect(colorAlpha(button.style.color)).toBeCloseTo(1, 5);
  });

  it("keeps text-vs-badge contrast at the floor at or above the 4.5:1 WCAG threshold over a worst-case bright globe canvas", () => {
    // Composite white text at the floor over the badge background at the
    // floor, over a worst-case white canvas (bright day-side ocean/cloud
    // tiles) -- the same math SpotLabel.tsx's floor comment documents.
    const FLOOR = 0.82;
    const badgeAlpha = 0.88 * FLOOR;
    const badgeOverCanvas = badgeAlpha * 10 + (1 - badgeAlpha) * 255; // r==g, badge rgb=(10,10,26)
    const badgeOverCanvasBlue = badgeAlpha * 26 + (1 - badgeAlpha) * 255;
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
    const effBgHex = `#${toHex(badgeOverCanvas)}${toHex(badgeOverCanvas)}${toHex(badgeOverCanvasBlue)}`;
    const effTextR = 255 * FLOOR + badgeOverCanvas * (1 - FLOOR);
    const effTextB = 255 * FLOOR + badgeOverCanvasBlue * (1 - FLOOR);
    const effTextHex = `#${toHex(effTextR)}${toHex(effTextR)}${toHex(effTextB)}`;

    expect(stationContrast(effTextHex, effBgHex)).toBeGreaterThanOrEqual(4.5);
  });

  it("still hides a fully-occluded far-side label regardless of the opacity floor", () => {
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0}
        onSelect={vi.fn()}
      />,
    );
    // combinedOpacity = 1 * 0 = 0, below the 0.05 hide threshold: the floor
    // must not resurrect a label that's behind the globe.
    const overlay = screen.getByTestId("html-overlay");
    expect(overlay.style.opacity).toBe("0");
    expect(overlay.style.pointerEvents).toBe("none");
    expect(
      screen.queryByRole("button", { name: "Select K5ABC as target" }),
    ).toBeNull();
  });
});

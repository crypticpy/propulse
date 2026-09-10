import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CSSProperties, ReactNode } from "react";
import { SpotLabel, TEXT_OCCLUSION_FLOOR } from "./SpotLabel";
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

  it("floors only the occlusion term at TEXT_OCCLUSION_FLOOR, preserving full-strength caller opacity", () => {
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.3}
        onSelect={vi.fn()}
      />,
    );
    // occlusionOpacity=0.3 is below TEXT_OCCLUSION_FLOOR (0.5); textOpacity
    // should be max(0.3, FLOOR) * opacity = FLOOR * 1.
    const button = screen.getByRole("button", { name: "Select K5ABC as target" });
    expect(colorAlpha(button.style.color)).toBeCloseTo(TEXT_OCCLUSION_FLOOR, 5);
  });

  it("does NOT erase caller-supplied opacity de-emphasis (age/band/contact/spotter dimming)", () => {
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
    // The old bug: flooring the PRODUCT would push this all the way up to
    // 0.82, erasing the caller's 0.4 de-emphasis (active-band filter,
    // contact posture, or the spotter tag's flat 0.6 discount). Flooring
    // only the occlusion term keeps the de-emphasis visible:
    // max(0.3, FLOOR) * 0.4 = FLOOR * 0.4, well below the old 0.82 value.
    const button = screen.getByRole("button", { name: "Select K5ABC as target" });
    const alpha = colorAlpha(button.style.color);
    expect(alpha).toBeCloseTo(TEXT_OCCLUSION_FLOOR * 0.4, 5);
    expect(alpha).toBeLessThan(0.82);
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

  it("keeps text-vs-badge contrast at TEXT_OCCLUSION_FLOOR at or above the 4.5:1 WCAG threshold over the real dark canvas", () => {
    // Composite white text at the floor over the badge background at the
    // floor, over the app's actual dark canvas backdrop (`--su-canvas`,
    // `DARK_CANVAS_HEX` in src/lib/themes/stationTokens.ts) -- the same
    // math SpotLabel.tsx's floor comment documents. This reads the REAL
    // exported constant, not a locally re-declared one: lowering
    // TEXT_OCCLUSION_FLOOR below the ~0.445 breakeven makes this fail.
    const DARK_CANVAS_HEX = "#141827";
    const canvasR = 0x14;
    const canvasG = 0x18;
    const canvasB = 0x27;
    const badgeAlpha = 0.88 * TEXT_OCCLUSION_FLOOR;
    const badgeR = badgeAlpha * 10 + (1 - badgeAlpha) * canvasR;
    const badgeG = badgeAlpha * 10 + (1 - badgeAlpha) * canvasG;
    const badgeB = badgeAlpha * 26 + (1 - badgeAlpha) * canvasB;
    const toHex = (n: number) =>
      Math.round(n).toString(16).padStart(2, "0");
    const effBgHex = `#${toHex(badgeR)}${toHex(badgeG)}${toHex(badgeB)}`;
    const effTextR = 255 * TEXT_OCCLUSION_FLOOR + badgeR * (1 - TEXT_OCCLUSION_FLOOR);
    const effTextG = 255 * TEXT_OCCLUSION_FLOOR + badgeG * (1 - TEXT_OCCLUSION_FLOOR);
    const effTextB = 255 * TEXT_OCCLUSION_FLOOR + badgeB * (1 - TEXT_OCCLUSION_FLOOR);
    const effTextHex = `#${toHex(effTextR)}${toHex(effTextG)}${toHex(effTextB)}`;

    expect(DARK_CANVAS_HEX).toBe("#141827"); // sanity: matches stationTokens.ts
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

describe("SpotLabel pop-in fade ramp (#851)", () => {
  // The wrapper used to snap opacity 0->1 at the 0.05 hide threshold, so a
  // tag crossing the limb visibly popped in instead of fading. It now ramps
  // linearly across combinedOpacity in [0.05, 0.25].
  it("is fully transparent right at the hide threshold", () => {
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.05}
      />,
    );
    const overlay = screen.getByTestId("html-overlay");
    expect(Number(overlay.style.opacity)).toBeCloseTo(0, 5);
  });

  it("is roughly half-visible halfway through the fade band", () => {
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.15}
      />,
    );
    const overlay = screen.getByTestId("html-overlay");
    expect(Number(overlay.style.opacity)).toBeCloseTo(0.5, 5);
  });

  it("is fully opaque at and above the top of the fade band", () => {
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.25}
      />,
    );
    const overlay = screen.getByTestId("html-overlay");
    expect(Number(overlay.style.opacity)).toBeCloseTo(1, 5);
  });

  it("does not exceed 1 above the fade band (positive control)", () => {
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={1}
      />,
    );
    const overlay = screen.getByTestId("html-overlay");
    expect(Number(overlay.style.opacity)).toBeCloseTo(1, 5);
  });
});

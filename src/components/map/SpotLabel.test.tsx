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

  it("puts a selected tag in its own dedicated activeSpotLabel band, not pinLabel (#851, round 11)", () => {
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
    // Sharing pinLabel with saved pins let drei's per-element camera-distance
    // tie-break put a nearer pin above a farther promoted tag. A promoted
    // spot tag now uses its own band, strictly above pinLabel.
    expect(overlay.dataset.zindexrange).toBe(
      JSON.stringify(GLOBE_DOM_LAYER_ORDER.activeSpotLabel),
    );
  });

  it("keeps activeSpotLabel strictly above pinLabel (#851, round 11)", () => {
    expect(GLOBE_DOM_LAYER_ORDER.activeSpotLabel[1]).toBeGreaterThan(
      GLOBE_DOM_LAYER_ORDER.pinLabel[0],
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
        opacity={0.9}
        occlusionOpacity={0.3}
        onSelect={vi.fn()}
      />,
    );
    // The old bug (pre-#851): flooring the PRODUCT against a single high
    // floor would push this all the way up to 0.82, erasing the caller's
    // 0.9 de-emphasis (active-band filter, contact posture, or the spotter
    // tag's flat 0.6 discount). Flooring the occlusion term first keeps the
    // de-emphasis visible: max(0.3, TEXT_OCCLUSION_FLOOR) * 0.9 = FLOOR *
    // 0.9 = 0.45, comfortably above round 10's FINAL_ALPHA_FLOOR (0.35) so
    // that floor doesn't engage here and mask what this test is proving.
    const button = screen.getByRole("button", { name: "Select K5ABC as target" });
    const alpha = colorAlpha(button.style.color);
    expect(alpha).toBeCloseTo(TEXT_OCCLUSION_FLOOR * 0.9, 5);
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
    const overlay = screen.getByTestId("spot-label-wrapper");
    expect(overlay.style.opacity).toBe("0");
    expect(overlay.style.pointerEvents).toBe("none");
    expect(
      screen.queryByRole("button", { name: "Select K5ABC as target" }),
    ).toBeNull();
  });

  it("round 10: the combined rendered alpha never drops below 0.35 for a visible label with stacked tiny caller opacity", () => {
    // LiveSpotArcs' real off-band-spotter case: contact posture (0.35) *
    // active-band filter (0.3) * the flat spotter-tag discount (0.6) =
    // 0.063. At occlusionOpacity=1 (fully on the near side, so
    // TEXT_OCCLUSION_FLOOR never engages), the pre-round-10 formula emitted
    // textOpacity = 1 * 0.063 = 0.063 -- about 1.18:1 contrast, well under
    // WCAG. FINAL_ALPHA_FLOOR backstops the combined product itself.
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={0.6 * 0.3 * 0.35}
        occlusionOpacity={1}
        onSelect={vi.fn()}
      />,
    );
    const button = screen.getByRole("button", { name: "Select K5ABC as target" });
    const alpha = colorAlpha(button.style.color);
    expect(alpha).toBeCloseTo(0.35, 5);
    expect(alpha).toBeGreaterThanOrEqual(0.35);

    // The floor must not resurrect a fully-occluded far-side label: the
    // wrapper's own CSS opacity (occlusion-driven hide/show, independent of
    // this alpha floor) still collapses to 0 and multiplies with it during
    // compositing.
    const overlay = screen.getByTestId("spot-label-wrapper");
    expect(Number(overlay.style.opacity)).toBeGreaterThan(0);
  });
});

describe("SpotLabel pop-in fade ramp (#851)", () => {
  // The wrapper used to snap opacity 0->1 at the 0.05 hide threshold, so a
  // tag crossing the limb visibly popped in instead of fading. It now ramps
  // linearly across OCCLUSION opacity in [0.05, 0.25] -- not the combined
  // (opacity * occlusionOpacity) value. Keying on the combined value was a
  // second-pass-review blocker (B1): it re-coupled the caller's de-emphasis
  // opacity into the wrapper, so a fully-visible (occlusionOpacity===1) but
  // de-emphasised tag (e.g. an off-band spotter at opacity=0.18) would have
  // rendered at wrapper 0.65 and effective ink ~0.12 -- far dimmer than
  // main's flat 0.35 floor. The two tests below pin that down directly.
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
    const overlay = screen.getByTestId("spot-label-wrapper");
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
    const overlay = screen.getByTestId("spot-label-wrapper");
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
    const overlay = screen.getByTestId("spot-label-wrapper");
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
    const overlay = screen.getByTestId("spot-label-wrapper");
    expect(Number(overlay.style.opacity)).toBeCloseTo(1, 5);
  });

  it("B1: a de-emphasised but fully-unoccluded tag keeps a fully-opaque wrapper", () => {
    // opacity=0.18 mirrors LiveSpotArcs.tsx's off-band spotter case
    // (0.6 * filterOpacity where filterOpacity ~= 0.3). occlusionOpacity=1
    // means the tag is on the fully visible face -- the ramp must not dim
    // it at all; only the (already floored) text alpha carries the
    // de-emphasis.
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={0.18}
        occlusionOpacity={1}
      />,
    );
    const overlay = screen.getByTestId("spot-label-wrapper");
    expect(Number(overlay.style.opacity)).toBeCloseTo(1, 5);
  });

  it("B1: the ramp still varies with occlusion regardless of caller opacity", () => {
    // occlusionOpacity=0.15 is mid-band (combinedOpacity = 0.15 here, but
    // the ramp must read occlusionOpacity, not combinedOpacity -- a low
    // caller opacity must not push the wrapper toward 0 on its own).
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.15}
      />,
    );
    const overlay = screen.getByTestId("spot-label-wrapper");
    const value = Number(overlay.style.opacity);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });

  it("B2: a de-emphasised tag fades smoothly instead of popping (round-5 fix)", () => {
    // opacity=0.18 mirrors the real off-band-spotter value from LiveSpotArcs.
    // Before the fix, `isVisible` (and therefore the wrapper) was gated on
    // combinedOpacity (opacity * occlusionOpacity), which for opacity=0.18
    // doesn't clear HIDE_THRESHOLD (0.05) until occlusion ~0.278 -- already
    // past FADE_IN_END (0.25) -- so the wrapper jumped straight from 0 to 1
    // the instant it became visible. `isVisible` now shares the ramp's
    // occlusion-only domain, so the sweep below must be monotone and never
    // jump by more than one ramp step (max step size here is 0.05 / 0.20 =
    // 0.25, the sweep's own occlusion increment over the ramp width).
    const samples = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
    const values = samples.map((occlusionOpacity) => {
      const { unmount } = render(
        <SpotLabel
          lat={35.5}
          lon={-97.5}
          callsign="K5ABC"
          opacity={0.18}
          occlusionOpacity={occlusionOpacity}
        />,
      );
      const overlay = screen.getByTestId("spot-label-wrapper");
      const value = Number(overlay.style.opacity);
      unmount();
      return value;
    });

    const maxRampStep = 0.05 / (0.25 - 0.05); // 0.25, one sample increment
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
      expect(values[i] - values[i - 1]).toBeLessThanOrEqual(
        maxRampStep + 1e-9,
      );
    }
    expect(values[0]).toBeCloseTo(0, 5);
    expect(values[values.length - 1]).toBeCloseTo(1, 5);
  });
});

describe("SpotLabel pointer hit-testing threshold (#851, round 7)", () => {
  // CSS `opacity` does not remove hit testing. Before this fix, `receivesPointer`
  // was gated on the same HIDE_THRESHOLD (0.05) as `isVisible`, so right at
  // occlusionOpacity===HIDE_THRESHOLD -- and briefly during the 0.3s opacity
  // transition on every threshold crossing -- the wrapper had `pointerEvents:
  // "auto"` while its rendered opacity was still 0 (or near it): an invisible
  // label could intercept globe clicks/drags. `receivesPointer` now gates on
  // POINTER_ENABLE_THRESHOLD (== FADE_IN_END, 0.25), the point at which
  // wrapperOpacity reaches exactly 1, so pointer events can never turn on
  // while the label is still fading in.
  const FADE_IN_END = 0.25;

  it("sweep: pointerEvents is none wherever wrapperOpacity < 1, auto at and above FADE_IN_END", () => {
    const samples = [0.05, 0.1, 0.15, 0.2, 0.24, 0.25, 0.3];
    for (const occlusionOpacity of samples) {
      const { unmount } = render(
        <SpotLabel
          lat={35.5}
          lon={-97.5}
          callsign="K5ABC"
          opacity={1}
          occlusionOpacity={occlusionOpacity}
          onSelect={vi.fn()}
        />,
      );
      const overlay = screen.getByTestId("spot-label-wrapper");
      const wrapperOpacity = Number(overlay.style.opacity);
      if (occlusionOpacity >= FADE_IN_END) {
        expect(wrapperOpacity).toBeCloseTo(1, 5);
        expect(overlay.style.pointerEvents).toBe("auto");
      } else {
        expect(wrapperOpacity).toBeLessThan(1);
        expect(overlay.style.pointerEvents).toBe("none");
      }
      unmount();
    }
  });

  it("at exactly HIDE_THRESHOLD the label is isVisible (mounted) but not pointer-reachable", () => {
    const HIDE_THRESHOLD = 0.05;
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={HIDE_THRESHOLD}
        onSelect={vi.fn()}
      />,
    );
    const overlay = screen.getByTestId("spot-label-wrapper");
    // isVisible is true here (occlusionOpacity >= HIDE_THRESHOLD), so the
    // label mounts and is present -- but wrapperOpacity is exactly 0 and
    // pointerEvents must be "none": this is precisely the mismatch window
    // the fix closes.
    expect(Number(overlay.style.opacity)).toBeCloseTo(0, 5);
    expect(overlay.style.pointerEvents).toBe("none");
  });
});

describe("SpotLabel pointer/keyboard readiness waits for the fade transition (#851, round 8)", () => {
  // Round 7 closed the gap between isVisible (HIDE_THRESHOLD) and
  // receivesPointer (POINTER_ENABLE_THRESHOLD). Codex found a residual gap:
  // receivesPointer flips true the instant occlusionOpacity crosses
  // POINTER_ENABLE_THRESHOLD, in the SAME render the wrapper's *target*
  // opacity becomes 1 -- but the wrapper has `opacity 0.3s ease`, so its
  // *rendered* opacity can stay below 1 (starting at 0) for up to 300ms
  // after that. `pointerReady` (gated on the wrapper's own `onTransitionEnd`)
  // closes that: these tests drive it with `fireEvent.transitionEnd`, since
  // jsdom has no real CSS transition engine to fire it on a timer.

  it("thread 1: keeps pointerEvents 'none' through the transition, then 'auto' once it ends", () => {
    const { rerender } = render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.1}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("spot-label-wrapper").style.pointerEvents).toBe(
      "none",
    );

    rerender(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={1}
        onSelect={vi.fn()}
      />,
    );
    // receivesPointer just flipped true (occlusionOpacity=1 >=
    // POINTER_ENABLE_THRESHOLD), but the opacity transition hasn't fired
    // its end event yet -- pointerReady must not have caught up.
    let overlay = screen.getByTestId("spot-label-wrapper");
    expect(overlay.style.pointerEvents).toBe("none");

    fireEvent.transitionEnd(overlay, { propertyName: "opacity" });
    overlay = screen.getByTestId("spot-label-wrapper");
    expect(overlay.style.pointerEvents).toBe("auto");
  });

  it("thread 1: resets pointerEvents to 'none' immediately when receivesPointer goes false again, with no transition wait", () => {
    const { rerender } = render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={1}
        onSelect={vi.fn()}
      />,
    );
    // Mounts already fully visible: no fade-in transition to wait for.
    expect(screen.getByTestId("spot-label-wrapper").style.pointerEvents).toBe(
      "auto",
    );

    rerender(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.1}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId("spot-label-wrapper").style.pointerEvents).toBe(
      "none",
    );
  });

  it("thread 1: a transitionend for an unrelated property does not flip pointerReady early", () => {
    const { rerender } = render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.1}
        onSelect={vi.fn()}
      />,
    );
    rerender(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={1}
        onSelect={vi.fn()}
      />,
    );
    const overlay = screen.getByTestId("spot-label-wrapper");
    fireEvent.transitionEnd(overlay, { propertyName: "transform" });
    expect(overlay.style.pointerEvents).toBe("none");
  });

  it("thread 2: withholds the focusable button while below POINTER_ENABLE_THRESHOLD, even though isVisible", () => {
    render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.15}
        onSelect={vi.fn()}
      />,
    );
    // isVisible (HIDE_THRESHOLD=0.05) is true here -- the wrapper is
    // ramping in -- but the button must not exist/be tabbable yet.
    expect(
      screen.queryByRole("button", { name: "Select K5ABC as target" }),
    ).toBeNull();
    const overlay = screen.getByTestId("spot-label-wrapper");
    expect(Number(overlay.style.opacity)).toBeGreaterThan(0);
  });

  it("thread 2: still withholds the button mid-transition, then renders it once the transition ends", () => {
    const { rerender } = render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.1}
        onSelect={vi.fn()}
      />,
    );
    rerender(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={1}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Select K5ABC as target" }),
    ).toBeNull();

    fireEvent.transitionEnd(screen.getByTestId("spot-label-wrapper"), {
      propertyName: "opacity",
    });
    expect(
      screen.getByRole("button", { name: "Select K5ABC as target" }),
    ).not.toBeNull();
  });

  it("thread 3: the outer Html wrapper's own pointer-events follows interactionReady, not just the inner div's", () => {
    const { rerender } = render(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={0.1}
        onSelect={vi.fn()}
      />,
    );
    // Below POINTER_ENABLE_THRESHOLD: drei's own outer wrapper (mocked as
    // html-overlay) must also be pointer-events: none, not just the inner
    // spot-label-wrapper div -- otherwise its default auto still hit-tests
    // and blocks globe drags underneath a hidden/fading label (#851, r9).
    const outerWrapper = screen.getByTestId("html-overlay");
    expect(outerWrapper.style.pointerEvents).toBe("none");

    rerender(
      <SpotLabel
        lat={35.5}
        lon={-97.5}
        callsign="K5ABC"
        opacity={1}
        occlusionOpacity={1}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.transitionEnd(screen.getByTestId("spot-label-wrapper"), {
      propertyName: "opacity",
    });
    expect(screen.getByTestId("html-overlay").style.pointerEvents).toBe(
      "auto",
    );
  });
});

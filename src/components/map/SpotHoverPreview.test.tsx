import { useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import { SpotHoverPreview } from "./SpotHoverPreview";

vi.mock("@/hooks/useSpotPathPresentation", () => ({
  useSpotPathPresentation: () => ({
    difficulty: 1,
    distanceKm: 1520,
    bearing: 231,
    optimalSignal: {
      band: "12m",
      status: "excellent",
      sUnit: { value: 9, text: "S9+5", dBm: -68 },
      confidence: 85,
      notes: "Skip zone, MUF exceeded at hop 1",
    },
  }),
}));

const spot: LiveSpot = {
  id: "spot-1",
  spotter: "W1AW",
  dx: "KA1VRY",
  dxGrid: "EM08PX",
  dxLat: 38.5,
  dxLon: -97.5,
  frequency: 24915,
  mode: "FT8",
  band: "12m",
  comment: "CQ POTA US-7948",
  time: new Date("2026-08-31T12:00:00Z"),
  source: "PSKReporter",
};

describe("SpotHoverPreview", () => {
  afterEach(() => vi.useRealTimers());

  it("renders the reference propagation treatment for an individual spot", () => {
    render(
      <SpotHoverPreview
        visible
        position={{ x: 300, y: 300, width: 90, height: 22 }}
        spot={spot}
        displayTime={new Date("2026-08-31T12:00:00Z")}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByText("KA1VRY · POTA US-7948")).toBeTruthy();
    expect(screen.getByText("EM08PX")).toBeTruthy();
    expect(screen.getByText("PSKReporter · W1AW → KA1VRY")).toBeTruthy();
    expect(screen.getByText("Easy")).toBeTruthy();
    expect(screen.getByText("EXCELLENT")).toBeTruthy();
    expect(screen.getByText("S9+5")).toBeTruthy();
    expect(screen.getByText("85%")).toBeTruthy();
    expect(screen.getByText("1,520 km")).toBeTruthy();
    const preview = screen.getByRole("button", {
      name: /Open spot details for KA1VRY/i,
    });
    expect(preview.className).toContain("bg-gray-950");
    expect(preview.className).not.toContain("backdrop-blur");
  });

  it("uses the map-owned portal layer when one is supplied", () => {
    const portalTarget = document.createElement("div");
    portalTarget.dataset.testid = "map-overlay-portal";
    document.body.appendChild(portalTarget);
    vi.spyOn(portalTarget, "getBoundingClientRect").mockReturnValue({
      x: 400,
      y: 80,
      left: 400,
      top: 80,
      width: 800,
      height: 640,
      right: 1200,
      bottom: 720,
      toJSON: () => ({}),
    });

    render(
      <SpotHoverPreview
        visible
        portalTarget={portalTarget}
        position={{ x: 900, y: 360, width: 80, height: 22 }}
        spot={spot}
        displayTime={new Date("2026-08-31T12:00:00Z")}
        onActivate={vi.fn()}
      />,
    );

    const preview = portalTarget.querySelector(
      '[aria-label*="Open spot details"]',
    );
    expect(preview).not.toBeNull();
    expect(preview).toBeInstanceOf(HTMLElement);
    const el = preview as HTMLElement;
    expect(el.className).toContain("absolute");
    expect(el.className).not.toContain("fixed");
    expect(el.style.left).toBe("410px");
    portalTarget.remove();
  });

  it("owns pointer and keyboard activation without leaking to the map", () => {
    const onInteractStart = vi.fn();
    const onInteractEnd = vi.fn();
    const onActivate = vi.fn();
    const onMapClick = vi.fn();
    document.addEventListener("click", onMapClick);
    render(
      <SpotHoverPreview
        visible
        position={{ x: 300, y: 300, width: 90, height: 22 }}
        spot={spot}
        displayTime={new Date("2026-08-31T12:00:00Z")}
        onInteractStart={onInteractStart}
        onInteractEnd={onInteractEnd}
        onActivate={onActivate}
      />,
    );
    const preview = screen.getByRole("button", {
      name: /Open spot details for KA1VRY/i,
    });

    fireEvent.pointerEnter(preview);
    fireEvent.pointerLeave(preview);
    fireEvent.focus(preview);
    fireEvent.blur(preview);
    fireEvent.click(preview);
    fireEvent.keyDown(preview, { key: "Enter" });

    expect(onInteractStart).toHaveBeenNthCalledWith(1, "pointer");
    expect(onInteractStart).toHaveBeenNthCalledWith(2, "focus");
    expect(onInteractEnd).toHaveBeenNthCalledWith(1, "pointer");
    expect(onInteractEnd).toHaveBeenNthCalledWith(2, "focus");
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onMapClick).not.toHaveBeenCalled();
    document.removeEventListener("click", onMapClick);
  });

  it("can bridge a delayed label leave into the interactive preview", () => {
    vi.useFakeTimers();

    function Harness() {
      const [visible, setVisible] = useState(true);
      const dismissRef = useRef<number | null>(null);
      const cancel = () => {
        if (dismissRef.current !== null) {
          window.clearTimeout(dismissRef.current);
          dismissRef.current = null;
        }
      };
      const dismiss = () => {
        if (dismissRef.current !== null) return;
        dismissRef.current = window.setTimeout(() => {
          setVisible(false);
          dismissRef.current = null;
        }, 180);
      };
      return (
        <>
          <button type="button" onPointerLeave={dismiss}>
            KA1VRY tag
          </button>
          <SpotHoverPreview
            visible={visible}
            position={{ x: 300, y: 300, width: 90, height: 22 }}
            spot={visible ? spot : null}
            displayTime={new Date("2026-08-31T12:00:00Z")}
            onInteractStart={cancel}
            onInteractEnd={dismiss}
            onActivate={vi.fn()}
          />
        </>
      );
    }

    render(<Harness />);
    fireEvent.pointerLeave(screen.getByRole("button", { name: "KA1VRY tag" }));
    vi.advanceTimersByTime(100);
    fireEvent.pointerEnter(
      screen.getByRole("button", { name: /Open spot details for KA1VRY/i }),
    );
    act(() => vi.advanceTimersByTime(200));

    expect(screen.getByText("KA1VRY · POTA US-7948")).toBeTruthy();

    fireEvent.pointerLeave(
      screen.getByRole("button", { name: /Open spot details for KA1VRY/i }),
    );
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText("KA1VRY · POTA US-7948")).toBeNull();
  });
});

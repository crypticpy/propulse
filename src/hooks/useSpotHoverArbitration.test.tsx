import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import {
  spotHoverAnchorsOverlap,
  useSpotHoverArbitration,
  type SpotHoverInteraction,
} from "./useSpotHoverArbitration";

const spotA: LiveSpot = {
  id: "spot-a",
  spotter: "W1AW",
  dx: "K1AAA",
  frequency: 14074,
  mode: "FT8",
  comment: "",
  time: new Date("2026-09-01T12:00:00Z"),
  source: "PSKReporter",
};

const spotB: LiveSpot = {
  ...spotA,
  id: "spot-b",
  dx: "K1BBB",
};

const spotC: LiveSpot = {
  ...spotA,
  id: "spot-c",
  dx: "K1CCC",
};

const endpointA: SpotHoverInteraction = {
  surface: "endpoint",
  interactionId: "endpoint:spot-a",
};
const endpointB: SpotHoverInteraction = {
  surface: "endpoint",
  interactionId: "endpoint:spot-b",
};
const endpointC: SpotHoverInteraction = {
  surface: "endpoint",
  interactionId: "endpoint:spot-c",
};

describe("useSpotHoverArbitration", () => {
  afterEach(() => vi.useRealTimers());

  it("hands directly to a pending overlap without a hidden frame", () => {
    const { result } = renderHook(() => useSpotHoverArbitration());

    act(() => {
      result.current.handleSpotHover(spotA, { x: 100, y: 100 }, endpointA);
      result.current.handleSpotHover(spotB, { x: 102, y: 101 }, endpointB);
    });
    expect(result.current.hoveredSpotData?.spot.id).toBe("spot-a");

    act(() => result.current.handleSpotHoverEnd(spotA, endpointA));
    expect(result.current.hoveredSpotData?.spot.id).toBe("spot-b");
  });

  it("uses a stable key instead of event order for equal-priority overlaps", () => {
    const { result } = renderHook(() => useSpotHoverArbitration());

    act(() => {
      result.current.handleSpotHover(spotB, { x: 100, y: 100 }, endpointB);
      result.current.handleSpotHover(spotA, { x: 101, y: 101 }, endpointA);
      result.current.handleSpotHover(spotB, { x: 102, y: 102 }, endpointB);
    });

    expect(result.current.hoveredSpotData?.spot.id).toBe("spot-a");
  });

  it("retains every active overlap when a later candidate leaves first", () => {
    const { result } = renderHook(() => useSpotHoverArbitration());

    act(() => {
      result.current.handleSpotHover(spotA, { x: 100, y: 100 }, endpointA);
      result.current.handleSpotHover(spotB, { x: 101, y: 101 }, endpointB);
      result.current.handleSpotHover(spotC, { x: 102, y: 102 }, endpointC);
      result.current.handleSpotHoverEnd(spotC, endpointC);
      result.current.handleSpotHoverEnd(spotA, endpointA);
    });

    expect(result.current.hoveredSpotData?.spot.id).toBe("spot-b");
  });

  it("recomputes a deterministic winner from all remaining candidates", () => {
    const { result } = renderHook(() => useSpotHoverArbitration());

    act(() => {
      result.current.handleSpotHover(spotA, { x: 100, y: 100 }, endpointA);
      result.current.handleSpotHover(spotC, { x: 102, y: 102 }, endpointC);
      result.current.handleSpotHover(spotB, { x: 101, y: 101 }, endpointB);
      result.current.handleSpotHoverEnd(spotA, endpointA);
    });

    expect(result.current.hoveredSpotData?.spot.id).toBe("spot-b");
  });

  it("keeps a duplicate concrete endpoint active when its sibling leaves", () => {
    const { result } = renderHook(() => useSpotHoverArbitration());
    const duplicateEndpoint: SpotHoverInteraction = {
      surface: "endpoint",
      interactionId: "endpoint:spot-a:duplicate",
    };

    act(() => {
      result.current.handleSpotHover(spotA, { x: 100, y: 100 }, endpointA);
      result.current.handleSpotHover(
        spotA,
        { x: 100, y: 100 },
        duplicateEndpoint,
      );
      result.current.handleSpotHoverEnd(spotA, endpointA);
    });

    expect(result.current.hoveredSpotData?.spot.id).toBe("spot-a");
  });

  it.each([2, 5, 20, 50])(
    "keeps one deterministic owner across %i co-located endpoints",
    (count) => {
      const { result } = renderHook(() => useSpotHoverArbitration());
      const spots = Array.from({ length: count }, (_, index) => ({
        ...spotA,
        id: `dense-${index.toString().padStart(2, "0")}`,
        dx: `K1${index.toString().padStart(2, "0")}`,
      }));

      act(() => {
        for (const spot of [...spots].reverse()) {
          result.current.handleSpotHover(
            spot,
            { x: 100, y: 100 },
            {
              surface: "endpoint",
              interactionId: `endpoint:${spot.id}`,
            },
          );
        }
      });

      expect(result.current.hoveredSpotData?.spot.id).toBe("dense-00");
    },
  );

  it("promotes a label over endpoint hit areas for the same report", () => {
    const { result } = renderHook(() => useSpotHoverArbitration());
    const label: SpotHoverInteraction = {
      surface: "label",
      interactionId: "label:spot-a",
    };

    act(() => {
      result.current.handleSpotHover(spotA, { x: 100, y: 100 }, endpointA);
      result.current.handleSpotHover(
        spotA,
        { x: 90, y: 80, width: 80, height: 22 },
        label,
      );
    });

    expect(result.current.hoveredSpotData?.screenPos).toEqual({
      x: 90,
      y: 80,
      width: 80,
      height: 22,
    });

    act(() => result.current.handleSpotHoverEnd(spotA, endpointA));
    expect(result.current.hoveredSpotData?.spot.id).toBe("spot-a");
  });

  it("ignores a stale leave from a previous owner", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSpotHoverArbitration());

    act(() => {
      result.current.handleSpotHover(spotA, { x: 100, y: 100 }, endpointA);
      result.current.handleSpotHoverEnd(spotA, endpointA);
      result.current.handleSpotHover(spotB, { x: 180, y: 180 }, endpointB);
      result.current.handleSpotHoverEnd(spotA, endpointA);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.hoveredSpotData?.spot.id).toBe("spot-b");
  });

  it("keeps the preview alive while the pointer transits into it", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSpotHoverArbitration());

    act(() => {
      result.current.handleSpotHover(spotA, { x: 100, y: 100 }, endpointA);
      result.current.handleSpotHoverEnd(spotA, endpointA);
      vi.advanceTimersByTime(100);
      result.current.holdSpotHoverForPreview("pointer");
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hoveredSpotData?.spot.id).toBe("spot-a");

    act(() => {
      result.current.releaseSpotHoverFromPreview("pointer");
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hoveredSpotData).toBeNull();
  });

  it("keeps a focused preview alive after its pointer leaves", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSpotHoverArbitration());

    act(() => {
      result.current.handleSpotHover(spotA, { x: 100, y: 100 }, endpointA);
      result.current.handleSpotHoverEnd(spotA, endpointA);
      result.current.holdSpotHoverForPreview("pointer");
      result.current.holdSpotHoverForPreview("focus");
      result.current.releaseSpotHoverFromPreview("pointer");
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hoveredSpotData?.spot.id).toBe("spot-a");

    act(() => {
      result.current.releaseSpotHoverFromPreview("focus");
      vi.advanceTimersByTime(300);
    });
    expect(result.current.hoveredSpotData).toBeNull();
  });
});

describe("spotHoverAnchorsOverlap", () => {
  it("recognizes nearby endpoints and intersecting label bounds", () => {
    expect(
      spotHoverAnchorsOverlap({ x: 100, y: 100 }, { x: 110, y: 108 }),
    ).toBe(true);
    expect(
      spotHoverAnchorsOverlap({ x: 100, y: 100 }, { x: 140, y: 140 }),
    ).toBe(false);
    expect(
      spotHoverAnchorsOverlap(
        { x: 100, y: 100, width: 80, height: 22 },
        { x: 175, y: 105, width: 70, height: 22 },
      ),
    ).toBe(true);
  });
});

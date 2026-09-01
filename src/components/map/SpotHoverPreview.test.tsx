import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  it("renders the reference propagation treatment for an individual spot", () => {
    render(
      <SpotHoverPreview
        visible
        position={{ x: 300, y: 300, width: 90, height: 22 }}
        spot={spot}
        displayTime={new Date("2026-08-31T12:00:00Z")}
      />,
    );

    expect(screen.getByText("KA1VRY · POTA US-7948")).toBeTruthy();
    expect(screen.getByText("EM08PX")).toBeTruthy();
    expect(screen.getByText("Easy")).toBeTruthy();
    expect(screen.getByText("EXCELLENT")).toBeTruthy();
    expect(screen.getByText("S9+5")).toBeTruthy();
    expect(screen.getByText("85%")).toBeTruthy();
    expect(screen.getByText("1,520 km")).toBeTruthy();
  });
});

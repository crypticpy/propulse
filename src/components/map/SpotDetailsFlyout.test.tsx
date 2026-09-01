import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpotDetailsFlyout } from "./SpotDetailsFlyout";

vi.mock("@/hooks/useFeasibility", () => ({
  useFeasibility: () => ({ level: "unlikely", isGrayline: false }),
}));

vi.mock("@/stores/userStore", () => ({
  useUserStore: () => ({ station: null }),
}));

describe("SpotDetailsFlyout", () => {
  it("shows comments and marks prefix-derived coordinates as approximate", () => {
    render(
      <SpotDetailsFlyout
        visible
        position={{ x: 100, y: 100 }}
        spot={{
          callsign: "ZS1ABC",
          dxLat: -33.9,
          dxLon: 18.4,
          frequency: 14074,
          mode: "FT8",
          time: new Date("2026-08-31T12:00:00Z"),
          source: "Cluster",
          comment: "POTA ZA-0001",
          dxLocApprox: true,
        }}
      />,
    );

    expect(screen.getByText("POTA ZA-0001")).toBeTruthy();
    expect(screen.getByText("approximate")).toBeTruthy();
  });
});

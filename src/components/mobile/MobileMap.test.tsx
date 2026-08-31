import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import { MobileMap } from "./MobileMap";

vi.mock("@/components/map/FlatMapView", () => ({
  FlatMapView: () => <div>Flat renderer</div>,
}));

vi.mock("@/components/map/ActivationDetailPanel", () => ({
  ActivationDetailPanel: () => <div>Activation detail portal</div>,
}));

vi.mock("@/hooks/useLiveSpots", () => ({
  useLiveSpots: () => ({ spots: [], isLoading: false }),
}));

vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: [] }),
  useSolarFlux: () => ({ data: [] }),
}));

vi.mock("@/hooks/useReachMapSurface", () => ({
  useReachMapSurface: () => ({ personalized: false }),
}));

vi.mock("@/lib/propagation/modelClient", () => ({
  propagationModelVisible: false,
}));

describe("MobileMap", () => {
  beforeEach(() => {
    useMapStore.setState({ viewMode: "flat" });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  it("mounts the activation detail owner beside the shared renderer", () => {
    render(<MobileMap />);

    expect(screen.getByText("Flat renderer")).toBeTruthy();
    expect(screen.getByText("Activation detail portal")).toBeTruthy();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SpotCluster } from "@/hooks/useSpotClustering";
import type { LiveSpot } from "@/types/livespot";
import type { PresentableSpot } from "@/lib/map/spotPresentation";
import { ClusterDetailPopover } from "./ClusterDetailPopover";

const spot: LiveSpot = {
  id: "spot-1",
  spotter: "W1AW",
  spotterGrid: "FN31",
  dx: "K0ABC",
  dxGrid: "DM79",
  frequency: 14074,
  mode: "FT8",
  comment: "CQ",
  time: new Date("2026-08-31T04:00:00Z"),
  band: "20m",
  dxLat: 39.7,
  dxLon: -104.9,
  source: "PSKReporter",
  snr: -8,
};

const cluster: SpotCluster = {
  id: "cluster-1",
  center: { lat: 39.5, lon: -104.5 },
  spots: [spot],
  count: 1,
  primarySpot: spot,
};

describe("ClusterDetailPopover", () => {
  it("opens details for the clicked spot row", async () => {
    const user = userEvent.setup();
    const onSpotSelect = vi.fn();
    render(
      <ClusterDetailPopover
        visible
        position={{ x: 400, y: 400 }}
        cluster={cluster}
        onClose={() => {}}
        onSpotSelect={onSpotSelect}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Select K0ABC and view details" }),
    );
    expect(onSpotSelect).toHaveBeenCalledOnce();
    expect(onSpotSelect).toHaveBeenCalledWith(spot);
  });

  it("is non-modal and closes from its own close control", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ClusterDetailPopover
        visible
        position={{ x: 400, y: 400 }}
        cluster={cluster}
        onClose={onClose}
        onSpotSelect={() => {}}
      />,
    );
    const collection = screen.getByRole("dialog", {
      name: "1 active spot: 1 spots",
    });
    expect(collection.getAttribute("aria-modal")).toBe("false");
    await user.click(screen.getByRole("button", { name: "Close spot collection" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves focus into the collection and restores its invoker", async () => {
    const invoker = document.createElement("button");
    document.body.appendChild(invoker);
    invoker.focus();
    const { unmount } = render(
      <ClusterDetailPopover
        visible
        position={{ x: 400, y: 400 }}
        cluster={cluster}
        onClose={() => {}}
        onSpotSelect={() => {}}
      />,
    );

    const row = screen.getByRole("button", {
      name: "Select K0ABC and view details",
    });
    await waitFor(() => expect(document.activeElement).toBe(row));
    unmount();
    expect(document.activeElement).toBe(invoker);
    invoker.remove();
  });

  it("preserves activation frequency precision and provider badges", () => {
    const activationSpot: PresentableSpot & LiveSpot = {
      ...spot,
      frequency: 14074.5,
      source: "Cluster",
      activation: {
        program: "POTA",
        reference: "US-1234",
        referenceName: "Test Park",
        source: "Parks on the Air",
        sourceUrl: "https://pota.app/",
      },
    };
    const activationCluster: SpotCluster = {
      ...cluster,
      spots: [activationSpot],
      primarySpot: activationSpot,
    };

    render(
      <ClusterDetailPopover
        visible
        position={{ x: 400, y: 400 }}
        cluster={activationCluster}
        onClose={() => {}}
        onSpotSelect={() => {}}
      />,
    );

    expect(screen.getByText("14.0745 MHz")).toBeTruthy();
    expect(screen.getByText("POTA")).toBeTruthy();
    expect(screen.queryByText("Cluster")).toBeNull();
  });
});

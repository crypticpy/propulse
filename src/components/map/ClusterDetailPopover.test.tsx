import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SpotCluster } from "@/hooks/useSpotClustering";
import type { LiveSpot } from "@/types/livespot";
import { ClusterDetailPopover } from "./ClusterDetailPopover";
import { SpotDetailsModal } from "./SpotDetailsModal";

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
      screen.getByRole("button", { name: "View details for K0ABC" }),
    );

    expect(onSpotSelect).toHaveBeenCalledOnce();
    expect(onSpotSelect).toHaveBeenCalledWith(spot);
  });

  it("retains the invoking row so closing details restores focus", async () => {
    const user = userEvent.setup();

    function ClusterDetailsFlow() {
      const [selectedSpot, setSelectedSpot] = useState<LiveSpot | null>(null);
      return (
        <>
          <ClusterDetailPopover
            visible
            position={{ x: 400, y: 400 }}
            cluster={cluster}
            onClose={() => {}}
            onSpotSelect={setSelectedSpot}
          />
          <SpotDetailsModal
            spot={selectedSpot}
            onClose={() => setSelectedSpot(null)}
          />
        </>
      );
    }

    render(<ClusterDetailsFlow />);
    const invokingRow = screen.getByRole("button", {
      name: "View details for K0ABC",
    });
    await user.click(invokingRow);

    expect(
      screen.getByRole("dialog", { name: "Spot details for K0ABC" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    await vi.waitFor(() => expect(document.activeElement).toBe(invokingRow));
  });
});

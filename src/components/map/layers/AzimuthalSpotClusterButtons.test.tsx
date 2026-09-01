import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import { AzimuthalSpotClusterButtons } from "./AzimuthalSpotClusterButtons";

const baseSpot: LiveSpot = {
  id: "one",
  dx: "K1ABC",
  spotter: "TEST",
  frequency: 14_074,
  mode: "FT8",
  band: "20m",
  source: "PSKReporter",
  comment: "",
  time: new Date("2026-09-01T12:00:00Z"),
};

describe("AzimuthalSpotClusterButtons", () => {
  it("renders only aggregates and opens the exact member collection", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const aggregate = {
      key: "1:1",
      x: 20,
      y: 20,
      left: 5,
      top: 5,
      width: 30,
      height: 30,
      members: [
        { dxLat: 1, dxLon: 2, originalSpot: baseSpot },
        {
          dxLat: 1.1,
          dxLon: 2.1,
          originalSpot: { ...baseSpot, id: "two", dx: "K2XYZ" },
        },
      ],
    };
    render(
      <AzimuthalSpotClusterButtons
        clusters={[
          aggregate,
          {
            ...aggregate,
            key: "2:2",
            members: [aggregate.members[0]],
          },
        ]}
        onOpen={onOpen}
      />,
    );

    const button = screen.getByRole("button", { name: /2 live spots/ });
    await user.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onOpen.mock.calls[0][0]).toBe(aggregate);
    expect(screen.queryByRole("button", { name: /1 live spot/ })).toBeNull();
  });
});

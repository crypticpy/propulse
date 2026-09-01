import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import { sameAzimuthalSpotPillScreenPlacements } from "@/lib/map/azimuthalSpotPillPlacement";
import { AzimuthalSpotPillButtons } from "./AzimuthalSpotPillButtons";

const makeSpot = (frequency: number): LiveSpot => ({
  id: `spot-${frequency}`,
  spotter: "W1AW",
  dx: "AC6J",
  dxGrid: "CM87",
  dxLat: 37.7,
  dxLon: -122.4,
  frequency,
  mode: "FT8",
  band: frequency < 5_000 ? "80m" : frequency < 10_000 ? "40m" : "20m",
  comment: "POTA US-7948",
  time: new Date("2026-09-01T05:00:00.000Z"),
  source: "Cluster",
});

describe("AzimuthalSpotPillButtons", () => {
  it.each([3_573, 5_357, 7_289, 14_074])(
    "gives a %.0f kHz tag the same hover and select behavior",
    (frequency) => {
      const spot = makeSpot(frequency);
      const onSpotHover = vi.fn();
      const onSpotHoverEnd = vi.fn();
      const onSpotSelect = vi.fn();
      render(
        <AzimuthalSpotPillButtons
          placements={[
            { spot, left: 10, top: 20, width: 80, height: 22 },
          ]}
          onSpotHover={onSpotHover}
          onSpotHoverEnd={onSpotHoverEnd}
          onSpotSelect={onSpotSelect}
        />,
      );

      const button = screen.getByRole("button", {
        name: /AC6J.*select as target/i,
      });
      fireEvent.pointerEnter(button);
      fireEvent.pointerLeave(button);
      fireEvent.focus(button);
      fireEvent.blur(button);
      fireEvent.click(button);

      expect(onSpotHover).toHaveBeenCalledWith(spot, expect.any(Object));
      expect(onSpotHover).toHaveBeenCalledTimes(2);
      expect(onSpotHoverEnd).toHaveBeenCalledTimes(2);
      expect(onSpotSelect).toHaveBeenCalledWith(spot, expect.any(Object));
    },
  );

  it("compares the report identity and geometry used by the canvas bridge", () => {
    const spot = makeSpot(14_074);
    const placement = { spot, left: 10, top: 20, width: 80, height: 22 };

    expect(
      sameAzimuthalSpotPillScreenPlacements([placement], [{ ...placement }]),
    ).toBe(true);
    expect(
      sameAzimuthalSpotPillScreenPlacements([placement], [
        { ...placement, left: 11 },
      ]),
    ).toBe(false);
    expect(
      sameAzimuthalSpotPillScreenPlacements([placement], [
        { ...placement, spot: { ...spot } },
      ]),
    ).toBe(false);
  });
});

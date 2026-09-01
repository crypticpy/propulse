import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
import {
  buildAzimuthalSpotEndpointScreenPlacements,
  sameAzimuthalSpotPillScreenPlacements,
  spotDestinationMatchesTarget,
} from "@/lib/map/azimuthalSpotPillPlacement";
import {
  AzimuthalSpotEndpointButtons,
  AzimuthalSpotPillButtons,
} from "./AzimuthalSpotPillButtons";

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

  it("retains every visible exact endpoint report, including duplicate callsigns", () => {
    const first = makeSpot(3_573);
    const second = { ...makeSpot(7_289), dx: first.dx };
    const hidden = makeSpot(14_074);
    const placements = buildAzimuthalSpotEndpointScreenPlacements(
      [
        { dxLat: 10, dxLon: 20, originalSpot: first },
        { dxLat: 10, dxLon: 20, originalSpot: second },
        { dxLat: 90, dxLon: 0, originalSpot: hidden },
      ],
      (lat) => (lat === 90 ? null : { x: 300, y: 300 }),
      {
        canvasSize: 600,
        center: 300,
        displaySize: 1_200,
        zoom: 2,
        spotDotScale: 1,
      },
    );

    expect(placements).toHaveLength(2);
    expect(placements.map((placement) => placement.spot)).toEqual([
      first,
      second,
    ]);
    expect(placements[0]).toMatchObject({
      left: 580,
      top: 580,
      width: 40,
      height: 40,
    });
  });

  it("routes a labels-off endpoint through the same exact selection callback", () => {
    const spot = makeSpot(5_357);
    const onSpotHover = vi.fn();
    const onSpotSelect = vi.fn();
    render(
      <AzimuthalSpotEndpointButtons
        placements={[
          { spot, left: 10, top: 20, width: 24, height: 24 },
        ]}
        onSpotHover={onSpotHover}
        onSpotSelect={onSpotSelect}
      />,
    );

    const endpoint = screen.getByRole("button", {
      name: /AC6J destination.*select as target/i,
    });
    fireEvent.pointerEnter(endpoint);
    fireEvent.click(endpoint);
    expect(onSpotHover).toHaveBeenCalledWith(spot, expect.any(Object));
    expect(onSpotSelect).toHaveBeenCalledWith(spot, expect.any(Object));
  });

  it("suppresses the report arc when ordinary or activation DX matches target", () => {
    const spot = makeSpot(14_074);
    const activation = { ...spot, comment: "POTA US-7948" };

    expect(
      spotDestinationMatchesTarget(spot, { lat: 37.7, lon: -122.4 }),
    ).toBe(true);
    expect(
      spotDestinationMatchesTarget(activation, {
        lat: 37.7,
        lon: -122.4,
      }),
    ).toBe(true);
    expect(
      spotDestinationMatchesTarget(spot, { lat: 37.8, lon: -122.4 }),
    ).toBe(false);
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMapStore } from "@/stores/mapStore";
import { ActivationPillButtons } from "./ActivationPillButtons";

describe("ActivationPillButtons", () => {
  beforeEach(() => {
    useMapStore.setState({ target: null });
  });

  it("exposes a keyboard-focusable target for each painted activation", () => {
    render(
      <ActivationPillButtons
        placements={[
          {
            spot: {
              id: "pota-1",
              program: "POTA",
              callsign: "K5ABC",
              reference: "US-1234",
              referenceName: "Test Park",
              frequencyKHz: 14074,
              mode: "FT8",
              comments: "",
              spotter: "W1AW",
              spottedAt: "2026-08-31T13:59:00.000Z",
              latitude: 30.25,
              longitude: -97.75,
            },
            left: 10,
            top: 20,
            width: 80,
            height: 22,
          },
        ]}
      />,
    );

    const button = screen.getByRole("button", { name: /K5ABC.*select as target/i });
    expect(button.getAttribute("tabindex")).not.toBe("-1");

    fireEvent.click(button);
    expect(useMapStore.getState().target).toEqual(
      expect.objectContaining({
        lat: 30.25,
        lon: -97.75,
        name: "K5ABC · POTA US-1234",
      }),
    );
  });
});

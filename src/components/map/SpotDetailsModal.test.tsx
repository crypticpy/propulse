import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LiveSpot } from "@/types/livespot";
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

describe("SpotDetailsModal", () => {
  it("uses the shared accessible dialog contract for complete spot details", async () => {
    const onClose = vi.fn();
    render(<SpotDetailsModal spot={spot} onClose={onClose} />);

    expect(
      screen.getByRole("dialog", { name: "Spot details for K0ABC" }),
    ).toBeTruthy();
    expect(screen.getByText("14.074 MHz")).toBeTruthy();
    expect(screen.getByText("DM79")).toBeTruthy();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Close dialog" }),
      ),
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

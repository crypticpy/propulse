import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HamClockDxpeditionsPanel } from "./HamClockDxpeditionsPanel";

const mocks = vi.hoisted(() => ({ dxpeditions: vi.fn() }));

vi.mock("@/hooks/useDxpeditions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useDxpeditions")>();
  return { ...actual, useDxpeditions: mocks.dxpeditions };
});
vi.mock("@/hooks/useUTCClock", () => ({
  useUTCClock: () => new Date("2026-08-31T12:00:00.000Z"),
}));

describe("HamClockDxpeditionsPanel", () => {
  it("puts active operations first and shows start/end countdowns", () => {
    mocks.dxpeditions.mockReturnValue({
      entries: [
        {
          callsign: "FUTURE",
          entity: "Future Island",
          startDate: "2026-09-02",
          endDate: "2026-09-04",
          bands: "20-10m",
          modes: "CW",
          qslInfo: "",
          info: "",
          source: "NG3K ADXO",
        },
        {
          callsign: "NOW1",
          entity: "Current Island",
          startDate: "2026-08-30",
          endDate: "2026-09-01",
          bands: "40-10m",
          modes: "CW, SSB",
          qslInfo: "",
          info: "",
          source: "NG3K ADXO",
        },
      ],
      status: "ok",
      isLoading: false,
    });

    render(<HamClockDxpeditionsPanel />);

    expect(screen.getByText("NOW")).toBeTruthy();
    expect(screen.getByText("NOW1")).toBeTruthy();
    expect(screen.getByText(/Ends in 1d 11h/)).toBeTruthy();
    expect(screen.getByText("Starts in 1d 12h")).toBeTruthy();
    expect(screen.getByRole("link", { name: /NG3K ADXO/i })).toBeTruthy();
  });
});

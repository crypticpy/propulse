import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DxpeditionsTile } from "./DxpeditionsTile";

const mocks = vi.hoisted(() => ({ dxpeditions: vi.fn() }));

vi.mock("@/hooks/useDxpeditions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useDxpeditions")>();
  return { ...actual, useDxpeditions: mocks.dxpeditions };
});
vi.mock("@/hooks/useUTCClock", () => ({
  useUTCClock: () => new Date("2026-08-31T12:00:00.000Z"),
}));

describe("DxpeditionsTile", () => {
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
      error: null,
    });

    render(<DxpeditionsTile />);

    expect(screen.getByText("NOW")).toBeTruthy();
    expect(screen.getByText("NOW1")).toBeTruthy();
    expect(screen.getByText("ON AIR")).toBeTruthy();
    expect(screen.getByText(/Ends in 1d 11h/)).toBeTruthy();
    expect(screen.getByText("Starts in 1d 12h")).toBeTruthy();
  });

  it("reports a rejected schedule request as unavailable rather than empty", () => {
    mocks.dxpeditions.mockReturnValue({
      entries: [],
      status: "ok",
      isLoading: false,
      error: new Error("route unavailable"),
    });

    render(<DxpeditionsTile />);

    expect(screen.getByText("DXPEDITION SCHEDULE UNAVAILABLE")).toBeTruthy();
    expect(screen.queryByText("No announced operations")).toBeNull();
  });

  // #726: an "empty" schedule loaded fine and parsed to zero operations
  // (an ordinary quiet week) and must not collapse into the same
  // "UNAVAILABLE" state as an unreachable/too-large schedule.
  it("treats an empty schedule as zero operations, not unavailable", () => {
    mocks.dxpeditions.mockReturnValue({
      entries: [],
      status: "empty",
      isLoading: false,
      error: null,
    });

    render(<DxpeditionsTile />);

    expect(screen.queryByText("DXPEDITION SCHEDULE UNAVAILABLE")).toBeNull();
    expect(screen.getByText("NO ANNOUNCED OPERATIONS")).toBeTruthy();
  });

  it("opens the report with the NG3K ADXO source link", async () => {
    mocks.dxpeditions.mockReturnValue({
      entries: [
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
      error: null,
    });

    render(<DxpeditionsTile />);
    fireEvent.click(
      screen.getByRole("button", { name: /Open the DXpeditions report/i }),
    );
    expect(await screen.findByRole("link", { name: /NG3K ADXO/i })).toBeTruthy();
  });
});

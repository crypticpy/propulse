import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReliabilityReport } from "./ReliabilityReport";
import { ForecastComparisonChart } from "./ForecastComparisonChart";

const mocks = vi.hoisted(() => ({ qth: false }));
vi.mock("./useReliabilityReportData", () => ({
  useReliabilityReportData: (band: string, selectedHour?: number) => {
    const start = Math.floor(Date.parse("2026-09-07T00:00:00Z") / 3_600_000);
    const matrix = new Map<string, number>();
    for (const value of ["80m", "40m", "20m", "17m", "15m", "10m"]) {
      for (let i = 0; i < 48; i++) matrix.set(`${value}:${start + i}`, value === "40m" ? 60 : 80);
    }
    const hourIndex = selectedHour ?? start + 12;
    return {
      wall: { hourIndex: start + 12, mode: "FT8", updatedAt: Date.parse("2026-09-07T11:00:00Z"), inputs: { powerWatts: 100, antennaType: "dipole", antennaGainDbi: 2, noiseEnvironment: "residential", distanceKm: mocks.qth ? null : 10000, modeThresholdDb: -20 } },
      cell: mocks.qth ? null : { snrEstimate: band === "40m" ? -3 : 9, confidence: 80 },
      model: { prediction: null, reason: "MODEL OFF" },
      nowcast: { predictions: new Map(), personalized: false },
      target: mocks.qth ? null : { grid: "PM95" },
      sourceLabel: mocks.qth ? "NO TARGET — SHOWING QTH" : "EM38 TO PM95",
      physics: Array.from({ length: 48 }, (_, i) => ({ hourIndex: start + i, score: matrix.get(`${band}:${start + i}`) })),
      matrix, hourIndex, dayStart: start, observed: null, liveObserved: null, activityAt: null,
    };
  },
}));

it("shows the exact station and SNR inputs and selects cells across every wall band", () => {
  mocks.qth = false;
  render(<ReliabilityReport open onClose={() => {}} />);
  expect(screen.getByText("+9.0 dB")).toBeTruthy();
  expect(screen.getByText("FT8 -20.0 dB")).toBeTruthy();
  expect(screen.getByText("100 W")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "BY HOUR" }));
  expect(within(screen.getByRole("group", { name: "Choose band and UTC hour" })).getAllByRole("button")).toHaveLength(144);
  fireEvent.click(screen.getByRole("button", { name: "40m 06Z: 60 of 100" }));
  expect(screen.getByText("-3.0 dB")).toBeTruthy();
  expect(screen.getByRole("table", { name: "Reliability score by band and UTC hour" })).toBeTruthy();
});

it("keeps QTH context visible without inventing path SNR", () => {
  mocks.qth = true;
  render(<ReliabilityReport open onClose={() => {}} />);
  expect(screen.getAllByText(/NO TARGET — SHOWING QTH/).length).toBeGreaterThan(0);
  expect(screen.getByText("NO PATH ESTIMATE")).toBeTruthy();
  expect(screen.queryByText("+9.0 dB")).toBeNull();
  mocks.qth = false;
});

it("plots only supplied evidence and exposes all three values to keyboard selection", () => {
  const select = vi.fn();
  const { container } = render(<ForecastComparisonChart points={[{ hourIndex: 0, physics: 20 }, { hourIndex: 1, physics: 50, model: 65, observed: 12 }]} selectedHour={1} nowHour={1} onSelect={select} />);
  expect(container.querySelectorAll(".hcr-comparison-observed")).toHaveLength(1);
  expect(container.querySelectorAll(".hcr-comparison-model")).toHaveLength(1);
  fireEvent.change(screen.getByRole("slider", { name: "Evidence chart UTC hour" }), { target: { value: "0" } });
  expect(select).toHaveBeenCalledWith(0);
  expect(screen.getByText(/PHYSICS 50\/100 · MODEL 65% · SPOTS 12/)).toBeTruthy();
});

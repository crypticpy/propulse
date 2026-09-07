import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PropagationForecastReport } from "./PropagationForecastReport";
vi.mock("@/hooks/useStationCastContext", () => ({ useStationCastContext: () => ({ location: { grid: "EM38", lat: 38.5, lon: -93 }, deriveEnvelope: () => null }) }));
vi.mock("./useFutureCastReport", () => ({ useFutureCastReport: () => ({ active: [], offReason: "HORIZON NOT ACTIVATED", issueTime: Date.parse("2026-09-07T12:00:00Z"), evidence: new Map() }) }));
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
      wall: { hour: 12, hourIndex: start + 12, mode: "FT8", updatedAt: Date.parse("2026-09-07T11:00:00Z"), inputs: { powerWatts: 100, antennaType: "dipole", antennaGainDbi: 2, noiseEnvironment: "residential", distanceKm: mocks.qth ? null : 10000, modeThresholdDb: -20, kp: 2, sfi: 140 } },
      cell: mocks.qth ? null : { snrEstimate: band === "40m" ? -3 : 9, confidence: 80 },
      model: { prediction: null, reason: "MODEL OFF" },
      nowcast: { predictions: new Map(), personalized: false },
      target: mocks.qth ? null : { grid: "PM95" },
      sourceLabel: mocks.qth ? "NO TARGET — SHOWING QTH" : "EM38 TO PM95",
      physics: Array.from({ length: 48 }, (_, i) => ({ hourIndex: start + i, score: matrix.get(`${band}:${start + i}`) })),
      location: { grid: "EM38", lat: 38.5, lon: -93 }, matrix, hourIndex, dayStart: start, observed: null, liveObserved: null, activityAt: null,
    };
  },
}));

it("retains both UTC days and all four model-off horizons", () => {
  render(<PropagationForecastReport open onClose={() => {}} />);
  expect(within(screen.getByRole("group", { name: "Choose forecast band and UTC hour" })).getAllByRole("button")).toHaveLength(288);
  expect(screen.getByRole("table", { name: "48-hour forecast matrix" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "40m 2026-09-08T06:00 UTC: 60" }));
  expect(screen.getByText("09-08 06:00")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "HORIZONS" }));
  for (const hours of [3, 6, 12, 24]) {
    expect(within(screen.getByRole("region", { name: `Plus ${hours} hour forecast` })).getByText("MODEL OFF · HORIZON NOT ACTIVATED")).toBeTruthy();
  }
});

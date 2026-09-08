import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { KpPoint } from "@/lib/solar/dataTypes";
import { PropagationForecastReport } from "./PropagationForecastReport";
import { HamClockPinnedReportHost } from "./WallReport";
vi.mock("@/hooks/useStationCastContext", () => ({ useStationCastContext: () => ({ location: { grid: "EM38", lat: 38.5, lon: -93 }, deriveEnvelope: () => null }) }));
const mocks = vi.hoisted(() => ({ qth: false, active: false, personalized: false, stale: false, kp: [] as KpPoint[], kpStale: false }));
beforeEach(() => Object.assign(mocks, { qth: false, active: false, personalized: false, stale: false, kp: [], kpStale: false }));
vi.mock("@/hooks/useSolarResource", () => ({ useSolarResource: () => ({ data: { envelope: { data: mocks.kp }, state: mocks.kpStale ? "stale" : "fresh" }, isError: false }) }));
vi.mock("./useFutureCastReport", () => ({ useFutureCastReport: () => {
  const issueTime = Date.parse("2026-09-07T12:00:00Z");
  return { active: mocks.active ? [3, 6, 12, 24] : [], offReason: "HORIZON NOT ACTIVATED", issueTime,
    evidence: new Map(mocks.active ? [3, 6, 12, 24].map(hours => [`20m:${hours}`, {
      personalized: mocks.personalized, stale: mocks.stale,
      prediction: { issue_time: new Date(issueTime).toISOString(), valid_time: new Date(issueTime + hours * 3_600_000).toISOString(),
        core_probability: 0.7, personalized_probability: 0.8, confidence: 0.9, profile: "nowcast", model_version: "fixture-v1",
        top_factors: ["solar_flux"], ood_flags: ["sparse_path_history"], data_freshness: { space_weather: 60 } },
    }]) : []),
  };
} }));
vi.mock("./useReliabilityReportData", () => ({
  useReliabilityReportData: (band: string, selectedHour?: number) => {
    const start = Math.floor(Date.parse("2026-09-07T00:00:00Z") / 3_600_000);
    const matrix = new Map<string, number>();
    for (const value of ["80m", "40m", "20m", "17m", "15m", "10m"]) {
      for (let i = 0; i < 48; i++) matrix.set(`${value}:${start + i}`, value === "40m" ? 60 : value === "20m" ? 90 : 80);
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
  expect(within(screen.getByRole("group", { name: "Choose forecast band and UTC hour" })).getAllByRole("button")).toHaveLength(144);
  expect(screen.getByRole("table", { name: "48-hour forecast matrix" })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "2026-09-08 UTC" }));
  fireEvent.click(screen.getByRole("button", { name: "40m 2026-09-08T06:00 UTC: 60" }));
  expect(screen.getByText("09-08 06:00")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "HORIZONS" }));
  for (const hours of [3, 6, 12, 24]) {
    expect(within(screen.getByRole("region", { name: `Plus ${hours} hour forecast` })).getByText("MODEL OFF · HORIZON NOT ACTIVATED")).toBeTruthy();
  }
});

it("preserves the selected band and hour when the forecast is pinned", () => {
  function Harness() {
    const [open, setOpen] = useState(true);
    return <>{open && <PropagationForecastReport open onClose={() => setOpen(false)} />}<HamClockPinnedReportHost /></>;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("radio", { name: "2026-09-08 UTC" }));
  fireEvent.click(screen.getByRole("button", { name: "40m 2026-09-08T06:00 UTC: 60" }));
  fireEvent.click(screen.getByRole("tab", { name: "HORIZONS" }));
  fireEvent.click(screen.getByRole("button", { name: "PIN" }));
  expect(screen.getByRole("tab", { name: "HORIZONS" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText("09-08 06:00")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "UNPIN" }));
});


it.each([false, true])("keeps horizon rows, chart and selected engine probability consistent (personalized=%s)", personalized => {
  Object.assign(mocks, { active: true, personalized, stale: true });
  render(<PropagationForecastReport open onClose={() => {}} />);
  fireEvent.change(screen.getByRole("slider", { name: "Forecast chart UTC hour" }), { target: { value: Math.floor(Date.parse("2026-09-07T15:00:00Z") / 3_600_000) } });
  expect(screen.getByText(personalized ? "80%" : "70%", { exact: true, selector: ".hcr-enginestrip-value" })).toBeTruthy();
  expect(screen.getByText("MODEL / PHYSICS AGREE · STALE MODEL")).toBeTruthy();
  const chart = screen.getByRole("table", { name: "Forecast physics scores and model probabilities by UTC hour" });
  const row = within(chart).getAllByRole("row").find(row => row.textContent?.startsWith("20m2026-09-07T15:00:00.000Z"));
  expect(row?.lastElementChild?.textContent).toBe(personalized ? "80" : "70");
  fireEvent.click(screen.getByRole("tab", { name: "HORIZONS" }));
  for (const hours of [3, 6, 12, 24]) {
    const region = screen.getByRole("region", { name: `Plus ${hours} hour forecast` });
    expect(within(region).getByText(`CORE 70% · PERSONALIZED ${personalized ? "80%" : "UNAVAILABLE"} · CONFIDENCE 90%`)).toBeTruthy();
    expect(within(region).getByText("FACTORS solar flux · OOD sparse path history · INPUT AGE space weather 60 s")).toBeTruthy();
    expect(region.classList.contains("hc-warn-text")).toBe(true);
  }
});


it("uses only the selected NOAA forecast bucket and labels stale values", () => {
  mocks.kp = [
    { time_tag: "2026-09-07T12:00:00Z", kp: 7, kind: "observed", noaa_scale: null, a_running: null },
    { time_tag: "2026-09-07T15:00:00Z", kp: 4.3, kind: "predicted", noaa_scale: null, a_running: null },
  ];
  mocks.kpStale = true;
  render(<PropagationForecastReport open onClose={() => {}} />);
  expect(screen.getByText("BEST IN 6 H")).toBeTruthy();
  expect(screen.getByText("NO FORECAST FOR HOUR")).toBeTruthy();
  const slider = screen.getByRole("slider", { name: "Forecast chart UTC hour" });
  const at = (time: string) => fireEvent.change(slider, { target: { value: Date.parse(time) / 3_600_000 } });
  at("2026-09-07T17:00:00Z");
  expect(screen.getByText("4.3 · STALE")).toBeTruthy();
  at("2026-09-07T18:00:00Z");
  expect(screen.getByText("NO FORECAST FOR HOUR")).toBeTruthy();
});

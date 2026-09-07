import { expect, it, vi } from "vitest";
import { buildFutureCastReportRequests } from "./futureCastRequests";
import { buildCorePathFeatures } from "@/lib/propagation/coreFeatureBuilder";
const issuedAt = new Date("2026-09-07T23:55:00Z");
const input = {
  origin: { grid: "EM38", lat: 38.5, lon: -93 },
  target: { grid: "PM95", lat: 35.68, lon: 139.65 },
  mode: "FT8", weather: { kp: 2, f107: 140 },
  weatherUpdatedAt: issuedAt.getTime() - 60_000,
  deriveEnvelope: vi.fn(() => null),
};
it("requests only allowed horizons and never sends missing-station requests", () => {
  expect(buildFutureCastReportRequests(input, issuedAt, [], false)).toEqual([]);
  expect(buildFutureCastReportRequests({ ...input, origin: null }, issuedAt, [3], false)).toEqual([]);
  const rows = buildFutureCastReportRequests(input, issuedAt, [3, 24, 48], false);
  expect([...new Set(rows.map(row => row.hours))]).toEqual([3, 24]);
  expect(rows).toHaveLength(12);
  expect(rows.some(row => row.request.band === "160m")).toBe(false);
});
it("rebuilds future-time features across midnight while preserving issue time and source age", () => {
  const { request } = buildFutureCastReportRequests(input, issuedAt, [6], false).find(row => row.request.band === "20m")!;
  const validTime = new Date("2026-09-08T05:55:00Z");
  expect(request).toMatchObject({ issue_time: issuedAt.toISOString(), valid_time: validTime.toISOString(), mode: "FT8", data_freshness_seconds: { space_weather: 60 } });
  const args = { origin: input.origin, target: input.target, band: "20m", declaredPowerWatts: request.declared_power_watts, weather: input.weather };
  expect(request.features.values).toEqual(buildCorePathFeatures({ ...args, validTime }));
  expect(request.features.values).not.toEqual(buildCorePathFeatures({ ...args, validTime: issuedAt }));
});

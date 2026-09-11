import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetRimHistoryForTests,
  seedRimHistoryForTests,
  useRIM,
  type RimHistoryPoint,
} from "./useRIM";
import { useAtmosStore } from "@/stores/atmosStore";
import { useUserStore } from "@/stores/userStore";

const mocks = vi.hoisted(() => ({
  kIndex: { data: [] as Array<{ kp_index: number }>, isLoading: false },
  solarFlux: { data: [] as Array<{ flux: number }>, isLoading: false },
  xray: { data: [] as Array<{ flux: number }>, isLoading: false },
  proton: { data: [] as Array<{ flux: number }>, isLoading: false },
  dst: { data: [] as Array<{ dst: number }>, isLoading: false },
  tec: {
    tecData: { grid: [] as Array<{ lat: number; lon: number; tec: number }>, available: false },
    isLoading: false,
  },
  lightning: {
    strikes: [] as Array<{ lat: number; lon: number }>,
    isLoading: false,
  },
  alerts: { alerts: [] as Array<{ severity: string }>, isLoading: false },
  radar: { manifest: null as unknown, isLoading: false },
  gauges: { gauges: [] as Array<{ floodStatus: string }> },
  repeaters: {
    repeaters: [] as Array<{ operational: boolean }>,
  },
  nvis: {
    nvisViable: true,
    recommendedBands: ["80m"],
    conditionSummary: "Good NVIS conditions",
  },
}));

vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => mocks.kIndex,
  useSolarFlux: () => mocks.solarFlux,
}));
vi.mock("@/hooks/useSolarExpanded", () => ({
  useXrayFlux: () => mocks.xray,
  useProtonFlux: () => mocks.proton,
  useDstIndex: () => mocks.dst,
}));
vi.mock("@/hooks/useTEC", () => ({
  useTEC: () => mocks.tec,
}));
vi.mock("@/hooks/useLightning", () => ({
  useLightning: () => mocks.lightning,
}));
vi.mock("@/hooks/useWeatherAlerts", () => ({
  useWeatherAlerts: () => mocks.alerts,
}));
vi.mock("@/hooks/useWeatherRadar", () => ({
  useWeatherRadar: () => mocks.radar,
}));
vi.mock("@/hooks/useRiverGauges", () => ({
  useRiverGauges: () => mocks.gauges,
}));
vi.mock("@/hooks/useRepeaters", () => ({
  useRepeaters: () => mocks.repeaters,
}));
vi.mock("@/lib/utils/nvis", () => ({
  analyzeNVIS: () => mocks.nvis,
}));

const AUSTIN = { lat: 30.27, lon: -97.74 };
const TOKYO = { lat: 35.69, lon: 139.69 };

function sample(over: Partial<RimHistoryPoint> = {}): RimHistoryPoint {
  return {
    timestamp: new Date().toISOString(),
    composite: 50,
    hf: 50,
    vhf: null,
    infra: null,
    emcomm: 50,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
  resetRimHistoryForTests();
  mocks.kIndex = {
    data: [{ kp_index: 2 }],
    isLoading: false,
  };
  mocks.solarFlux = { data: [{ flux: 120 }], isLoading: false };
  mocks.xray = { data: [{ flux: 1e-6 }], isLoading: false };
  mocks.proton = { data: [{ flux: 1 }], isLoading: false };
  mocks.dst = { data: [{ dst: 0 }], isLoading: false };
  mocks.tec = {
    tecData: { grid: [], available: false },
    isLoading: false,
  };
  mocks.lightning = { strikes: [], isLoading: false };
  mocks.alerts = { alerts: [], isLoading: false };
  mocks.radar = { manifest: null, isLoading: false };
  mocks.gauges = { gauges: [] };
  mocks.repeaters = { repeaters: [{ operational: true }] };
  useUserStore.setState({
    station: {
      callsign: "N0TEST",
      homeLocationId: "home",
      activeLocationId: null,
      savedLocations: [],
      grid: "EM10dg",
      lat: AUSTIN.lat,
      lon: AUSTIN.lon,
      name: "Austin",
    },
  });
  useAtmosStore.setState({ monitoredRegions: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRIM", () => {
  it("records a 12 h history point and drops samples older than the window", () => {
    const now = Date.now();
    seedRimHistoryForTests("home", [
      sample({
        timestamp: new Date(now - 13 * 60 * 60 * 1000).toISOString(),
        composite: 20,
      }),
      sample({
        timestamp: new Date(now - 60 * 60 * 1000).toISOString(),
        composite: 40,
      }),
    ]);

    const { result } = renderHook(() => useRIM());
    expect(result.current.rimResult).not.toBeNull();
    expect(
      result.current.history.some(
        (p) => Date.parse(p.timestamp) === now - 13 * 60 * 60 * 1000,
      ),
    ).toBe(false);
    expect(
      result.current.history.some(
        (p) => Date.parse(p.timestamp) === now - 60 * 60 * 1000,
      ),
    ).toBe(true);
    expect(result.current.history.length).toBeGreaterThanOrEqual(1);
  });

  it("re-scopes lightning distance when a region focus is passed", () => {
    mocks.lightning = {
      strikes: [{ lat: TOKYO.lat, lon: TOKYO.lon }],
      isLoading: false,
    };
    useAtmosStore.setState({
      monitoredRegions: [
        {
          id: "tokyo",
          name: "TOKYO",
          lat: TOKYO.lat,
          lon: TOKYO.lon,
          radiusKm: 200,
        },
      ],
    });

    const home = renderHook(() => useRIM());
    expect(home.result.current.nearestLightningKm).toBeGreaterThan(1000);

    const tokyo = renderHook(() =>
      useRIM({
        id: "tokyo",
        name: "TOKYO",
        lat: TOKYO.lat,
        lon: TOKYO.lon,
      }),
    );
    expect(tokyo.result.current.nearestLightningKm).toBeCloseTo(0, 0);
    expect(tokyo.result.current.rimResult?.regionId).toBe("tokyo");
    expect(tokyo.result.current.regionScores.map((row) => row.region.id)).toEqual(
      expect.arrayContaining(["home", "tokyo"]),
    );
  });

  it("does not default a missing VHF sub-score from Kp alone", () => {
    const { result } = renderHook(() => useRIM());
    expect(result.current.rimResult?.vhfUhf.dataAvailable).toBe(false);
    expect(result.current.rimResult?.partial).toBe(true);
    expect(result.current.rimResult?.excludedInputs).toContain("VHF/UHF");
  });

  it("appends a new history sample after the 15-minute interval even when scores are unchanged", () => {
    const { result, rerender } = renderHook(() => useRIM());
    const firstLen = result.current.history.length;
    expect(firstLen).toBeGreaterThanOrEqual(1);

    act(() => {
      vi.advanceTimersByTime(16 * 60 * 1000);
      mocks.dst = { data: [{ dst: -12 }], isLoading: false };
    });
    rerender();
    expect(result.current.history.length).toBeGreaterThan(firstLen);
  });
});

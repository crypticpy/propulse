import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useWallReliability,
  wallReliabilityScore,
} from "./useWallReliability";

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  timeOffset: 0,
  absoluteTime: null as string | null,
}));

vi.mock("@/hooks/useActiveLocation", () => ({
  useActiveLocation: () => ({ lat: 30.27, lon: -97.74 }),
}));
vi.mock("@/hooks/useSolarData", () => ({
  useKIndex: () => ({ data: [{ kp_index: 2 }], isLoading: false }),
  useSolarFlux: () => ({ data: [{ flux: 140 }], isLoading: false }),
}));
vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: unknown) => unknown) =>
    selector({
      target: { name: "Tokyo", grid: "PM95", lat: 35.68, lon: 139.65 },
      timeOffset: mocks.timeOffset,
      absoluteTime: mocks.absoluteTime,
    }),
}));
vi.mock("@/stores/hamclockStore", () => ({
  useHamClockStore: (selector: (state: unknown) => unknown) =>
    selector({
      reliability: { mode: "FT8", powerWatts: 100, antennaType: "dipole" },
    }),
}));
vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({ noiseEnvironment: "residential" }),
}));
vi.mock("@/stores/shackStore", () => ({
  useActiveChain: () => null,
  useUserAntennas: () => [],
}));
vi.mock("@/lib/hamclock/reliabilityForecast", () => ({
  buildReliabilityForecast: mocks.build,
}));

/** Whole UTC hours since the epoch, the key the matrix is built on. */
function hourIndexOf(iso: string): number {
  return Math.floor(Date.parse(iso) / 3_600_000);
}

describe("useWallReliability", () => {
  beforeEach(() => {
    mocks.timeOffset = 0;
    mocks.absoluteTime = null;
    // Every cell's score encodes the UTC day and hour it was built for, so an
    // assertion can tell "tomorrow 02Z" from "today 02Z".
    mocks.build.mockImplementation(({ baseTime }: { baseTime: Date }) =>
      Array.from({ length: 24 }, (_, hour) => ({
        band: "20m",
        hour,
        score: baseTime.getUTCDate() * 100 + hour,
        snrEstimate: 0,
        confidence: 50,
        status: "good",
      })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("reads forward into the next UTC day for a late-evening +6H column", () => {
    vi.setSystemTime(new Date("2026-09-05T20:30:00.000Z"));
    const { result } = renderHook(() => useWallReliability());

    expect(result.current.status).toBe("ready");
    expect(result.current.hour).toBe(20);
    expect(result.current.hourIndex).toBe(
      hourIndexOf("2026-09-05T20:00:00.000Z"),
    );

    // Both UTC days are built, so the columns have somewhere to read.
    expect(mocks.build).toHaveBeenCalledTimes(2);
    const days = mocks.build.mock.calls.map(([input]) =>
      (input as { baseTime: Date }).baseTime.toISOString(),
    );
    expect(days).toEqual([
      "2026-09-05T00:00:00.000Z",
      "2026-09-06T00:00:00.000Z",
    ]);

    // 20Z + 6h is 02Z tomorrow (day 6, hour 2), not 02Z this morning.
    const plus6 = wallReliabilityScore(
      result.current.cells,
      "20m",
      result.current.hourIndex + 6,
    );
    expect(plus6).toBe(602);
    expect(plus6).not.toBe(502);

    // The furthest column stays inside the window too: 20Z + 18h is 14Z.
    expect(
      wallReliabilityScore(
        result.current.cells,
        "20m",
        result.current.hourIndex + 18,
      ),
    ).toBe(614);
  });

  it("follows the map's absolute time instead of the live clock", () => {
    vi.setSystemTime(new Date("2026-09-05T20:30:00.000Z"));
    mocks.absoluteTime = "2026-09-08T09:00:00.000Z";
    const { result } = renderHook(() => useWallReliability());

    expect(result.current.hour).toBe(9);
    expect(result.current.hourIndex).toBe(
      hourIndexOf("2026-09-08T09:00:00.000Z"),
    );
    expect(
      (mocks.build.mock.calls[0][0] as { baseTime: Date }).baseTime.toISOString(),
    ).toBe("2026-09-08T00:00:00.000Z");
  });

  it("applies the map's time offset when there is no absolute time", () => {
    vi.setSystemTime(new Date("2026-09-05T20:30:00.000Z"));
    mocks.timeOffset = 6;
    const { result } = renderHook(() => useWallReliability());

    expect(result.current.hour).toBe(2);
    expect(result.current.hourIndex).toBe(
      hourIndexOf("2026-09-06T02:00:00.000Z"),
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { TLEData } from "@/types/satellite";
import { buildOrbitTrack, getOrbitalPeriodMinutes } from "./satellites";

const TLE_TEXT = [
  "ISS (ZARYA)",
  "1 25544U 98067A   26199.50000000  .00000000  00000-0  00000-0 0  9999",
  "2 25544  51.6400 120.0000 0005000  10.0000 350.0000 15.50000000123456",
].join("\n");

// Same lines as TLE_TEXT above, as a TLEData object for SGP4 calls
// (buildOrbitTrack/getOrbitalPeriodMinutes need line1/line2 + noradId, not
// the raw multi-line TLE text used by the fetch test below).
const ISS_TLE: TLEData = {
  name: "ISS (ZARYA)",
  line1: "1 25544U 98067A   26199.50000000  .00000000  00000-0  00000-0 0  9999",
  line2: "2 25544  51.6400 120.0000 0005000  10.0000 350.0000 15.50000000123456",
  noradId: 25544,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("satellite TLE source selection", () => {
  it("uses the same-origin proxy without contacting Celestrak from the browser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tle: TLE_TEXT,
          _meta: { collectedAt: "2026-07-18T23:00:00.000Z", source: "direct" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchTLEData } = await import("./satellites");
    const result = await fetchTLEData();

    expect(result).toHaveLength(1);
    expect(result[0]?.noradId).toBe(25544);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/satellites/tle");
  });
});

describe("getOrbitalPeriodMinutes", () => {
  it("derives the period from the TLE's mean motion (ISS ~92.9 min, not the 90 min LEO guess)", () => {
    const periodMin = getOrbitalPeriodMinutes(ISS_TLE);
    expect(periodMin).toBeGreaterThan(90);
    expect(periodMin).toBeLessThan(96);
  });
});

describe("buildOrbitTrack", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("returns length = (pastMin + orbitsAhead*period)/stepMin, +-1 point", () => {
    const periodMin = getOrbitalPeriodMinutes(ISS_TLE);
    const pastMin = 45;
    const orbitsAhead = 2;
    const stepMin = 1;

    const track = buildOrbitTrack(ISS_TLE, now, {
      pastMin,
      orbitsAhead,
      stepMin,
    });

    const expectedLength = (pastMin + orbitsAhead * periodMin) / stepMin;
    expect(track.length).toBeGreaterThanOrEqual(Math.floor(expectedLength) - 1);
    expect(track.length).toBeLessThanOrEqual(Math.ceil(expectedLength) + 1);
  });

  it("produces strictly monotonic minutesFromNow", () => {
    const track = buildOrbitTrack(ISS_TLE, now, {
      pastMin: 45,
      orbitsAhead: 1,
      stepMin: 5,
    });

    expect(track.length).toBeGreaterThan(1);
    for (let i = 1; i < track.length; i++) {
      expect(track[i].minutesFromNow).toBeGreaterThan(
        track[i - 1].minutesFromNow,
      );
    }
  });

  it("keeps every point's longitude within [-180, 180]", () => {
    const track = buildOrbitTrack(ISS_TLE, now, {
      pastMin: 45,
      orbitsAhead: 3,
      stepMin: 2,
    });

    expect(track.length).toBeGreaterThan(0);
    for (const point of track) {
      expect(point.lon).toBeGreaterThanOrEqual(-180);
      expect(point.lon).toBeLessThanOrEqual(180);
    }
  });

  it("starts pastMin minutes behind now and ends within one step of orbitsAhead orbits ahead", () => {
    const periodMin = getOrbitalPeriodMinutes(ISS_TLE);
    const stepMin = 1;
    const track = buildOrbitTrack(ISS_TLE, now, {
      pastMin: 10,
      orbitsAhead: 1,
      stepMin,
    });

    expect(track[0].minutesFromNow).toBe(-10);
    const last = track[track.length - 1].minutesFromNow;
    expect(last).toBeLessThanOrEqual(periodMin);
    expect(periodMin - last).toBeLessThan(stepMin);
  });

  it("matches useISSTracker's historical +-45 min / 91-point single-orbit call shape", () => {
    // useISSTracker reconstructs its fixed 45-minutes-forward window as a
    // fraction of the ISS's own period (see useISSTracker.ts) instead of a
    // whole orbit, so the ±45 min / 91-point output survives the switch to
    // the shared builder unchanged.
    const periodMin = getOrbitalPeriodMinutes(ISS_TLE);
    const orbitsAhead = 45 / periodMin;

    const track = buildOrbitTrack(ISS_TLE, now, {
      pastMin: 45,
      orbitsAhead,
      stepMin: 1,
    });

    expect(track).toHaveLength(91);
    expect(track[0].minutesFromNow).toBe(-45);
    expect(track[track.length - 1].minutesFromNow).toBeCloseTo(45, 6);
    expect(track.every((p) => typeof p.lat === "number")).toBe(true);
  });
});

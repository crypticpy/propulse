import { describe, expect, it } from "vitest";
import { getNextSunEvent, getSunCurve } from "./sunCurve";

/** Austin, TX — an ordinary mid-latitude station with a rise and set every day. */
const AUSTIN = { lat: 30.27, lon: -97.74 };
/** Above the Arctic Circle in northern summer: continuous daylight. */
const POLAR_DAY = { lat: 78, lon: 15 };
/** Same station, southern-hemisphere-style winter darkness six months later. */
const POLAR_NIGHT_DATE = new Date("2026-01-05T12:00:00Z");

describe("getSunCurve", () => {
  it("samples 24 hourly points spanning the UTC day containing the given date", () => {
    const curve = getSunCurve(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-05T13:14:00Z"),
    );
    expect(curve.points).toHaveLength(24);
    expect(curve.points[0].hour).toBe(0);
    expect(curve.points[0].at.toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(curve.points[23].hour).toBe(23);
    expect(curve.points[23].at.toISOString()).toBe("2026-09-05T23:00:00.000Z");
  });

  it("reports elevation and azimuth that swing from night to day and back", () => {
    const curve = getSunCurve(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-05T13:14:00Z"),
    );
    const elevations = curve.points.map((p) => p.elevationDeg);
    expect(Math.min(...elevations)).toBeLessThan(0);
    expect(Math.max(...elevations)).toBeGreaterThan(0);
    for (const point of curve.points) {
      expect(point.azimuthDeg).toBeGreaterThanOrEqual(0);
      expect(point.azimuthDeg).toBeLessThan(360);
    }
  });

  it("resolves rise, set and solar noon for an ordinary mid-latitude day", () => {
    const curve = getSunCurve(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-05T13:14:00Z"),
    );
    expect(curve.rise).not.toBeNull();
    expect(curve.set).not.toBeNull();
    expect(curve.noon).not.toBeNull();
    expect(curve.rise!.getTime()).toBeLessThan(curve.noon!.getTime());
    expect(curve.noon!.getTime()).toBeLessThan(curve.set!.getTime());
    expect(curve.dayLengthMin).not.toBeNull();
    expect(curve.dayLengthMin!).toBeGreaterThan(0);
  });

  it("signs the day-length delta against yesterday: shrinking after the fall equinox", () => {
    const curve = getSunCurve(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-25T13:14:00Z"),
    );
    expect(curve.dayLengthDeltaMin).not.toBeNull();
    expect(curve.dayLengthDeltaMin!).toBeLessThan(0);
  });

  it("signs the day-length delta positive while days are lengthening after the spring equinox", () => {
    const curve = getSunCurve(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-04-05T13:14:00Z"),
    );
    expect(curve.dayLengthDeltaMin).not.toBeNull();
    expect(curve.dayLengthDeltaMin!).toBeGreaterThan(0);
  });

  it("orders the three twilight windows narrowest (civil) to widest (astronomical)", () => {
    const curve = getSunCurve(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-05T13:14:00Z"),
    );
    const [civil, nautical, astronomical] = curve.twilights;
    expect(civil.start).not.toBeNull();
    expect(nautical.start!.getTime()).toBeLessThan(civil.start!.getTime());
    expect(astronomical.start!.getTime()).toBeLessThan(
      nautical.start!.getTime(),
    );
    expect(civil.end!.getTime()).toBeLessThan(nautical.end!.getTime());
    expect(nautical.end!.getTime()).toBeLessThan(astronomical.end!.getTime());
  });

  it("detects polar day and leaves the elevation curve fully drawable", () => {
    const curve = getSunCurve(
      POLAR_DAY.lat,
      POLAR_DAY.lon,
      new Date("2026-06-20T12:00:00Z"),
    );
    expect(curve.dayState.polarDay).toBe(true);
    expect(curve.dayState.polarNight).toBe(false);
    expect(curve.rise).toBeNull();
    expect(curve.set).toBeNull();
    // The curve still draws: 24 real samples, every one above the horizon.
    expect(curve.points).toHaveLength(24);
    expect(curve.points.every((p) => p.elevationDeg > 0)).toBe(true);
    expect(curve.dayState.nextTransition).not.toBeNull();
  });

  it("detects polar night and leaves the elevation curve fully drawable", () => {
    const curve = getSunCurve(POLAR_DAY.lat, POLAR_DAY.lon, POLAR_NIGHT_DATE);
    expect(curve.dayState.polarNight).toBe(true);
    expect(curve.dayState.polarDay).toBe(false);
    expect(curve.rise).toBeNull();
    expect(curve.set).toBeNull();
    expect(curve.points).toHaveLength(24);
    expect(curve.points.every((p) => p.elevationDeg < 0)).toBe(true);
    expect(curve.dayState.nextTransition).not.toBeNull();
  });

  it("finds a next-transition date strictly after the reference day for a polar state", () => {
    const date = new Date("2026-06-20T12:00:00Z");
    const curve = getSunCurve(POLAR_DAY.lat, POLAR_DAY.lon, date);
    expect(curve.dayState.nextTransition!.getTime()).toBeGreaterThan(
      date.getTime(),
    );
  });

  it("leaves polar flags false and next transition null for an ordinary station", () => {
    const curve = getSunCurve(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-05T13:14:00Z"),
    );
    expect(curve.dayState.polarDay).toBe(false);
    expect(curve.dayState.polarNight).toBe(false);
    expect(curve.dayState.nextTransition).toBeNull();
  });
});

describe("getNextSunEvent", () => {
  it("picks today's sunset when it is still ahead of now", () => {
    // 13:14Z is mid-morning in Austin, so the next crossing is today's sunset.
    const event = getNextSunEvent(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-05T13:14:00Z"),
    );
    expect(event?.type).toBe("sunset");
    // Austin sunset in September falls after 00:00 UTC (CDT is UTC-5).
    expect(event?.at.toISOString().slice(0, 10)).toBe("2026-09-06");
  });

  it("rolls over to tomorrow's sunrise once both of today's events have passed", () => {
    // Well after sunset in Austin (UTC-5ish in September).
    const event = getNextSunEvent(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-06T03:00:00Z"),
    );
    expect(event?.type).toBe("sunrise");
    expect(event?.at.toISOString().slice(0, 10)).toBe("2026-09-06");
  });

  it("returns null through a polar day, when neither event ever comes", () => {
    const POLAR_DAY = { lat: 78, lon: 15 };
    const event = getNextSunEvent(
      POLAR_DAY.lat,
      POLAR_DAY.lon,
      new Date("2026-06-20T12:00:00Z"),
    );
    expect(event).toBeNull();
  });
});

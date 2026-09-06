import { describe, expect, it } from "vitest";
import {
  getGreylineGlowIntensity,
  getGreylineIntensityCurve,
  getGreylineVisualParams,
  getMutualGreylineWindow,
  type GreylineIntensity,
} from "./greyline";

const ALL_LEVELS: GreylineIntensity[] = ["peak", "enhanced", "normal", "none"];

/** Austin, TX — an ordinary mid-latitude station used across these tests. */
const AUSTIN = { lat: 30.27, lon: -97.74 };
/** Two stations 5 degrees of longitude apart on the same parallel: their
 * sunrise/sunset crossings are about 20 minutes apart in UTC, well inside
 * each other's +/-30 minute grey-line window, so a mutual overlap is
 * guaranteed on every ordinary (non-polar) day. */
const NEAR_A = { lat: 30, lon: 0 };
const NEAR_B = { lat: 30, lon: 5 };

describe("getGreylineGlowIntensity", () => {
  it("returns 0 when greyline is inactive so the glow renders nothing", () => {
    // TerminatorEnhancement3D early-returns on intensity <= 0. This is the
    // whole point of the helper: outside greyline hours the animated glow
    // must disappear instead of painting a permanent second amber band on
    // top of the static Greyline ribbon.
    expect(getGreylineGlowIntensity("none")).toBe(0);
  });

  it("is strictly increasing from normal to peak", () => {
    const normal = getGreylineGlowIntensity("normal");
    const enhanced = getGreylineGlowIntensity("enhanced");
    const peak = getGreylineGlowIntensity("peak");

    expect(normal).toBeGreaterThan(0);
    expect(enhanced).toBeGreaterThan(normal);
    expect(peak).toBeGreaterThan(enhanced);
  });

  it("stays within the 0-1 opacity multiplier range for every level", () => {
    for (const level of ALL_LEVELS) {
      const value = getGreylineGlowIntensity(level);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("peaks at full strength", () => {
    expect(getGreylineGlowIntensity("peak")).toBe(1);
  });

  it("orders the same way as the static greyline band opacity", () => {
    // The glow and the band underneath it are driven by the same intensity
    // level, so a level that brightens one must not dim the other.
    const active: GreylineIntensity[] = ["normal", "enhanced", "peak"];
    const glow = active.map(getGreylineGlowIntensity);
    const band = active.map((l) => getGreylineVisualParams(l).opacity);

    for (let i = 1; i < active.length; i++) {
      expect(glow[i]).toBeGreaterThan(glow[i - 1]);
      expect(band[i]).toBeGreaterThan(band[i - 1]);
    }
  });
});

describe("getGreylineIntensityCurve", () => {
  it("samples 24 hourly points spanning the UTC day containing the given date", () => {
    const curve = getGreylineIntensityCurve(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-05T13:14:00Z"),
    );
    expect(curve).toHaveLength(24);
    expect(curve[0].hour).toBe(0);
    expect(curve[0].at.toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(curve[23].hour).toBe(23);
  });

  it("keeps every sample's intensity within the 0-1 opacity range and matching its level", () => {
    const curve = getGreylineIntensityCurve(
      AUSTIN.lat,
      AUSTIN.lon,
      new Date("2026-09-05T13:14:00Z"),
    );
    for (const sample of curve) {
      expect(sample.intensity).toBeGreaterThanOrEqual(0);
      expect(sample.intensity).toBeLessThanOrEqual(1);
      expect(sample.intensity).toBe(
        getGreylineVisualParams(sample.level).opacity,
      );
    }
    // Twice a day the terminator crosses this station, so at least one
    // sampled hour must land in an active (enhanced/peak) level.
    expect(
      curve.some(
        (sample) => sample.level === "peak" || sample.level === "enhanced",
      ),
    ).toBe(true);
  });
});

describe("getMutualGreylineWindow", () => {
  it("finds an overlap between two nearby stations whose terminator crossings nearly coincide", () => {
    const date = new Date("2026-09-05T00:00:00Z");
    const overlap = getMutualGreylineWindow(
      NEAR_A.lat,
      NEAR_A.lon,
      NEAR_B.lat,
      NEAR_B.lon,
      date,
    );
    expect(overlap).not.toBeNull();
    expect(overlap!.start.getTime()).toBeLessThan(overlap!.end.getTime());
    // The soonest overlap on or after the reference date, per the probe
    // above: the sunrise-side window starting 2026-09-05T05:10:27.654Z.
    expect(overlap!.start.toISOString()).toBe("2026-09-05T05:10:27.654Z");
    expect(overlap!.active).toBe(false);
  });

  it("marks the window active when `date` falls inside it", () => {
    const inside = new Date("2026-09-05T05:20:00Z");
    const overlap = getMutualGreylineWindow(
      NEAR_A.lat,
      NEAR_A.lon,
      NEAR_B.lat,
      NEAR_B.lon,
      inside,
    )!;
    expect(overlap.active).toBe(true);
    expect(inside.getTime()).toBeGreaterThanOrEqual(overlap.start.getTime());
    expect(inside.getTime()).toBeLessThan(overlap.end.getTime());
  });

  it("returns null when the two stations' windows never coincide", () => {
    // 90 degrees of longitude apart is a 6-hour solar-time offset: far
    // enough from either a matching sunrise or a matching sunset that no
    // pair of +/-30 minute windows can intersect.
    const overlap = getMutualGreylineWindow(
      AUSTIN.lat,
      AUSTIN.lon,
      AUSTIN.lat,
      AUSTIN.lon + 90,
      new Date("2026-09-05T00:00:00Z"),
    );
    expect(overlap).toBeNull();
  });

  it("returns the same window instant regardless of the search widening past the crossing", () => {
    // A station right on top of itself always overlaps its own window fully.
    const date = new Date("2026-09-05T00:00:00Z");
    const overlap = getMutualGreylineWindow(
      AUSTIN.lat,
      AUSTIN.lon,
      AUSTIN.lat,
      AUSTIN.lon,
      date,
      15,
    );
    expect(overlap).not.toBeNull();
    expect(overlap!.end.getTime() - overlap!.start.getTime()).toBe(30 * 60_000);
  });
});

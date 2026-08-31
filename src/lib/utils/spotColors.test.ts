import { describe, expect, it } from "vitest";
import {
  AGE_COLOR_STOPS,
  getAgeColor,
  getBandColor,
  getSnrColor,
  getSpotColor,
  SNR_COLOR_STOPS,
} from "./spotColors";

describe("getSnrColor", () => {
  it("runs weak-to-strong, the direction the Colors popover describes", () => {
    // Legend order is the ramp order, so the array itself has to ascend or the
    // legend reads green-to-red under a "weak red to strong green" label.
    expect(getSnrColor(-30)).toBe(SNR_COLOR_STOPS[0].color);
    expect(getSnrColor(25)).toBe(
      SNR_COLOR_STOPS[SNR_COLOR_STOPS.length - 1].color,
    );
    const bounds = SNR_COLOR_STOPS.map((s) => s.minDb);
    expect(bounds).toEqual([...bounds].sort((a, b) => a - b));
  });

  it("gives every stop a distinct color", () => {
    const colors = new Set(SNR_COLOR_STOPS.map((s) => s.color));
    expect(colors.size).toBe(SNR_COLOR_STOPS.length);
  });

  it("puts each stop's lower bound in that stop", () => {
    for (const stop of SNR_COLOR_STOPS) {
      if (Number.isFinite(stop.minDb)) {
        expect(getSnrColor(stop.minDb)).toBe(stop.color);
      }
    }
  });
});

describe("getAgeColor", () => {
  it("returns the newest stop for a fresh spot and the oldest for a stale one", () => {
    expect(getAgeColor(0)).toBe(AGE_COLOR_STOPS[0].color);
    expect(getAgeColor(10000)).toBe(
      AGE_COLOR_STOPS[AGE_COLOR_STOPS.length - 1].color,
    );
  });

  it("clamps a negative age to the newest stop rather than falling through", () => {
    // Clock skew between the spot source and the browser can put a spot
    // slightly in the future.
    expect(getAgeColor(-2)).toBe(AGE_COLOR_STOPS[0].color);
  });

  it("gives every stop a distinct color", () => {
    const colors = new Set(AGE_COLOR_STOPS.map((s) => s.color));
    expect(colors.size).toBe(AGE_COLOR_STOPS.length);
  });
});

describe("getSpotColor", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);

  it("colors by SNR when the mode is snr and the spot reports one", () => {
    expect(getSpotColor({ band: "20m", snr: 15 }, "snr")).toBe(getSnrColor(15));
  });

  it("uses a reported SNR of 0 rather than treating it as missing", () => {
    // 0 dB is a real, decodable signal -- a truthiness check would drop it.
    expect(getSpotColor({ band: "20m", snr: 0 }, "snr")).toBe(getSnrColor(0));
  });

  it("falls back to band color when a spot reports no SNR", () => {
    // Mixed feeds are normal: RBN reports SNR, DX cluster usually does not.
    expect(getSpotColor({ band: "20m" }, "snr")).toBe(getBandColor("20m"));
  });

  it("colors by age against the supplied reference time", () => {
    const time = new Date(now - 20 * 60000);
    expect(getSpotColor({ band: "20m", time }, "age", now)).toBe(
      getAgeColor(20),
    );
  });

  it("accepts a string timestamp, which is how spots arrive over JSON", () => {
    const time = new Date(now - 20 * 60000).toISOString();
    expect(getSpotColor({ band: "20m", time }, "age", now)).toBe(
      getAgeColor(20),
    );
  });

  it("falls back to band color for an unparseable timestamp", () => {
    expect(getSpotColor({ band: "20m", time: "not a date" }, "age", now)).toBe(
      getBandColor("20m"),
    );
  });

  it("still honors mode and band coloring", () => {
    expect(getSpotColor({ band: "20m", snr: 15 }, "band")).toBe(
      getBandColor("20m"),
    );
    expect(getSpotColor({ band: "20m", snr: 15, mode: "CW" }, "mode")).not.toBe(
      getSnrColor(15),
    );
  });

  it("distinguishes snr and age modes from band coloring", () => {
    // The regression this file exists for: both modes were routed straight
    // through getBandColor, so selecting either changed nothing on the map.
    const spot = { band: "20m", snr: 15, time: new Date(now) };
    expect(getSpotColor(spot, "snr", now)).not.toBe(getBandColor("20m"));
    expect(getSpotColor(spot, "age", now)).not.toBe(getBandColor("20m"));
  });
});

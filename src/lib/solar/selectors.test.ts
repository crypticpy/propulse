import { describe, expect, it } from "vitest";
import {
  fluxTrendWithForecastTail,
  generalHfGuidance,
  latestByTime,
  protonScale,
  widgetState,
  xrayClass,
} from "./selectors";

describe("solar selectors", () => {
  it("selects by maximum timestamp instead of array position", () => {
    const latest = latestByTime(
      [
        { at: "2026-07-15T19:00:00Z", value: 2 },
        { at: "2026-07-15T18:00:00Z", value: 1 },
      ],
      (point) => point.at,
    );
    expect(latest?.value).toBe(2);
  });

  it("keeps missing classifications distinct from valid quiet values", () => {
    expect(xrayClass(null)).toBeNull();
    expect(protonScale(null)).toBe("Unknown");
    expect(protonScale(0)).toBe("Below S1");
  });

  it("withholds guidance when required inputs are missing", () => {
    const guidance = generalHfGuidance({ sfi: null, kp: 2, bz: null });
    expect(guidance.level).toBe("insufficient");
    expect(guidance.missing).toEqual(["solar flux", "IMF Bz"]);
    expect(guidance.summary).toMatch(/withheld/i);
  });

  it("appends only outlook points after the last observed flux as a predicted tail", () => {
    const observed = [
      {
        time_tag: "2026-07-14T20:00:00",
        flux: 100,
        frequency: 2800 as const,
        schedule: null,
      },
      {
        time_tag: "2026-07-15T17:00:00",
        flux: 111,
        frequency: 2800 as const,
        schedule: null,
      },
    ];
    const outlook = [
      {
        date: "2026-07-15T00:00:00.000Z",
        predicted_flux: 108,
        predicted_planetary_a: 5,
        predicted_kp: 2,
      },
      {
        date: "2026-07-16T00:00:00.000Z",
        predicted_flux: 105,
        predicted_planetary_a: 5,
        predicted_kp: 2,
      },
      {
        date: "2026-07-17T00:00:00.000Z",
        predicted_flux: 104,
        predicted_planetary_a: 5,
        predicted_kp: 2,
      },
    ];
    const trend = fluxTrendWithForecastTail(observed, outlook);
    expect(trend.map((point) => point.kind)).toEqual([
      "observed",
      "observed",
      "predicted",
      "predicted",
    ]);
    expect(trend.map((point) => point.flux)).toEqual([100, 111, 105, 104]);
  });

  it("returns only observed points when no outlook data is available", () => {
    const observed = [
      {
        time_tag: "2026-07-15T17:00:00",
        flux: 111,
        frequency: 2800 as const,
        schedule: null,
      },
    ];
    expect(fluxTrendWithForecastTail(observed, undefined)).toEqual([
      { time_tag: "2026-07-15T17:00:00", flux: 111, kind: "observed" },
    ]);
    expect(fluxTrendWithForecastTail(undefined, undefined)).toEqual([]);
  });

  it("keeps a hard-expired query distinct from a generic error", () => {
    expect(
      widgetState({
        pending: false,
        fetching: false,
        error: true,
        unavailable: true,
      }),
    ).toBe("unavailable");
  });
});

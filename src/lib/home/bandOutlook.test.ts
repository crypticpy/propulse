import { expect, it } from "vitest";
import {
  buildHomeBandOutlook,
  outlookLevel,
  pickHomeOutlookBand,
  OUTLOOK_BANDS,
  type HomeBandOutlookInput,
} from "./bandOutlook";

const input: HomeBandOutlookInput = {
  band: "20m",
  lat: 39.5,
  lon: -105,
  now: Date.parse("2026-09-05T23:30:00Z"),
  kp: 2,
  sfi: 120,
  predictedKp: [
    {
      time_tag: "2026-09-06T00:00:00Z",
      kp: 5,
      kind: "predicted",
      noaa_scale: null,
      a_running: null,
    },
  ],
  fluxForecast: {
    issued_at: "2026-09-05T00:00:00Z",
    forecast: [
      { date: "2026-09-06", predicted_flux: 130, predicted_planetary_a: 5 },
    ],
  },
};

it("maps every model condition onto a spoken level", () => {
  expect(outlookLevel("Excellent")).toBe("stronger");
  expect(outlookLevel("Good")).toBe("stronger");
  expect(outlookLevel("Fair")).toBe("mixed");
  expect(outlookLevel("Poor")).toBe("limited");
  expect(outlookLevel("Aurora")).toBe("limited");
  expect(outlookLevel(undefined)).toBe("unknown");
});

it("builds 24 consecutive hourly cells starting at the current UTC hour", () => {
  const hours = buildHomeBandOutlook(input);
  expect(hours).toHaveLength(24);
  expect(hours[0].hour).toBe(23);
  expect(hours[0].at).toBe(Date.parse("2026-09-05T23:00:00Z"));
  expect(hours.map((cell) => cell.hour)).toEqual(
    Array.from({ length: 24 }, (_unused, index) => (23 + index) % 24),
  );
  hours.forEach((cell, index) => {
    expect(cell.at).toBe(hours[0].at + index * 3_600_000);
    expect(cell.label.length).toBeGreaterThan(0);
  });
});

it("uses the NOAA forecast for hours it covers and holds current readings otherwise", () => {
  const hours = buildHomeBandOutlook(input);
  expect(hours[0]).toMatchObject({
    kp: 2,
    sfi: 120,
    kpSource: "current held constant",
  });
  // 2026-09-06T02:00Z falls inside the 00:00Z predicted-Kp interval.
  const forecastHour = hours.find(
    (cell) => cell.at === Date.parse("2026-09-06T02:00:00Z"),
  );
  expect(forecastHour).toMatchObject({
    kp: 5,
    sfi: 130,
    kpSource: "NOAA forecast",
    fluxSource: "NOAA forecast",
  });
});

it("tracks daylight at the operator's own location across the UTC day", () => {
  const hours = buildHomeBandOutlook(input);
  const daylight = hours.filter((cell) => cell.daylight);
  expect(daylight.length).toBeGreaterThan(0);
  expect(daylight.length).toBeLessThan(24);
});

it("withholds the outlook rather than guessing when an input is unusable", () => {
  expect(buildHomeBandOutlook({ ...input, sfi: 0 })).toEqual([]);
  expect(buildHomeBandOutlook({ ...input, kp: 12 })).toEqual([]);
  expect(buildHomeBandOutlook({ ...input, lat: Number.NaN })).toEqual([]);
  expect(buildHomeBandOutlook({ ...input, band: "2m" })).toEqual([]);
});

it("keeps the operator's active band when the model covers it", () => {
  expect(pickHomeOutlookBand("40m", input)).toEqual({
    band: "40m",
    reason: "active",
  });
});

it("falls back to the best band right now when there is no usable active band", () => {
  for (const activeBand of [null, undefined, "", "2m", "70cm"]) {
    const choice = pickHomeOutlookBand(activeBand, input);
    expect(choice.reason).toBe("best-now");
    expect(OUTLOOK_BANDS as readonly string[]).toContain(choice.band);
  }
});

it("picks a band no other band beats, breaking ties toward the highest frequency", () => {
  const RANK = { stronger: 0, mixed: 1, limited: 2, unknown: 3 };
  const bands: string[] = [...OUTLOOK_BANDS];
  for (const solar of [
    { kp: 0, sfi: 200 },
    { kp: 2, sfi: 120 },
    { kp: 8, sfi: 70 },
  ]) {
    const chosen = pickHomeOutlookBand(null, { ...input, ...solar });
    // The chosen band is stable and is the current hour's own first cell.
    expect(pickHomeOutlookBand(null, { ...input, ...solar })).toEqual(chosen);
    const chosenLevel =
      buildHomeBandOutlook({ ...input, ...solar, band: chosen.band })[0].level;
    for (const band of bands) {
      const level = buildHomeBandOutlook({ ...input, ...solar, band })[0].level;
      if (RANK[level] < RANK[chosenLevel]) {
        throw new Error(`${band} (${level}) beats ${chosen.band} (${chosenLevel})`);
      }
      if (
        level === chosenLevel &&
        bands.indexOf(band) > bands.indexOf(chosen.band)
      ) {
        throw new Error(`${band} ties ${chosen.band} but is higher in frequency`);
      }
    }
  }
});

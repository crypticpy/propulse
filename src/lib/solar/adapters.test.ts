import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adaptDrapText,
  adaptAlerts,
  adaptCme,
  adaptDst,
  adaptFluxForecastText,
  adaptFluxOutlookText,
  adaptKp,
  adaptLatestXray,
  adaptMagnetometer,
  adaptNoaaScales,
  adaptProbabilities,
  adaptProtons,
  adaptSolarFlux,
  adaptSunspots,
  adaptWindMag,
  adaptWindPlasma,
  adaptXray,
  adaptXrayFlares,
} from "./adapters";
import {
  alerts,
  cme,
  drapText,
  dst,
  dualXray,
  forecastText,
  latestXray,
  magnetometerNewestFirst,
  malformedDrapText,
  malformedForecastText,
  malformedOutlookText,
  mixedProtons,
  newestFirstFlux,
  newestFirstProbabilities,
  outlookText,
  reversedKp,
  rtswWindPlasma,
  scales,
  sunspots,
  windMag,
  windPlasma,
} from "@/test/fixtures/solar/providerFixtures";

describe("solar provider adapters", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T19:00:00Z"));
  });

  it("selects the newest solar-flux observation by timestamp and returns chronological data", () => {
    const result = adaptSolarFlux(newestFirstFlux);
    expect(result.data.map((point) => point.flux)).toEqual([100, 105, 111]);
    expect(result.data.at(-1)?.time_tag).toBe("2026-07-15T17:00:00");
    expect(result.observedAt).toBe("2026-07-15T17:00:00.000Z");
  });

  it("selects the maximum forecast issue date instead of an array position", () => {
    const result = adaptProbabilities([...newestFirstProbabilities].reverse());
    expect(result.data.issue_time).toBe("2026-07-15T00:00:00.000Z");
    expect(result.data.c_class).toBe(55);
    expect(result.data.proton_10mev).toBe(2);
  });

  it("rejects out-of-range probability values instead of presenting a valid zero", () => {
    expect(() =>
      adaptProbabilities([
        { ...newestFirstProbabilities[0], x_class_1_day: 101 },
      ]),
    ).toThrow(/between 0 and 100/);
  });

  it("sorts official three-hour Kp intervals and clamps observedAt to now for future estimated bins", () => {
    const result = adaptKp(reversedKp);
    expect(result.data.map((point) => point.kind)).toEqual([
      "observed",
      "estimated",
      "predicted",
      "predicted",
    ]);
    // The 21:00Z bin is an "estimated" same-day value two hours ahead of the mocked now;
    // observedAt must not report a future observation, so it clamps to now (19:00Z).
    expect(result.observedAt).toBe("2026-07-15T19:00:00.000Z");
  });

  it("rejects minute-grain Kp rows from the official three-hour contract", () => {
    expect(() =>
      adaptKp([
        {
          time_tag: "2026-07-15T18:01:00Z",
          kp: 2,
          observed: "observed",
        },
      ]),
    ).toThrow(/no usable/i);
  });

  it("builds a true timestamp-bounded latest-hour magnetometer series", () => {
    const result = adaptMagnetometer(magnetometerNewestFirst);
    expect(result.data).toHaveLength(2);
    expect(result.data.at(-1)?.bz_gsm).toBe(-4);
    expect(result.data[0].by_gsm).toBe(1);
    expect(result.data.at(-1)?.by_gsm).toBeNull();
  });

  it("widens the magnetometer window for the 24-hour wall variant without changing the default", () => {
    const tooOld = { time_tag: "2026-07-14T10:00:00Z", bz_gsm: 9, by_gsm: 2, bt: 4 };
    const result = adaptMagnetometer(
      [...magnetometerNewestFirst, tooOld],
      1_600,
      24 * 60 * 60_000,
    );
    // The 80-minute-old row now survives inside the 24-hour window...
    expect(result.data).toHaveLength(3);
    expect(result.data[0].time_tag).toBe("2026-07-15T17:40:00Z");
    // ...but a row more than 24 hours before the latest sample still does not.
    expect(result.data.some((point) => point.time_tag === tooOld.time_tag)).toBe(false);
  });

  it("widens the X-ray window for the 24-hour wall variant without changing the default", () => {
    const dayOld = { time_tag: "2026-07-14T18:50:00Z", satellite: 18, flux: 2e-7, energy: "0.1-0.8nm" };
    const result = adaptXray([...dualXray, dayOld], 1_600, 24 * 60 * 60_000);
    expect(result.data).toHaveLength(3);
    expect(result.data[0].time_tag).toBe(dayOld.time_tag);
  });

  it("filters the exact >=10 MeV proton channel before sorting and bounding", () => {
    const result = adaptProtons(mixedProtons);
    expect(result.data).toHaveLength(2);
    expect(result.data.every((point) => point.energy === ">=10 MeV")).toBe(true);
    expect(result.data.at(-1)?.flux).toBe(11);
  });

  it("fails when the required proton channel is absent", () => {
    expect(() => adaptProtons(mixedProtons.filter((row) => row.energy !== ">=10 MeV"))).toThrow(
      /Required product channel/,
    );
  });

  it("drops zero-flux and electron-contaminated X-ray samples", () => {
    const contaminated = [
      { time_tag: "2026-07-15T18:58:00Z", satellite: 18, flux: 0, energy: "0.1-0.8nm" },
      {
        time_tag: "2026-07-15T18:59:00Z",
        satellite: 18,
        flux: 3e-7,
        energy: "0.1-0.8nm",
        electron_contaminaton: true,
      },
      {
        time_tag: "2026-07-15T19:00:00Z",
        satellite: 18,
        flux: 3e-7,
        energy: "0.1-0.8nm",
        electron_contamination: true,
      },
    ];
    const result = adaptXray([...dualXray, ...contaminated]);
    expect(result.data).toHaveLength(2);
    expect(result.data.at(-1)?.flux).toBe(4e-7);
    expect(result.observedAt).toBe("2026-07-15T18:44:00.000Z");
  });

  it("filters the exact GOES long X-ray channel", () => {
    const result = adaptXray(dualXray);
    expect(result.data).toHaveLength(2);
    expect(result.data.every((point) => point.energy === "0.1-0.8nm")).toBe(true);
    expect(result.data.at(-1)?.flux).toBe(4e-7);
  });

  it("parses a rectangular D-RAP grid and rejects inconsistent rows", () => {
    expect(adaptDrapText(drapText).data.frequencies).toHaveLength(2);
    expect(() => adaptDrapText(malformedDrapText)).toThrow(/row width/);
  });

  it("parses an issued three-day forecast and fails visibly on format drift", () => {
    const result = adaptFluxForecastText(forecastText);
    expect(result.data.forecast).toHaveLength(3);
    expect(result.data.forecast[0]).toMatchObject({
      predicted_flux: 105,
      predicted_planetary_a: 12,
    });
    expect(result.observedAt).toBe("2026-07-15T12:00:00.000Z");
    expect(() => adaptFluxForecastText(malformedForecastText)).toThrow(/issue time/);
  });

  it("validates monthly sunspots and Dst without converting empty data to zero", () => {
    expect(adaptSunspots([...sunspots].reverse()).data.at(-1)?.ssn).toBe(130.2);
    expect(adaptDst([...dst].reverse()).data.at(-1)?.dst).toBe(-25);
    expect(() => adaptSunspots([])).toThrow(/no usable/i);
    expect(() => adaptDst([])).toThrow(/no usable/i);
  });

  it("validates current NOAA scales and rejects out-of-range scale values", () => {
    expect(adaptNoaaScales(scales).data.radio_blackout.scale).toBe(1);
    expect(() =>
      adaptNoaaScales({
        ...scales,
        "0": { ...scales["0"], R: { Scale: "9", Text: "invalid" } },
      }),
    ).toThrow(/outside 0–5/);
  });

  it("distinguishes a successful empty alert snapshot from malformed alerts", () => {
    expect(adaptAlerts([]).data).toEqual([]);
    expect(adaptAlerts(alerts).data[0]?.severity).toBe("warning");
    expect(() => adaptAlerts([{ product_id: "bad" }])).toThrow(/no usable/i);
  });

  it("selects a valid latest X-ray flare and rejects missing classifications", () => {
    expect(adaptLatestXray(latestXray).data.max_class).toBe("C1.5");
    expect(() => adaptLatestXray([{ ...latestXray[0], max_class: "" }])).toThrow(
      /class labels/,
    );
  });

  it("keeps wind magnetic and plasma products independently valid", () => {
    expect(adaptWindMag(windMag).data.at(-1)?.bz_gsm).toBe(-4);
    expect(adaptWindPlasma(windPlasma).data.at(-1)?.speed).toBe(430);
    expect(
      adaptWindMag([
        { time_tag: "2026-07-15T18:59:00Z", bt: 7, bz_gsm: -1 },
      ]).data[0]?.bz_gsm,
    ).toBe(-1);
    expect(
      adaptWindPlasma([
        { time_tag: "2026-07-15T18:59:00Z", proton_speed: 443 },
      ]).data[0]?.speed,
    ).toBe(443);
    expect(() => adaptWindMag([["time_tag", "bz_gsm"]])).toThrow(/no usable/i);
    expect(() => adaptWindPlasma([["time_tag", "speed"]])).toThrow(/no usable/i);
  });

  it("reads the RTSW real-time plasma shape (proton_* fields only) and widens retention for the wall", () => {
    const result = adaptWindPlasma(rtswWindPlasma, 2_500, 24 * 60 * 60_000);
    expect(result.data).toHaveLength(2);
    expect(result.data.at(-1)?.speed).toBe(430);
    expect(result.data.at(-1)?.density).toBe(6);
    expect(result.data.at(-1)?.temperature).toBe(110_000);
  });

  it("parses the 27-day flux outlook and fails visibly on format drift", () => {
    const result = adaptFluxOutlookText(outlookText);
    expect(result.data.outlook).toHaveLength(3);
    expect(result.data.outlook[0]).toMatchObject({
      predicted_flux: 110,
      predicted_planetary_a: 12,
      predicted_kp: 3,
    });
    expect(result.observedAt).toBe("2026-07-15T13:12:00.000Z");
    expect(() => adaptFluxOutlookText(malformedOutlookText)).toThrow(/issue time/);
  });

  it("allows a legitimate empty CME analysis window but rejects malformed events", () => {
    expect(adaptCme([]).data).toEqual([]);
    expect(adaptCme(cme).data[0]?.speed).toBe(650);
    expect(() => adaptCme([{ ...cme[0], latitude: 200 }])).toThrow(/no usable/i);
  });

  it("sorts flares newest first, resolves an unassigned region to null, and allows a legitimate empty week", () => {
    const rows = [
      {
        time_tag: "2026-07-15T17:39:00Z",
        current_class: "B3.9",
        begin_time: "2026-07-15T17:03:00Z",
        max_time: "2026-07-15T17:14:00Z",
        max_class: "C1.5",
        end_time: "2026-07-15T17:24:00Z",
        region: 4136,
      },
      {
        time_tag: "2026-07-15T18:39:00Z",
        current_class: "M1.0",
        begin_time: "2026-07-15T18:03:00Z",
        max_time: "2026-07-15T18:14:00Z",
        max_class: "M1.0",
        end_time: "2026-07-15T18:24:00Z",
        region: 0,
      },
    ];

    const result = adaptXrayFlares(rows);
    expect(result.data.map((flare) => flare.maxClass)).toEqual([
      "M1.0",
      "C1.5",
    ]);
    expect(result.data[0]?.region).toBeNull();
    expect(result.data[1]?.region).toBe("4136");
    expect(result.observedAt).toBe("2026-07-15T18:14:00.000Z");

    expect(adaptXrayFlares([]).data).toEqual([]);
    expect(
      adaptXrayFlares([
        rows[0],
        { ...rows[1], max_class: "C1garbage" },
      ]).data.map((flare) => flare.maxClass),
    ).toEqual(["C1.5"]);
    expect(() => adaptXrayFlares([{ ...rows[0], max_class: "" }])).toThrow(
      /no usable/i,
    );
  });
});

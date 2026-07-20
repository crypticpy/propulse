import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectForecastsStrict,
  forecastHorizonCoverage,
  parse3DayForecast,
  parse45DayForecast,
  sha256PayloadBytes,
} from "./forecast.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("forecast parsers", () => {
  it("preserves issue and valid times from the 45-day JSON product", () => {
    const parsed = parse45DayForecast({
      issued: "2026-07-12T00:00:00Z",
      source: "NOAA SWPC",
      product: "45 Day Forecast",
      units: { ap: "nT", f107: "sfu" },
      data: [
        { time: "2026-07-13T00:00:00Z", metric: "ap", value: 10 },
        { time: "2026-07-13T00:00:00Z", metric: "f107", value: 105 },
      ],
    });

    expect(parsed.issuedAt).toBe("2026-07-12T00:00:00.000Z");
    expect(parsed.values).toEqual([
      { validAt: "2026-07-13T00:00:00.000Z", metric: "ap", value: 10, unit: "nT" },
      { validAt: "2026-07-13T00:00:00.000Z", metric: "f107", value: 105, unit: "sfu" },
    ]);
    expect(forecastHorizonCoverage(parsed)).toEqual([24]);
  });

  it("extracts daily and 3-hour values from the NOAA text product", () => {
    const kRows = ["00-03", "03-06", "06-09", "09-12", "12-15", "15-18", "18-21", "21-00"]
      .map((range) => `Mid/${range}UT 2 3 1\nHigh/${range}UT 3 4 2`)
      .join("\n");
    const text = `:Issued: 2026 Jul 11 2200 UTC
:Prediction_dates: 2026 Jul 12 2026 Jul 13 2026 Jul 14
A_Planetary 24 10 6
:10cm_flux: 105 105 115
${kRows}`;
    const parsed = parse3DayForecast(text);

    expect(parsed.issuedAt).toBe("2026-07-11T22:00:00.000Z");
    expect(parsed.values).toHaveLength(54);
    expect(parsed.values).toContainEqual({
      validAt: "2026-07-12T00:00:00.000Z",
      metric: "planetary_ap",
      value: 24,
      unit: "index",
    });
    expect(parsed.values).toContainEqual({
      validAt: "2026-07-13T21:00:00.000Z",
      metric: "high_latitude_k",
      value: 4,
      unit: "K index",
    });
    expect(forecastHorizonCoverage(parsed)).toEqual([3, 6, 12, 24]);
  });

  it("rejects a 45-day payload without both required metrics", () => {
    expect(() => parse45DayForecast({
      issued: "2026-07-12T00:00:00Z",
      source: "NOAA SWPC",
      product: "45 Day Forecast",
      data: [
        { time: "2026-07-13T00:00:00Z", metric: "f107", value: 105 },
      ],
    })).toThrow("must contain Ap and F10.7");
  });

  it("preserves and hashes exact upstream bytes before JSON parsing", async () => {
    const text = `{
  "issued":"2026-07-12T00:00:00Z",
  "source":"NOAA SWPC",
  "product":"45 Day Forecast",
  "data":[
    {"time":"2026-07-13T00:00:00Z","metric":"ap","value":10},
    {"time":"2026-07-13T00:00:00Z","metric":"f107","value":105}
  ]
}\n`;
    const bytes = new TextEncoder().encode(text);
    const exact = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const parsed = parse45DayForecast(
      JSON.parse(text),
      exact,
      "application/json; charset=utf-8",
    );

    expect(parsed.rawPayload).toEqual({
      content_type: "application/json; charset=utf-8",
      encoding: "base64",
      body_base64: Buffer.from(exact).toString("base64"),
    });
    expect(await sha256PayloadBytes(exact)).not.toBe(
      await sha256PayloadBytes(
        new TextEncoder().encode(JSON.stringify(JSON.parse(text))).buffer,
      ),
    );
  });

  it("uploads and verifies content-addressed bytes before recording metadata", async () => {
    const json = `{
  "issued":"2026-07-12T00:00:00Z",
  "source":"NOAA SWPC",
  "product":"45 Day Forecast",
  "data":[
    {"time":"2026-07-13T00:00:00Z","metric":"ap","value":10},
    {"time":"2026-07-13T00:00:00Z","metric":"f107","value":105}
  ]
}\n`;
    const kRows = [
      "00-03", "03-06", "06-09", "09-12",
      "12-15", "15-18", "18-21", "21-00",
    ].map((range) => `Mid/${range}UT 2 3 1\nHigh/${range}UT 3 4 2`).join("\n");
    const text = `:Issued: 2026 Jul 11 2200 UTC
:Prediction_dates: 2026 Jul 12 2026 Jul 13 2026 Jul 14
A_Planetary 24 10 6
:10cm_flux: 105 105 115
${kRows}`;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(
      url.includes("45-day") ? json : text,
      {
        status: 200,
        headers: {
          "content-type": url.includes("45-day")
            ? "application/json; charset=utf-8"
            : "text/plain; charset=utf-8",
        },
      },
    )));
    const objects = new Map<string, ArrayBuffer>();
    const events: string[] = [];
    const payloadRows: Array<Record<string, unknown>> = [];
    const db = {
      storage: {
        from: () => ({
          upload: async (path: string, body: ArrayBuffer) => {
            events.push(`upload:${path}`);
            objects.set(path, body);
            return { error: null };
          },
          download: async (path: string) => {
            events.push(`download:${path}`);
            const body = objects.get(path);
            return {
              data: body ? new Blob([body]) : null,
              error: body ? null : { message: "missing" },
            };
          },
        }),
      },
      from: (table: string) => ({
        upsert: async (rows: unknown) => {
          events.push(`db:${table}`);
          if (table === "space_weather_forecast_payloads") {
            payloadRows.push(rows as Record<string, unknown>);
          }
          return { error: null };
        },
      }),
    };

    const receipt = await collectForecastsStrict(db as never);

    expect(receipt.products).toHaveLength(2);
    expect(objects).toHaveLength(2);
    expect(payloadRows).toHaveLength(2);
    expect(payloadRows[0].source_object_path).toContain(
      payloadRows[0].payload_sha256,
    );
    expect(payloadRows[0].source_object_sha256).toBe(
      payloadRows[0].payload_sha256,
    );
    expect(events.findIndex((event) => event.startsWith("download:"))).toBeLessThan(
      events.findIndex((event) => event === "db:space_weather_forecast_payloads"),
    );
  });
});

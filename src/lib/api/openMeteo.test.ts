import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLocalWeather } from "./openMeteo";

/** The `current` block every response needs; tests vary only the daily part. */
const CURRENT = {
  temperature_2m: 28,
  wind_speed_10m: 18,
  wind_direction_10m: 225,
  weather_code: 2,
  is_day: 1,
  precipitation: 0,
  relative_humidity_2m: 64,
  surface_pressure: 1012,
};

function stubFetch(body: Record<string, unknown>) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchLocalWeather", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests and returns the coordinate-resolved timezone", async () => {
    const fetchMock = stubFetch({
      timezone: "Pacific/Kiritimati",
      current: CURRENT,
    });

    await expect(fetchLocalWeather(1.8721, -157.4278)).resolves.toMatchObject({
      timezone: "Pacific/Kiritimati",
      temperature: 28,
      isDay: true,
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestedUrl.searchParams.get("timezone")).toBe("auto");
    expect(requestedUrl.searchParams.get("latitude")).toBe("1.8721");
    expect(requestedUrl.searchParams.get("longitude")).toBe("-157.4278");
  });

  it("asks for today's rain chance and parses it", async () => {
    const fetchMock = stubFetch({
      timezone: "America/Chicago",
      current: CURRENT,
      daily: { time: ["2026-09-05"], precipitation_probability_max: [40] },
    });

    await expect(fetchLocalWeather(30.27, -97.74)).resolves.toMatchObject({
      precipitationProbability: 40,
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestedUrl.searchParams.get("daily")).toBe(
      "precipitation_probability_max",
    );
    expect(requestedUrl.searchParams.get("forecast_days")).toBe("1");
  });

  it("returns a null rain chance when the daily block is absent", async () => {
    stubFetch({ timezone: "America/Chicago", current: CURRENT });

    await expect(fetchLocalWeather(30.27, -97.74)).resolves.toMatchObject({
      precipitationProbability: null,
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLocalWeather } from "./openMeteo";

describe("fetchLocalWeather", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests and returns the coordinate-resolved timezone", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          timezone: "Pacific/Kiritimati",
          current: {
            temperature_2m: 28,
            wind_speed_10m: 18,
            wind_direction_10m: 225,
            weather_code: 2,
            is_day: 1,
            precipitation: 0,
            relative_humidity_2m: 64,
            surface_pressure: 1012,
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

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
});

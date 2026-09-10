import { describe, expect, it } from "vitest";
import { deriveOperationalWeatherAges } from "./operationalWeather";

describe("operational weather ages", () => {
  it("returns the freshest fast source and the oldest of each group", () => {
    const ages = deriveOperationalWeatherAges({
      space_weather: 3_600,
      kp: 300,
      magnetic_field: 420,
      solar_wind: 240,
      dst: 3_600,
      f107: 7_200,
      path_history: 30,
    });

    expect(ages.freshestFast).toEqual({
      source: "solar_wind",
      label: "Solar wind",
      seconds: 240,
    });
    expect(ages.oldestFast).toEqual({
      source: "magnetic_field",
      label: "IMF",
      seconds: 420,
    });
    expect(ages.oldestSlow).toEqual({
      source: "f107",
      label: "F10.7",
      seconds: 7_200,
    });
    expect(ages.aggregateSeconds).toBe(3_600);
  });

  it("never lets an unrelated input pose as a space-weather source", () => {
    const ages = deriveOperationalWeatherAges({
      space_weather: 900,
      path_history: 30,
    });

    expect(ages.freshestFast).toBeNull();
    expect(ages.oldestFast).toBeNull();
    expect(ages.oldestSlow).toBeNull();
    expect(ages.aggregateSeconds).toBe(900);
  });

  it("keeps the earliest declared source when two ages tie", () => {
    const ages = deriveOperationalWeatherAges({
      kp: 300,
      magnetic_field: 300,
    });

    expect(ages.freshestFast?.source).toBe("kp");
    expect(ages.oldestFast?.source).toBe("kp");
  });

  it("ignores non-finite and negative ages", () => {
    const ages = deriveOperationalWeatherAges({
      kp: Number.NaN,
      solar_wind: -1,
      dst: 3_600,
      space_weather: Number.POSITIVE_INFINITY,
    });

    expect(ages.freshestFast).toBeNull();
    expect(ages.oldestSlow?.source).toBe("dst");
    expect(ages.aggregateSeconds).toBeNull();
  });

  it("reports nothing when the prediction carries no freshness at all", () => {
    const ages = deriveOperationalWeatherAges(undefined);

    expect(ages).toEqual({
      freshestFast: null,
      oldestFast: null,
      oldestSlow: null,
      aggregateSeconds: null,
    });
  });
});

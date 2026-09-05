import { describe, expect, it } from "vitest";
import { parseHomeWeather, weatherIsCurrent } from "./weather";
describe("location weather truth", () => {
  const fixture = { timezone: "America/Denver", current: { time: 1000, temperature_2m: 18, wind_speed_10m: 8, weather_code: 0 }, hourly: { time: [1000,4600,8200], temperature_2m: [18,null,16], precipitation_probability: [0,20,null] } };
  it("uses epoch timestamps and preserves unknown forecast values", () => {
    const data = parseHomeWeather(fixture);
    expect(data.at).toBe(1000000); expect(data.timezone).toBe("America/Denver"); expect(data.gusts).toBeNull(); expect(data.hours).toHaveLength(2); expect(data.hours[0].rain).toBe(0); expect(data.hours[1].rain).toBeNull();
  });
  it("rejects missing current values and invalid timezones", () => {
    expect(()=>parseHomeWeather({})).toThrow(); expect(()=>parseHomeWeather({...fixture,current:{...fixture.current,temperature_2m:null}})).toThrow(); expect(()=>parseHomeWeather({...fixture,timezone:"invalid/zone"})).toThrow();
  });
  it("does not renew aged source readings on a successful refetch", () => {
    expect(weatherIsCurrent(1000000,1000001)).toBe(true);expect(weatherIsCurrent(1000000,6400000)).toBe(false);expect(weatherIsCurrent(2000000,1000000)).toBe(false);
  });
});

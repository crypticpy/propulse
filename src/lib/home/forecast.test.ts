import { expect, it } from "vitest";
import { buildHomeForecast, forecastSolarInput, upcomingKp, type HomeForecastInput } from "./forecast";
const input: HomeForecastInput = { origin:{lat:39.5,lon:-105},target:{lat:51.5,lon:7},now:Date.parse("2026-09-05T23:30:00Z"),kp:2,sfi:120,predictedKp:[{time_tag:"2026-09-06T00:00:00Z",kp:5,kind:"predicted",noaa_scale:null,a_running:null}],fluxForecast:{issued_at:"2026-09-05T00:00:00Z",forecast:[{date:"2026-09-06",predicted_flux:130,predicted_planetary_a:5}]},mode:"SSB",power:100,antenna:"dipole",noise:"residential" };
it("identifies official forecasts and held-current fallback at their actual validity times", () => {
  expect(forecastSolarInput(input,input.now)).toMatchObject({kp:2,sfi:120,kpSource:"current held constant"});
  expect(forecastSolarInput(input,Date.parse("2026-09-06T02:00:00Z"))).toMatchObject({kp:5,sfi:130,kpSource:"NOAA forecast"});
  expect(forecastSolarInput(input,Date.parse("2026-09-06T03:00:00Z"))).toMatchObject({kp:2,kpSource:"current held constant"});
});
it("runs the existing propagation model across UTC rollover and bounds the requested interval", () => {
  const columns=buildHomeForecast(input);expect(columns).toHaveLength(5);expect(columns[0].at).toBe(input.now);expect(columns[4].at-input.now).toBe(43200000);expect(columns[1].kp).toBe(5);expect(columns.every(c=>c.bands.length>0)).toBe(true);expect(buildHomeForecast({...input,power:0})).toEqual([]);
});

it("includes the ongoing predicted Kp interval in the next 24 hours", () => {
 const now=Date.parse("2026-09-06T01:00:00Z");
 expect(upcomingKp(input.predictedKp,now)).toHaveLength(1);
 expect(upcomingKp(input.predictedKp,now+7200000)).toEqual([]);
});

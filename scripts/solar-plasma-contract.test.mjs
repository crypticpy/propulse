import test from "node:test";
import assert from "node:assert/strict";
import { PLASMA_MAX_BYTES, validatePlasmaSeries } from "./solar-plasma-contract.mjs";

function fixture() {
  return {
    sourceUrl: "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
    observedAt: "2026-09-12T12:00:00Z",
    data: Array.from({ length: 1441 }, (_, i) => ({
      time_tag: new Date(Date.parse("2026-09-11T12:00:00Z") + i * 60_000).toISOString(),
      speed: 400, density: 5, temperature: null,
    })),
  };
}

test("accepts a full day above the retired summary budget", () => {
  const body = fixture();
  const bytes = Buffer.byteLength(JSON.stringify(body));
  assert.ok(bytes > 8000);
  validatePlasmaSeries(body, bytes);
});
test("still rejects oversized payloads", () => {
  assert.throws(() => validatePlasmaSeries(fixture(), PLASMA_MAX_BYTES + 1), /320 KB/);
});
for (const [name, mutate, error] of [
  ["empty", b => { b.data = []; }, /row budget/],
  ["too many rows", b => { b.data = Array(2501).fill(b.data[0]); }, /row budget/],
  ["duplicate", b => { b.data[1] = b.data[0]; }, /unique/],
  ["reversed", b => { b.data.reverse(); }, /ascending/],
  ["old", b => { b.data[0].time_tag = "2026-09-11T11:59:00Z"; }, /24-hour/],
  ["invalid date", b => { b.data[0].time_tag = "invalid"; }, /timestamps/],
  ["wrong latest", b => { b.observedAt = "2026-09-12T12:01:00Z"; b.data.shift(); }, /latest retained/],
  ["no measurements", b => { b.data[0].speed = null; b.data[0].density = null; }, /no usable/],
  ["numeric string", b => { b.data[0].speed = "400"; }, /invalid plasma/],
  ["wrong source", b => { b.sourceUrl = "https://example.com"; }, /provenance/],
]) {
  test(`rejects ${name}`, () => {
    const body = fixture(); mutate(body);
    assert.throws(() => validatePlasmaSeries(body, 200_000), error);
  });
}
test("accepts partial measurements and NOAA UTC timestamps", () => {
  const body = fixture();
  body.data[0].speed = null;
  body.data[0].time_tag = "2026-09-11 12:00:00";
  validatePlasmaSeries(body, 200_000);
});

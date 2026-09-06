import { describe, expect, it } from "vitest";
import { BAND_CENTER_FREQUENCIES } from "@/lib/data/feedlines";
import { routeCompileBandSchema, routeCompileModeSchema, routeCompileRequestSchema } from "@/lib/station/workbench/analysis/request";
import type { RouteCompileRequest } from "@/lib/station/workbench/analysis/types";

const identity = { revisionId: "home-r1", routeId: "main" };
const parseOptions = (options: unknown) => routeCompileRequestSchema.safeParse({ ...identity, options });

describe("selected route request boundary", () => {
  it("preserves omitted options and mode without an implicit WSPR or band", () => {
    const parsed: RouteCompileRequest = routeCompileRequestSchema.parse(identity);
    expect(parsed).toEqual(identity);
    expect(routeCompileRequestSchema.parse({ ...identity, options: {} })).toEqual({ ...identity, options: {} });
    expect(routeCompileRequestSchema.parse({ ...identity, options: { bands: ["20m"] } }).options).not.toHaveProperty("mode");
  });

  it("accepts all actual engine bands, preserving caller order", () => {
    const bands = Object.keys(BAND_CENTER_FREQUENCIES).reverse();
    expect(routeCompileRequestSchema.parse({ ...identity, options: { bands } }).options?.bands).toEqual(bands);
    expect(routeCompileRequestSchema.parse({ ...identity, options: { bands: ["40m", "20m"] } }).options?.bands).toEqual(["40m", "20m"]);
    expect(routeCompileBandSchema.parse("20m")).toBe("20m");
    expect(routeCompileBandSchema.safeParse("not-a-band").success).toBe(false);
  });

  it.each([[], ["not-a-band"], ["20m", "not-a-band"], ["20m", "20m"], ["20m", "40m", "20m"], ["20M"], [" 20m "], [""], ["__proto__"], ["constructor"], ["toString"], [20], [null], "20m", null])("rejects unsupported, empty, duplicate or malformed bands %j", (bands) => {
    expect(parseOptions({ bands }).success).toBe(false);
  });

  it.each(["WSPR", "FT8", "FT4", "CW", "DATA", "RTTY", "SSB", "AM", "FM"])("accepts engine mode %s and normalizes only whitespace/case", (mode) => {
    const result = routeCompileRequestSchema.parse({ ...identity, options: { mode: ` ${mode.toLowerCase()} ` } });
    expect(result.options?.mode).toBe(mode);
    expect(routeCompileModeSchema.parse(` ${mode.toLowerCase()} `)).toBe(mode);
  });

  it.each(["bogus", "", "   ", "USB", "LSB", "PSK31", "__proto__", "constructor", 1, null])("rejects mode %j rather than using a generic engine assumption", (mode) => {
    expect(parseOptions({ mode }).success).toBe(false);
    expect(routeCompileModeSchema.safeParse(mode).success).toBe(false);
  });

  it("accepts boundary values, zero bearing/elevation, and explicit false", () => {
    expect(parseOptions({ targetBearingDeg: 0, takeoffAngleDeg: 0, localNoiseFloorDbm: -200, preferTestedSpecs: false }).success).toBe(true);
    expect(parseOptions({ targetBearingDeg: 360, takeoffAngleDeg: 90, localNoiseFloorDbm: 0, preferTestedSpecs: true }).success).toBe(true);
    const result = routeCompileRequestSchema.parse({ ...identity, options: { targetBearingDeg: 123.5, takeoffAngleDeg: 12.75, localNoiseFloorDbm: -115.5 } });
    expect(result.options).toEqual({ targetBearingDeg: 123.5, takeoffAngleDeg: 12.75, localNoiseFloorDbm: -115.5 });
  });

  it.each(["targetBearingDeg", "takeoffAngleDeg", "localNoiseFloorDbm"])("rejects nonfinite and coerced input for %s", (key) => {
    for (const value of [NaN, Infinity, -Infinity, "0", null, false]) {
      expect(parseOptions({ [key]: value }).success, `${key}: ${String(value)}`).toBe(false);
    }
  });

  it.each([
    ["targetBearingDeg", -0.01], ["targetBearingDeg", 360.01],
    ["takeoffAngleDeg", -0.01], ["takeoffAngleDeg", 90.01],
  ])("rejects out-of-range %s = %s instead of clamping it", (key, value) => {
    expect(parseOptions({ [key]: value }).success).toBe(false);
  });

  it("requires finite noise without imposing an undocumented physical range", () => {
    for (const localNoiseFloorDbm of [-250, 10, -Number.MAX_VALUE, Number.MAX_VALUE]) {
      expect(routeCompileRequestSchema.parse({ ...identity, options: { localNoiseFloorDbm } }).options?.localNoiseFloorDbm).toBe(localNoiseFloorDbm);
    }
  });

  it("rejects missing identities, malformed options, extra fields and coerced preference", () => {
    for (const input of [null, {}, { routeId: "main" }, { ...identity, revisionId: " " }, { ...identity, routeId: 1 }, { ...identity, unknown: true }, { ...identity, options: null }, { ...identity, options: [] }, { ...identity, options: { frequencyHz: 14e6 } }, { ...identity, options: { preferTestedSpecs: "false" } }]) {
      expect(routeCompileRequestSchema.safeParse(input).success).toBe(false);
    }
  });
});

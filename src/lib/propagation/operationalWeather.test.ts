import { describe, expect, it } from "vitest";
import {
  buildOperationalWeather,
  type OperationalSolarSnapshot,
} from "./operationalWeather";

const issue = new Date("2026-07-15T18:00:00Z");

function snapshot(
  observed: Record<string, string | null>,
  values: Partial<OperationalSolarSnapshot>,
): OperationalSolarSnapshot {
  return {
    captured_at: "2026-07-15T17:59:00Z",
    source_observed_at: observed,
    ...values,
  };
}

describe("operational weather builder", () => {
  it("does not treat a fresh fetch as a fresh upstream observation", () => {
    const result = buildOperationalWeather(
      [
        snapshot(
          { magnetic_field: "2026-07-15T12:00:00Z", f107: "2026-07-15T17:00:00Z" },
          { bz_gsm: -8, sfi: 145 },
        ),
      ],
      issue,
    );
    expect(result.values.bz_gsm).toBeUndefined();
    expect(result.values.f107).toBe(145);
    expect(result.sourceObservedAgesSeconds.f107).toBe(3600);
    expect(result.sourceReceiptAgesSeconds.f107).toBe(60);
  });

  it("selects latest source values and computes legal backward windows", () => {
    const result = buildOperationalWeather(
      [
        snapshot(
          {
            kp: "2026-07-15T14:30:00Z",
            magnetic_field: "2026-07-15T15:30:00Z",
            dst: "2026-07-15T13:00:00Z",
          },
          { kp_index: 4, bz_gsm: -3, dst_index: -20 },
        ),
        snapshot(
          {
            kp: "2026-07-15T17:55:00Z",
            magnetic_field: "2026-07-15T17:55:00Z",
            dst: "2026-07-15T17:00:00Z",
          },
          { kp_index: 2, bz_gsm: 1, dst_index: -5 },
        ),
      ],
      issue,
    );
    expect(result.values.kp).toBe(2);
    expect(result.values.kp_delta_3h).toBe(-2);
    expect(result.values.kp_max_24h).toBe(4);
    expect(result.values.bz_min_3h).toBe(-3);
    expect(result.values.dst_min_6h).toBe(-20);
    expect(result.watermarkAt).toBe(Date.parse("2026-07-15T17:00:00Z"));
  });

  it("rejects future observations and values received after issue time", () => {
    const result = buildOperationalWeather(
      [
        snapshot({ kp: "2026-07-15T18:01:00Z" }, { kp_index: 9 }),
        {
          ...snapshot({ kp: "2026-07-15T17:59:00Z" }, { kp_index: 8 }),
          captured_at: "2026-07-15T18:02:00Z",
        },
      ],
      issue,
    );
    expect(result.values.kp).toBeUndefined();
    expect(result.sourceObservedAgesSeconds).toEqual({});
    expect(result.sourceReceiptAgesSeconds).toEqual({});
    expect(result.sourceAvailableAt).toEqual({});
  });
});

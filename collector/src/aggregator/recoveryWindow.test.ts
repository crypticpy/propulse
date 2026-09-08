import { describe, expect, it } from "vitest";
import {
  assertRetainedHour,
  MAX_RECOVERY_HOURS,
  planRecoveryWindow,
} from "./recoveryWindow.js";

const at = (iso: string) => new Date(iso);

describe("planRecoveryWindow", () => {
  it("replays the current eligible watermark to absorb late arrivals", () => {
    const plan = planRecoveryWindow(
      at("2026-09-07T10:30:00Z"),
      at("2026-09-07T09:00:00Z"),
      "2026-09-07T09:00:00Z",
    );
    expect(plan.hoursToProcess.map((hour) => hour.toISOString())).toEqual([
      "2026-09-07T09:00:00.000Z",
    ]);
    expect(plan.expiredMissing.count).toBe(0);
  });

  it("skips an expired outage without freezing the newest retained hour", () => {
    const plan = planRecoveryWindow(
      at("2026-09-07T12:30:00Z"),
      at("2026-09-07T11:00:00Z"),
      "2026-09-07T07:00:00Z",
    );
    expect(plan.hoursToProcess.map((hour) => hour.toISOString())).toEqual([
      "2026-09-07T11:00:00.000Z",
    ]);
    expect(plan.expiredMissing).toEqual({
      count: 3,
      from: "2026-09-07T08:00:00.000Z",
      to: "2026-09-07T10:00:00.000Z",
    });
  });

  it("starts fresh with every settled hour that is still wholly retained", () => {
    const plan = planRecoveryWindow(
      at("2026-09-07T10:20:00Z"),
      at("2026-09-07T09:00:00Z"),
      null,
    );
    expect(plan.hoursToProcess.map((hour) => hour.toISOString())).toEqual([
      "2026-09-07T09:00:00.000Z",
    ]);
    expect(plan.expiredMissing.count).toBe(0);
  });

  it("returns no safe hour at the safety cutoff", () => {
    const plan = planRecoveryWindow(
      at("2026-09-07T10:00:00Z"),
      at("2026-09-07T08:00:00Z"),
      "2026-09-07T07:00:00Z",
    );
    expect(plan.hoursToProcess).toEqual([]);
    expect(plan.expiredMissing.count).toBe(1);
    expect(() => assertRetainedHour(
      at("2026-09-07T08:00:00Z"),
      at("2026-09-07T10:00:00Z"),
    )).toThrow("outside the retained raw window");
  });

  it("does not mistake a partially retained hour for safe recovery", () => {
    const plan = planRecoveryWindow(
      at("2026-09-07T10:05:00Z"),
      at("2026-09-07T08:00:00Z"),
      "2026-09-07T07:00:00Z",
    );
    expect(plan.hoursToProcess).toEqual([]);
    expect(plan.expiredMissing.to).toBe("2026-09-07T08:00:00.000Z");
  });

  it("refuses an incomplete hour at the pre-RPC assertion", () => {
    expect(() => assertRetainedHour(
      at("2026-09-07T10:00:00Z"),
      at("2026-09-07T10:30:00Z"),
    )).toThrow("is not complete");
  });

  it.each([
    ["invalid", "last watermark must be a valid timestamp"],
    ["2026-09-07T09:30:00Z", "last watermark must be UTC-hour aligned"],
    ["2026-09-07T10:00:00Z", "ahead of the latest settled hour"],
  ])("rejects invalid or future watermark %s", (watermark, message) => {
    expect(() => planRecoveryWindow(
      at("2026-09-07T10:30:00Z"),
      at("2026-09-07T09:00:00Z"),
      watermark,
    )).toThrow(message);
  });

  it("reports an unbounded outage arithmetically and caps retained work", () => {
    const plan = planRecoveryWindow(
      at("2026-09-07T12:30:00Z"),
      at("2026-09-07T11:00:00Z"),
      "2020-01-01T00:00:00Z",
    );
    expect(plan.expiredMissing.count).toBeGreaterThan(50_000);
    expect(plan.hoursToProcess.length).toBeLessThanOrEqual(MAX_RECOVERY_HOURS);
    expect(plan.hoursToProcess.at(-1)?.toISOString()).toBe(
      "2026-09-07T11:00:00.000Z",
    );
  });
});

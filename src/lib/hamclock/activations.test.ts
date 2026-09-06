import { expect, it } from "vitest";
import { activationSourceState, activationSourceTime, currentActivations } from "./activations";
import type { ActivationSpot } from "@/types/activationSpots";
const now = Date.parse("2026-09-06T22:00:00Z");
const spot: ActivationSpot = { id: "a", program: "POTA", callsign: "N0TEST", reference: "US-1", referenceName: "Test", frequencyKHz: 14074, mode: "FT8", comments: "", spotter: "W0TEST", spottedAt: new Date(now - 60_000).toISOString() };
it("expires cached rows and keeps the latest report for each programme/call/reference", () => {
  const newest = { ...spot, id: "new", frequencyKHz: 7074, spottedAt: new Date(now).toISOString() };
  expect(currentActivations([spot, newest, { ...spot, id: "old", reference: "US-2", spottedAt: new Date(now - 3 * 3600_000).toISOString() }, { ...spot, id: "future", reference: "US-3", spottedAt: new Date(now + 3600_000).toISOString() }], now)).toEqual([newest]);
  expect(currentActivations([spot], now, "SOTA")).toEqual([]);
});
it("does not replace missing or failed source timing with the aggregate clock", () => {
  const source = { program: "POTA" as const, status: "ok" as const, source: "POTA", sourceUrl: "https://pota.app/", count: 0 };
  expect(activationSourceTime(source, now)).toBeNull();
  expect(activationSourceState(source, now)).toBe("TIME UNKNOWN");
  expect(activationSourceState({ ...source, fetchedAt: new Date(now - 3600_000).toISOString() }, now)).toBe("STALE");
  expect(activationSourceTime({ ...source, status: "unavailable", fetchedAt: new Date(now).toISOString() }, now)).toBeNull();
});

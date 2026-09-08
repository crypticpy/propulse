import { expect, it } from "vitest";
import { normalizeMapSpotAge, spotWithinAge, spotFeedState } from "./spotAge";
const now = Date.parse("2026-09-07T02:00:00Z");
it("preserves inclusive age boundaries and excludes invalid/future observations", () => {
  expect(spotWithinAge(new Date(now - 900000), 15, now)).toBe(true);
  expect(spotWithinAge(new Date(now - 900001), 15, now)).toBe(false);
  expect(spotWithinAge(new Date(now + 1), 60, now)).toBe(false);
  expect(spotWithinAge(new Date(NaN), 60, now)).toBe(false);
  for (const value of [NaN, 0, 120, 1440]) expect(normalizeMapSpotAge(value)).toBe(30);
});
it("keeps freshness, missing metadata and refetch failure distinct", () => {
  const meta = { source: "rbn" as const, status: "ok" as const, observedAt: now - 1800000, fetchedAt: now, staleAfterSeconds: 1800, windowMinutes: 60 as const };
  expect(spotFeedState(meta, true, false, false, now)).toBe("CURRENT");
  expect(spotFeedState(meta, true, false, false, now + 1)).toBe("STALE");
  expect(spotFeedState(meta, true, false, true, now)).toBe("STALE");
  expect(spotFeedState(undefined, true, false, true, now)).toBe("UNAVAILABLE");
  expect(spotFeedState({ ...meta, status: "unknown" }, true, false, false, now)).toBe("UNKNOWN");
  expect(spotFeedState(meta, false, false, false, now)).toBe("OFF");
});

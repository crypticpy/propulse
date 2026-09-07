import { expect, it } from "vitest";
import type { BandActivitySnapshot, BandActivityStatus } from "@/hooks/useBandActivity";
import { liveBandSlots, recordLiveBandSample } from "./liveBandHistory";
const now = Date.parse("2026-09-06T20:35:00Z");
const data = (at: number, count = 8) => Object.assign(new Map([["20m", { band: "20m", count10mRecent: count } as BandActivityStatus]]), { fetchedAt: at }) as BandActivitySnapshot;
it("retains one latest observation per slot without summing overlapping windows", () => {
  let samples = recordLiveBandSample([], data(now - 60_000), now);
  samples = recordLiveBandSample(samples, data(now, 12), now);
  samples = recordLiveBandSample(samples, data(now - 120_000, 99), now);
  expect(samples).toEqual([{ at: now, counts: { "20m": 12 } }]);
  expect(liveBandSlots(samples, now).map((slot) => slot.sample?.counts["20m"])).toEqual([undefined, undefined, undefined, 12, undefined, undefined]);
});
it("does not backfill missing slots and distinguishes measured zero from unknown and future", () => {
  const slots = liveBandSlots(recordLiveBandSample([], data(now, 0), now), now);
  expect(slots[0].sample).toBeUndefined();
  expect(slots[0].future).toBe(false);
  expect(slots[3].sample?.counts["20m"]).toBe(0);
  expect(slots[5].future).toBe(true);
});
it("drops old hours and rejects future, invalid and empty snapshots", () => {
  const previous = recordLiveBandSample([], data(now), now);
  expect(recordLiveBandSample(previous, data(now), now + 3_600_000)).toEqual([]);
  expect(recordLiveBandSample([], data(now + 1), now)).toEqual([]);
  expect(recordLiveBandSample([], data(now, -1), now)).toEqual([]);
  expect(recordLiveBandSample([], Object.assign(new Map(), { fetchedAt: now }), now)).toEqual([]);
});

import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { BandHistoryChart } from "@/components/map/hamclock/wall/reports/BandHistoryChart";
import { HF_BANDS } from "../../../collector/src/transforms/bands";
import { expect, it } from "vitest";
import type { BandActivitySnapshot, BandActivityStatus } from "@/hooks/useBandActivity";
import { hasCollectedBandCoverage, liveBandSlots, recordLiveBandSample } from "./liveBandHistory";
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

it("recognizes complete collector HF coverage in completed hours and live samples", () => {
  const start = Date.parse("2026-09-06T20:00:00Z");
  render(createElement(BandHistoryChart, { snapshot: {
    scope: "global", fetchedAt: new Date(start).toISOString(),
    windowStart: new Date(start-6*3_600_000).toISOString(), windowEnd: new Date(start).toISOString(),
    rows: Array.from({length:6},(_,i)=>HF_BANDS.map(band=>({hour:new Date(start-(6-i)*3_600_000).toISOString(),band,count:1,sources:{},modes:{}}))).flat(),
  }, live: {
    now: start+59*60_000,
    samples: Array.from({length:6},(_,i)=>({at:start+i*600_000,counts:Object.fromEntries(HF_BANDS.map(band=>[band,1]))})),
  } }));
  expect(screen.getByText(/GLOBAL · 6 COMPLETED HOURS · PEAK 10/)).toBeTruthy();
  expect(screen.queryByText("PARTIAL")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"VIEW CURRENT-HOUR SAMPLES"}));
  expect(screen.getByText(/GLOBAL · 10 MIN AT SAMPLE TIME · PEAK 10/)).toBeTruthy();
  expect(screen.queryByText("PARTIAL")).toBeNull();
});

it("does not replace a missing HF band with duplicate or VHF rows", () => {
  const missing = HF_BANDS.slice(1).map(band=>({band}));
  expect(hasCollectedBandCoverage([...missing,{band:"80m"},{band:"6m"},{band:"2m"}])).toBe(false);
  expect(hasCollectedBandCoverage(HF_BANDS.map(band=>({band})))).toBe(true);
});

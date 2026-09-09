import { expect, it } from "vitest";
import { clusterRequestWindow, filterClusterAge } from "./clusterHistory";
import type { DXSpot } from "@/types/dxcluster";
it("covers the selected list age using only bounded supported requests", () => {
  for (const [age, window] of [[5,15],[15,15],[30,30],[60,60],[120,120],[0,120],[NaN,30],[-1,30],[Infinity,30]]) {
    expect(clusterRequestWindow(age)).toBe(window);
  }
  expect(clusterRequestWindow()).toBe(30);
});
it("keeps the inclusive original-time boundary and excludes invalid or future observations", () => {
  const now = Date.UTC(2026,8,7);
  const spots = [now, now-300_000, now-300_001, now+1, NaN].map((time,i)=>({ id:String(i), time:new Date(time) } as DXSpot));
  expect(filterClusterAge(spots,5,now).map(s=>s.id)).toEqual(["0","1"]);
  expect(filterClusterAge(spots,5,now+10_000).map(s=>s.id)).toEqual(["0","3"]);
});

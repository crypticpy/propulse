import { expect, it } from "vitest";
import { rankLoadedDx } from "./topDx";
import type { DXSpot } from "@/types/dxcluster";
const now = Date.parse("2026-09-06T20:00:30Z");
const spot = (id: string, extra: Partial<DXSpot> = {}): DXSpot => ({
  id,
  dx: "JA1ABC",
  spotter: "W1AW",
  frequency: 14074,
  time: new Date(now),
  comment: "",
  dxGrid: "PM95",
  ...extra,
});
it("ranks real loaded locations from home and excludes stale, future and prefix-only locations", () => {
  const result = rankLoadedDx(
    [
      spot("far"),
      spot("near", { dxGrid: "EM38" }),
      spot("old", { time: new Date(now - 61 * 60_000) }),
      spot("future", { time: new Date(now + 1) }),
      spot("approx", {
        dxGrid: undefined,
        dxLat: 35,
        dxLon: 139,
        dxLocApprox: true,
      }),
      spot("approx-grid", { dxLocApprox: true }),
      spot("missing", { dxGrid: undefined }),
    ],
    { lat: 38.5, lon: -93 },
    now,
  );
  expect(result.map((r) => r.spot.id)).toEqual(["far", "near"]);
  expect(result[0].km).toBeGreaterThan(9000);
});
it("deduplicates stable identities and accepts extended grids and zero coordinates", () => {
  const result = rankLoadedDx(
    [
      spot("same"),
      spot("same", { dxGrid: "PM95ab12" }),
      spot("zero", { dxGrid: undefined, dxLat: 0, dxLon: 0 }),
    ],
    { lat: 0, lon: 0 },
    now,
  );
  expect(result).toHaveLength(2);
  expect(result[1].km).toBe(0);
});

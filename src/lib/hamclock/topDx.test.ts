import { createElement } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BandTopDx } from "@/components/map/hamclock/wall/reports/BandTopDx";
import { useDXStore } from "@/stores/dxStore";
import { useMapStore } from "@/stores/mapStore";
import { useRigStore } from "@/stores/rigStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { afterEach, expect, it, vi } from "vitest";
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


vi.mock("@/hooks/useActiveLocation", () => ({ useActiveLocation: () => ({ lat: 38.5, lon: -93, grid: "EM38" }) }));
vi.mock("@/hooks/useUTCClock", () => ({ useUTCClock: () => new Date("2026-09-06T20:00:30Z") }));
const previous = { dx: useDXStore.getState(), map: useMapStore.getState(), rig: useRigStore.getState(), settings: useSettingsStore.getState() };
afterEach(() => {
  useDXStore.setState(previous.dx);
  useMapStore.setState(previous.map);
  useRigStore.setState(previous.rig);
  useSettingsStore.setState(previous.settings);
});
it("keeps map selection separate from exact frequency and mode staging after rows arrive", async () => {
  useDXStore.setState({ spots: [], spotSource: "rest", selectedSpot: null });
  useMapStore.setState({ target: null });
  useSettingsStore.setState({ bridgeEnabled: true });
  useRigStore.setState({ catEnabled: true, connected: true, bridgeConnected: true, pendingFrequency: null, pendingMode: null });
  render(createElement(BandTopDx));
  expect(screen.getByText("NO LOCATED SPOTS IN WINDOW")).toBeTruthy();
  act(() => useDXStore.setState({ spots: [spot("tune", { frequency: 14074.125, mode: "CW" })] }));
  const tune = await screen.findByRole("button", { name: "Tune 14.074125 MHz CW" });
  expect(tune.parentElement?.closest("button")).toBeNull();
  fireEvent.click(tune);
  expect(useRigStore.getState().pendingFrequency).toBe(14_074_125);
  expect(useRigStore.getState().pendingMode).toBe("CW");
  expect(useMapStore.getState().target).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /JA1ABC/ }));
  expect(useMapStore.getState().target?.grid).toBe("PM95");
  expect(useDXStore.getState().selectedSpot?.id).toBe("tune");
});
it("uses bridge clock tolerance for TOP DX but keeps REST strict", () => {
  useDXStore.setState({ spots: [spot("future", { time: new Date(now + 30_000) })], spotSource: "bridge" });
  render(createElement(BandTopDx));
  expect(screen.getByRole("button", { name: /JA1ABC/ })).toBeTruthy();
  act(() => useDXStore.setState({ spotSource: "rest" }));
  expect(screen.getByText("NO LOCATED SPOTS IN WINDOW")).toBeTruthy();
  expect(rankLoadedDx([spot("too-far", { time: new Date(now + 60_001) })], { lat: 0, lon: 0 }, now, 60_000)).toEqual([]);
});

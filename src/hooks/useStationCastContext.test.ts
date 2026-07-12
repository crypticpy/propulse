import { describe, expect, it } from "vitest";
import { resolveStationCastLocation } from "./useStationCastContext";
import type { StationPreset } from "@/types/shack";
import type { StationChain } from "@/types/stationChain";
import type { OperatingLocation } from "@/types/user";

const home: OperatingLocation = {
  id: "home",
  name: "Home",
  grid: "EM10",
  lat: 30,
  lon: -97,
  type: "home",
  createdAt: "2026-01-01T00:00:00Z",
};
const field: OperatingLocation = {
  ...home,
  id: "field",
  name: "Field",
  grid: "EM11",
  type: "portable",
};

describe("resolveStationCastLocation", () => {
  it("uses a chain-linked operating location before the global active location", () => {
    const chain = { linkedLocationId: "field" } as StationChain;
    expect(resolveStationCastLocation(home, [home, field], chain, null)).toEqual({
      location: field,
      source: "chain_link",
    });
  });

  it("uses a preset link and falls back safely when a stale link is missing", () => {
    const preset = { linkedLocationId: "field" } as StationPreset;
    expect(resolveStationCastLocation(home, [home, field], null, preset).source).toBe(
      "preset_link",
    );
    expect(
      resolveStationCastLocation(
        home,
        [home],
        { linkedLocationId: "deleted" } as StationChain,
        null,
      ),
    ).toEqual({ location: home, source: "active_location" });
  });
});
